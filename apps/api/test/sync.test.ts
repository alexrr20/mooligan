import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { FetchHttpClient, KeyValueStore } from "@effect/platform";
import { makeHttpSync } from "@livestore/sync-cf/client";
import { SyncMessage } from "@livestore/sync-cf/common";
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
    new Request(`${apiOrigin}/api/workspace/sync-credential`, { headers, method: "POST" }),
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

test("sync rejects malformed, expired, wrong-audience, and wrongly signed credentials", async () => {
  const user = await authenticatedTestUser("sync-invalid@example.com");
  const workspaceId = crypto.randomUUID();
  await bindPersonalWorkspace(env.DB, user.userId, workspaceId);
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
  const firstWorkspaceId = crypto.randomUUID();
  const secondWorkspaceId = crypto.randomUUID();
  await bindPersonalWorkspace(env.DB, first.userId, firstWorkspaceId);
  await bindPersonalWorkspace(env.DB, second.userId, secondWorkspaceId);
  const { credential } = await issueSyncCredential(env, first.userId, firstWorkspaceId);
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
  const workspaceId = crypto.randomUUID();
  await bindPersonalWorkspace(env.DB, user.userId, workspaceId);
  const payload = {
    ...(await issueSyncCredential(env, user.userId, workspaceId)),
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

test("cross-account push and pull are rejected", async () => {
  const owner = await authenticatedTestUser("sync-owner@example.com");
  const other = await authenticatedTestUser("sync-cross-account@example.com");
  const ownerWorkspaceId = crypto.randomUUID();
  const otherWorkspaceId = crypto.randomUUID();
  await bindPersonalWorkspace(env.DB, owner.userId, ownerWorkspaceId);
  await bindPersonalWorkspace(env.DB, other.userId, otherWorkspaceId);
  const { credential } = await issueSyncCredential(env, owner.userId, ownerWorkspaceId);
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
