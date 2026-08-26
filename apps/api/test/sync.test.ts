import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { FetchHttpClient, KeyValueStore } from "@effect/platform";
import { makeHttpSync } from "@livestore/sync-cf/client";
import { SyncMessage } from "@livestore/sync-cf/common";
import { workspaceEventSchemaVersion, workspaceIdForBindingSecret } from "@mooligan/workspace";
import { env, exports } from "cloudflare:workers";
import { Chunk, Effect, Option, Schema, Stream } from "effect";
import { SignJWT } from "jose";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports -- Cloudflare's pool must share Vitest's runner instance.
import { test, vi } from "vitest";
import { createExecutionContext, evictDurableObject } from "cloudflare:test";

import worker from "../src/index.ts";
import { issueSyncCredential, syncAudience, syncCredentialLifetimeSeconds } from "../src/sync.ts";
import { bindPersonalWorkspace } from "../src/workspace.ts";
import { authenticatedTestUser } from "./auth-helpers.ts";

const apiOrigin = "http://127.0.0.1:3000";

test("the workspace endpoint issues a five-minute credential with dedicated claims", async () => {
  const { headers } = await authenticatedTestUser("sync-credential@example.com");
  await exports.default.fetch(
    new Request(`${apiOrigin}/api/workspace`, { headers, method: "POST" }),
  );

  const response = await exports.default.fetch(
    new Request(`${apiOrigin}/api/workspace/sync-credential`, {
      body: JSON.stringify({
        appVersion: "0.0.0",
        eventSchemaVersion: workspaceEventSchemaVersion,
      }),
      headers: withJsonContentType(headers),
      method: "POST",
    }),
  );
  const body = await response.json<{ credential: string; expiresAt: number }>();
  const claims = JSON.parse(
    Buffer.from(body.credential.split(".")[1] ?? "", "base64url").toString("utf8"),
  );

  assert.equal(response.status, 200);
  assert.equal(claims.aud, syncAudience);
  assert.equal(claims.exp - claims.iat, syncCredentialLifetimeSeconds);
  assert.equal(body.expiresAt, claims.exp);
  assert.deepEqual(Object.keys(claims).sort(), ["aud", "exp", "iat", "sub", "workspaceId"]);
});

test("the workspace endpoint rejects clients below the minimum event schema version", async () => {
  const { headers } = await authenticatedTestUser("sync-old-client@example.com");
  await exports.default.fetch(
    new Request(`${apiOrigin}/api/workspace`, { headers, method: "POST" }),
  );

  const response = await exports.default.fetch(
    new Request(`${apiOrigin}/api/workspace/sync-credential`, {
      body: JSON.stringify({ appVersion: "0.0.0", eventSchemaVersion: 0 }),
      headers: withJsonContentType(headers),
      method: "POST",
    }),
  );

  assert.equal(response.status, 426);
  assert.deepEqual(await response.json(), {
    error: "client_upgrade_required",
    message: "Update Mooligan before using Workspace sync.",
    minimumEventSchemaVersion: workspaceEventSchemaVersion,
  });
});

test("the workspace endpoint rejects clients above the maximum event schema version", async () => {
  const { headers } = await authenticatedTestUser("sync-new-client@example.com");
  await exports.default.fetch(
    new Request(`${apiOrigin}/api/workspace`, { headers, method: "POST" }),
  );

  const response = await exports.default.fetch(
    new Request(`${apiOrigin}/api/workspace/sync-credential`, {
      body: JSON.stringify({
        appVersion: "newer-client",
        eventSchemaVersion: workspaceEventSchemaVersion + 1,
      }),
      headers: withJsonContentType(headers),
      method: "POST",
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "server_upgrade_required",
    maximumEventSchemaVersion: workspaceEventSchemaVersion,
    message: "The Workspace sync service must be updated before this version can synchronize.",
  });
});

test("the credential issuer rejects event schema versions outside its supported range", async () => {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();

  await assert.rejects(
    issueSyncCredential(env, userId, workspaceId, "old-client", workspaceEventSchemaVersion - 1),
    /desktop client is too old/u,
  );
  await assert.rejects(
    issueSyncCredential(env, userId, workspaceId, "new-client", workspaceEventSchemaVersion + 1),
    /sync server is too old/u,
  );
});

test("sync rejects malformed, expired, wrong-audience, and wrongly signed credentials", async () => {
  const user = await authenticatedTestUser("sync-invalid@example.com");
  const workspaceId = await bindTestWorkspace(user.userId);
  const now = Math.floor(Date.now() / 1_000);
  const invalidCredentials = [
    "not-a-jwt",
    await customCredential({
      audience: syncAudience,
      expiresAt: now - 1,
      issuedAt: now - syncCredentialLifetimeSeconds - 1,
      secret: env.SYNC_CREDENTIAL_SECRET,
      userId: user.userId,
      workspaceId,
    }),
    await customCredential({
      audience: "wrong-audience",
      expiresAt: now + syncCredentialLifetimeSeconds,
      issuedAt: now,
      secret: env.SYNC_CREDENTIAL_SECRET,
      userId: user.userId,
      workspaceId,
    }),
    await customCredential({
      audience: syncAudience,
      expiresAt: now + syncCredentialLifetimeSeconds,
      issuedAt: now,
      secret: "wrong-sync-secret-".repeat(3),
      userId: user.userId,
      workspaceId,
    }),
  ];

  for (const credential of invalidCredentials) {
    const response = await openSync(workspaceId, { credential, workspaceId });
    assert.equal(response.status, 400);
  }
});

test("a credential cannot authorize another LiveStore store ID", async () => {
  const first = await authenticatedTestUser("sync-first@example.com");
  const second = await authenticatedTestUser("sync-second@example.com");
  const firstWorkspaceId = await bindTestWorkspace(first.userId);
  const secondWorkspaceId = await bindTestWorkspace(second.userId);
  const { credential } = await issueCurrentCredential(first.userId, firstWorkspaceId);
  const authorized = await openSync(firstWorkspaceId, {
    credential,
    workspaceId: firstWorkspaceId,
  });

  const response = await openSync(secondWorkspaceId, {
    credential,
    workspaceId: firstWorkspaceId,
  });

  assert.equal(authorized.status, 101);
  assert.ok(authorized.webSocket);
  authorized.webSocket.accept();
  authorized.webSocket.close(1000, "test-complete");
  assert.equal(response.status, 400);
});

test("authorized push and pull survive Durable Object eviction", async () => {
  const user = await authenticatedTestUser("sync-round-trip@example.com");
  const workspaceId = await bindTestWorkspace(user.userId);
  const payload = {
    ...(await issueCurrentCredential(user.userId, workspaceId)),
    workspaceId,
  };
  const syncPayload = { credential: payload.credential, workspaceId };
  const event = Schema.decodeUnknownSync(SyncMessage.PushRequest)({
    backendId: { _tag: "None" },
    batch: [
      {
        args: { policy: "show" },
        clientId: "round-trip-client",
        name: "v1.SpoilerPolicyChanged",
        parentSeqNum: 0,
        seqNum: 1,
        sessionId: "round-trip-session",
      },
    ],
  }).batch;
  const fetchMock = routeFetchThroughWorker();

  try {
    await runSync(workspaceId, syncPayload, (backend) =>
      Effect.gen(function* () {
        yield* backend.push(event);
      }),
    );

    const stub = env.SYNC_BACKEND.get(env.SYNC_BACKEND.idFromName(workspaceId));
    await evictDurableObject(stub, { webSockets: "close" });

    const pulled = await runSync(workspaceId, syncPayload, (backend) =>
      Effect.gen(function* () {
        const pages = yield* backend.pull(Option.none()).pipe(Stream.runCollect);
        return Chunk.toReadonlyArray(pages).flatMap((page) => page.batch);
      }),
    );

    assert.equal(pulled.length, 1);
    assert.deepEqual(pulled[0]?.eventEncoded, event[0]);
  } finally {
    fetchMock.mockRestore();
  }
});

test("invalid Workspace events are rejected before they enter the remote event log", async () => {
  const user = await authenticatedTestUser("sync-invalid-event@example.com");
  const workspaceId = await bindTestWorkspace(user.userId);
  const { credential } = await issueCurrentCredential(user.userId, workspaceId);
  const payload = { credential, workspaceId };
  const invalidEvent = Schema.decodeUnknownSync(SyncMessage.PushRequest)({
    backendId: { _tag: "None" },
    batch: [
      {
        args: { policy: "invalid-policy" },
        clientId: "invalid-event-client",
        name: "v1.SpoilerPolicyChanged",
        parentSeqNum: 0,
        seqNum: 1,
        sessionId: "invalid-event-session",
      },
    ],
  }).batch;
  const fetchMock = routeFetchThroughWorker();

  try {
    await assert.rejects(
      runSync(workspaceId, payload, (backend) =>
        Effect.gen(function* () {
          yield* backend.push(invalidEvent);
        }),
      ),
    );

    const pulled = await runSync(workspaceId, payload, (backend) =>
      Effect.gen(function* () {
        const pages = yield* backend.pull(Option.none()).pipe(Stream.runCollect);
        return Chunk.toReadonlyArray(pages).flatMap((page) => page.batch);
      }),
    );
    assert.deepEqual(pulled, []);
  } finally {
    fetchMock.mockRestore();
  }
});

test("cross-account push and pull are rejected", async () => {
  const owner = await authenticatedTestUser("sync-owner@example.com");
  const other = await authenticatedTestUser("sync-cross-account@example.com");
  const ownerWorkspaceId = await bindTestWorkspace(owner.userId);
  const otherWorkspaceId = await bindTestWorkspace(other.userId);
  const { credential } = await issueCurrentCredential(owner.userId, ownerWorkspaceId);
  const payload = { credential, workspaceId: ownerWorkspaceId };
  const event = Schema.decodeUnknownSync(SyncMessage.PushRequest)({
    backendId: { _tag: "None" },
    batch: [
      {
        args: { policy: "protect" },
        clientId: "cross-account-client",
        name: "v1.SpoilerPolicyChanged",
        parentSeqNum: 0,
        seqNum: 1,
        sessionId: "cross-account-session",
      },
    ],
  }).batch;
  const fetchMock = routeFetchThroughWorker();

  try {
    await assert.rejects(
      runSync(otherWorkspaceId, payload, (backend) =>
        Effect.gen(function* () {
          yield* backend.push(event);
        }),
      ),
    );
    await assert.rejects(
      runSync(otherWorkspaceId, payload, (backend) =>
        Effect.gen(function* () {
          yield* backend.pull(Option.none()).pipe(Stream.runCollect);
        }),
      ),
    );
  } finally {
    fetchMock.mockRestore();
  }
});

test("auth routes work without the sync Durable Object binding", async () => {
  const environmentWithoutSync = {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_TRUSTED_ORIGINS: env.BETTER_AUTH_TRUSTED_ORIGINS,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    DB: env.DB,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    SYNC_CREDENTIAL_SECRET: env.SYNC_CREDENTIAL_SECRET,
  };

  // SAFETY: this test intentionally omits SYNC_BACKEND to exercise the API-only branch.
  const response = await worker.fetch(
    new Request(`${apiOrigin}/api/auth/get-session`),
    environmentWithoutSync as Env,
    createExecutionContext(),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
});

function openSync(storeId: string, payload: { credential: string; workspaceId: string }) {
  const search = new URLSearchParams({
    payload: JSON.stringify(payload),
    storeId,
    transport: "ws",
  });
  return exports.default.fetch(
    new Request(`${apiOrigin}/api/sync?${search.toString()}`, {
      headers: { upgrade: "websocket" },
    }),
  );
}

async function bindTestWorkspace(userId: string) {
  const bindingSecret = crypto.randomUUID();
  const workspaceId = workspaceIdForBindingSecret(bindingSecret);
  await bindPersonalWorkspace(env.DB, userId, workspaceId, bindingSecret);
  return workspaceId;
}

function issueCurrentCredential(userId: string, workspaceId: string) {
  return issueSyncCredential(env, userId, workspaceId, "0.0.0", workspaceEventSchemaVersion);
}

function withJsonContentType(headers: Headers) {
  const next = new Headers(headers);
  next.set("content-type", "application/json");
  return next;
}

function customCredential({
  audience,
  expiresAt,
  issuedAt,
  secret,
  userId,
  workspaceId,
}: {
  audience: string;
  expiresAt: number;
  issuedAt: number;
  secret: string;
  userId: string;
  workspaceId: string;
}) {
  return new SignJWT({ workspaceId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
}

function routeFetchThroughWorker() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return exports.default.fetch(request);
  });
}

type HttpSyncBackend = Effect.Effect.Success<ReturnType<ReturnType<typeof makeHttpSync>>>;

function runSync<A>(
  storeId: string,
  payload: { credential: string; workspaceId: string },
  operation: (backend: HttpSyncBackend) => Effect.Effect<A, unknown>,
) {
  const backend = makeHttpSync({
    headers: { authorization: `Bearer ${payload.credential}` },
    ping: { enabled: false },
    url: `${apiOrigin}/api/sync`,
  });

  return Effect.gen(function* () {
    const connected = yield* backend({ clientId: crypto.randomUUID(), payload, storeId });
    return yield* operation(connected);
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(KeyValueStore.layerMemory),
    Effect.scoped,
    Effect.runPromise,
  );
}
