import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { env, exports } from "cloudflare:workers";
import { makeSignature } from "better-auth/crypto";
import { v7 as uuidv7, version as uuidVersion } from "uuid";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports -- Cloudflare's pool must share Vitest's runner instance.
import { test } from "vitest";

import { createAuth } from "../src/auth.ts";

const initialSpoilerState = { policy: "protect" as const, resetGeneration: 0 };

test("sync routes require a Better Auth session", async () => {
  const responses = await Promise.all([
    request("/sync/workspace/bind", {
      body: { localWorkspaceId: randomUUID() },
      method: "POST",
    }),
    request("/sync/preferences"),
    request("/sync/preferences", {
      body: { updates: [{ key: "motion", value: "full" }] },
      method: "POST",
    }),
  ]);

  assert.deepEqual(
    responses.map(({ status }) => status),
    [401, 401, 401],
  );
});

test("binding creates one UUIDv7 workspace and merges without overwriting cloud data", async () => {
  const headers = await sessionHeaders();
  const firstLocalWorkspaceId = randomUUID();
  const first = await request("/sync/workspace/bind", {
    body: {
      localWorkspaceId: firstLocalWorkspaceId,
      preferences: { motion: "system" },
      spoilerState: initialSpoilerState,
    },
    headers,
    method: "POST",
  });
  const firstBody = await first.json<BindResponse>();

  assert.equal(first.status, 200);
  assert.equal(uuidVersion(firstBody.workspaceId), 7);
  assert.equal(firstBody.spoilerStateAccepted, true);
  assertPreference(firstBody.preferences.motion, "system", 1);

  const second = await request("/sync/workspace/bind", {
    body: {
      localWorkspaceId: randomUUID(),
      preferences: { motion: "full" },
      spoilerState: initialSpoilerState,
    },
    headers,
    method: "POST",
  });
  const secondBody = await second.json<BindResponse>();

  assert.equal(second.status, 200);
  assert.equal(secondBody.workspaceId, firstBody.workspaceId);
  assert.equal(secondBody.spoilerStateAccepted, false);
  assert.deepEqual(secondBody.preferences, firstBody.preferences);

  const retry = await request("/sync/workspace/bind", {
    body: {
      localWorkspaceId: firstLocalWorkspaceId,
      preferences: { motion: "reduced" },
      spoilerState: { policy: "show", resetGeneration: 99 },
    },
    headers,
    method: "POST",
  });
  const retryBody = await retry.json<BindResponse>();

  assert.equal(retry.status, 200);
  assert.equal(retryBody.workspaceId, firstBody.workspaceId);
  assert.equal(retryBody.spoilerStateAccepted, true);
  assert.deepEqual(retryBody.spoilerState, firstBody.spoilerState);
  assert.deepEqual(retryBody.preferences, firstBody.preferences);
});

test("the server versions and timestamps valid preference updates", async () => {
  const headers = await sessionHeaders();
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId: randomUUID(), spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });

  const first = await request("/sync/preferences", {
    body: { updates: [{ key: "motion", value: "full" }] },
    headers,
    method: "POST",
  });
  const firstBody = await first.json<PreferencesResponse>();

  assert.equal(first.status, 200);
  assertPreference(firstBody.preferences.motion, "full", 1);

  const second = await request("/sync/preferences", {
    body: { updates: [{ key: "motion", value: "reduced" }] },
    headers,
    method: "POST",
  });
  const secondBody = await second.json<PreferencesResponse>();

  assert.equal(second.status, 200);
  assertPreference(secondBody.preferences.motion, "reduced", 2);

  const concurrentResponses = await Promise.all([
    request("/sync/preferences", {
      body: { updates: [{ key: "motion", value: "full" }] },
      headers,
      method: "POST",
    }),
    request("/sync/preferences", {
      body: { updates: [{ key: "motion", value: "system" }] },
      headers,
      method: "POST",
    }),
  ]);
  const concurrentBodies = await Promise.all(
    concurrentResponses.map((response) => response.json<PreferencesResponse>()),
  );
  const versions = concurrentBodies
    .map(({ preferences }) => preferences.motion?.version)
    .sort((left, right) => (left ?? 0) - (right ?? 0));
  const winner = concurrentBodies.find(({ preferences }) => preferences.motion?.version === 4);

  assert.deepEqual(versions, [3, 4]);
  assert.ok(winner);

  const read = await request("/sync/preferences", { headers });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), winner);
});

test("spoiler conflicts and stale reveals resolve to protection", async () => {
  const headers = await sessionHeaders();
  const localWorkspaceId = randomUUID();
  const bind = await request("/sync/workspace/bind", {
    body: { localWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });
  const bound = await bind.json<BindResponse & { spoilerState: RemoteSpoilerState }>();
  assert.equal(bound.spoilerState.policy, "protect");
  assert.equal(bound.spoilerState.version, 1);

  const first = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [
        {
          baseVersion: null,
          generation: 0,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
        },
      ],
    }),
    headers,
    method: "POST",
  });
  const firstBody = await first.json<SpoilerUpdateResponse>();
  assert.equal(firstBody.decisions[0]?.state, "reveal");
  assert.equal(firstBody.decisions[0]?.version, 1);
  assert.equal(firstBody.state.version, 1);
  assert.equal(firstBody.snapshotVersion, 2);

  const concurrent = await Promise.all(
    ["reveal", "protect"].map((state) =>
      request("/sync/spoilers", {
        body: spoilerUpdate(localWorkspaceId, {
          decisions: [
            {
              baseVersion: 1,
              generation: 0,
              scope: "printing",
              state,
              targetId: "printing-a",
            },
          ],
        }),
        headers,
        method: "POST",
      }),
    ),
  );
  const concurrentBodies = await Promise.all(
    concurrent.map((response) => response.json<SpoilerUpdateResponse>()),
  );
  assert.deepEqual(
    concurrentBodies
      .map(({ decisions }) => decisions[0]?.version)
      .sort((left, right) => (left ?? 0) - (right ?? 0)),
    [2, 3],
  );
  assert.deepEqual(
    concurrentBodies.map(({ state }) => state.version),
    [1, 1],
  );
  assert.deepEqual(
    concurrentBodies
      .map(({ snapshotVersion }) => snapshotVersion)
      .sort((left, right) => left - right),
    [3, 4],
  );

  const reset = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [],
      state: { baseVersion: 1, policy: "protect", resetGeneration: 1 },
    }),
    headers,
    method: "POST",
  });
  const resetBody = await reset.json<SpoilerUpdateResponse>();
  assert.equal(resetBody.state?.resetGeneration, 1);

  const stale = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [
        {
          baseVersion: 3,
          generation: 0,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
        },
      ],
    }),
    headers,
    method: "POST",
  });
  const staleBody = await stale.json<SpoilerUpdateResponse>();
  assert.ok(staleBody.state);
  assert.equal(staleBody.decisions[0]?.generation, 1);
  assert.equal(staleBody.decisions[0]?.state, "protect");

  const show = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [],
      state: {
        baseVersion: staleBody.state.version,
        policy: "show",
        resetGeneration: 1,
      },
    }),
    headers,
    method: "POST",
  });
  assert.equal((await show.json<SpoilerUpdateResponse>()).state?.policy, "show");

  const ambiguousProtect = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [],
      state: { baseVersion: 1, policy: "protect", resetGeneration: 0 },
    }),
    headers,
    method: "POST",
  });
  const protectedState = await ambiguousProtect.json<SpoilerUpdateResponse>();
  assert.equal(protectedState.state?.policy, "protect");
  assert.equal(protectedState.state?.resetGeneration, 1);
});

test("an exact spoiler operation retry replays without advancing versions", async () => {
  const headers = await sessionHeaders();
  const localWorkspaceId = randomUUID();
  const operationId = randomUUID();
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });
  const body = spoilerUpdate(
    localWorkspaceId,
    {
      decisions: [
        {
          baseVersion: null,
          generation: 1,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
        },
      ],
      state: { baseVersion: 1, policy: "protect", resetGeneration: 1 },
    },
    operationId,
  );

  const first = await request("/sync/spoilers", { body, headers, method: "POST" });
  const firstBody = await first.json<SpoilerUpdateResponse>();
  const retry = await request("/sync/spoilers", { body, headers, method: "POST" });
  const retryBody = await retry.json<SpoilerUpdateResponse>();

  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(firstBody.operationId, operationId);
  assert.deepEqual(retryBody, firstBody);

  const read = await request("/sync/spoilers", { headers });
  const current = await read.json<{
    decisions: RemoteSpoilerDecision[];
    snapshotVersion: number;
    state: RemoteSpoilerState;
  }>();
  assert.equal(current.snapshotVersion, firstBody.snapshotVersion);
  assert.deepEqual(current.state, firstBody.state);
  assert.deepEqual(current.decisions, firstBody.decisions);
});

test("a spoiler retry replays its historical response after another binding writes", async () => {
  const headers = await sessionHeaders();
  const firstLocalWorkspaceId = randomUUID();
  const secondLocalWorkspaceId = randomUUID();
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId: firstLocalWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId: secondLocalWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });
  const operationId = randomUUID();
  const original = spoilerUpdate(
    firstLocalWorkspaceId,
    {
      decisions: [
        {
          baseVersion: null,
          generation: 0,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
        },
      ],
    },
    operationId,
  );
  const first = await request("/sync/spoilers", {
    body: original,
    headers,
    method: "POST",
  });
  const firstBody = await first.json<SpoilerUpdateResponse>();

  const newer = await request("/sync/spoilers", {
    body: spoilerUpdate(secondLocalWorkspaceId, {
      decisions: [
        {
          baseVersion: 1,
          generation: 0,
          scope: "printing",
          state: "protect",
          targetId: "printing-a",
        },
      ],
    }),
    headers,
    method: "POST",
  });
  const newerBody = await newer.json<SpoilerUpdateResponse>();
  assert.equal(newerBody.decisions[0]?.state, "protect");
  assert.equal(newerBody.decisions[0]?.version, 2);

  const retry = await request("/sync/spoilers", {
    body: original,
    headers,
    method: "POST",
  });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), firstBody);

  const read = await request("/sync/spoilers", { headers });
  const current = await read.json<{
    decisions: RemoteSpoilerDecision[];
    snapshotVersion: number;
  }>();
  assert.equal(current.snapshotVersion, newerBody.snapshotVersion);
  assert.deepEqual(current.decisions, newerBody.decisions);
});

test("reusing a spoiler operation ID with altered content cannot change remote state", async () => {
  const headers = await sessionHeaders();
  const localWorkspaceId = randomUUID();
  const operationId = randomUUID();
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });
  const original = spoilerUpdate(
    localWorkspaceId,
    {
      decisions: [
        {
          baseVersion: null,
          generation: 0,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
        },
      ],
    },
    operationId,
  );
  const first = await request("/sync/spoilers", {
    body: original,
    headers,
    method: "POST",
  });
  const firstBody = await first.json<SpoilerUpdateResponse>();

  const rejected = await request("/sync/spoilers", {
    body: spoilerUpdate(
      localWorkspaceId,
      {
        decisions: [
          {
            baseVersion: null,
            generation: 0,
            scope: "printing",
            state: "protect",
            targetId: "printing-a",
          },
        ],
        state: { baseVersion: 1, policy: "show", resetGeneration: 0 },
      },
      operationId,
    ),
    headers,
    method: "POST",
  });

  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "operation_id_reused" });

  const read = await request("/sync/spoilers", { headers });
  const current = await read.json<{
    decisions: RemoteSpoilerDecision[];
    snapshotVersion: number;
    state: RemoteSpoilerState;
  }>();
  assert.equal(current.snapshotVersion, firstBody.snapshotVersion);
  assert.deepEqual(current.state, firstBody.state);
  assert.deepEqual(current.decisions, firstBody.decisions);

  const retry = await request("/sync/spoilers", {
    body: original,
    headers,
    method: "POST",
  });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), firstBody);
});

test("a claimed version cannot create an absent reveal target", async () => {
  const headers = await sessionHeaders();
  const localWorkspaceId = randomUUID();
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });

  const response = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [
        {
          baseVersion: 7,
          generation: 0,
          scope: "printing",
          state: "reveal",
          targetId: "never-seen",
        },
      ],
    }),
    headers,
    method: "POST",
  });
  const body = await response.json<SpoilerUpdateResponse>();

  assert.equal(response.status, 200);
  assert.equal(body.decisions[0]?.state, "protect");
  assert.equal(body.decisions[0]?.generation, 0);
});

test("an invalid future spoiler decision cannot mutate global visibility", async () => {
  const headers = await sessionHeaders();
  const localWorkspaceId = randomUUID();
  await request("/sync/workspace/bind", {
    body: { localWorkspaceId, spoilerState: initialSpoilerState },
    headers,
    method: "POST",
  });

  const rejected = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [
        {
          baseVersion: null,
          generation: 1,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
        },
      ],
      state: { baseVersion: 1, policy: "show", resetGeneration: 0 },
    }),
    headers,
    method: "POST",
  });

  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "invalid_reset_generation" });

  const read = await request("/sync/spoilers", { headers });
  const body = await read.json<{ snapshotVersion: number; state: RemoteSpoilerState }>();
  assert.equal(read.status, 200);
  assert.equal(body.snapshotVersion, 1);
  assert.equal(body.state.policy, "protect");
  assert.equal(body.state.resetGeneration, 0);
  assert.equal(body.state.version, 1);
});

test("sync input is strict and a local workspace cannot cross account ownership", async () => {
  const ownerHeaders = await sessionHeaders();
  const otherHeaders = await sessionHeaders();
  const localWorkspaceId = randomUUID();

  for (const body of [
    { localWorkspaceId: "not-a-uuid" },
    { localWorkspaceId, preferences: { motion: "sometimes" } },
    { extra: true, localWorkspaceId },
  ]) {
    const response = await request("/sync/workspace/bind", {
      body,
      headers: ownerHeaders,
      method: "POST",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }

  assert.equal(
    (
      await request("/sync/workspace/bind", {
        body: {
          localWorkspaceId,
          preferences: { motion: "system" },
          spoilerState: initialSpoilerState,
        },
        headers: ownerHeaders,
        method: "POST",
      })
    ).status,
    200,
  );

  const conflict = await request("/sync/workspace/bind", {
    body: {
      localWorkspaceId: localWorkspaceId.toUpperCase(),
      spoilerState: initialSpoilerState,
    },
    headers: otherHeaders,
    method: "POST",
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "workspace_bound_to_another_user" });

  const foreignSpoilerUpdate = await request("/sync/spoilers", {
    body: spoilerUpdate(localWorkspaceId, {
      decisions: [],
      state: { baseVersion: 1, policy: "show", resetGeneration: 0 },
    }),
    headers: otherHeaders,
    method: "POST",
  });
  assert.equal(foreignSpoilerUpdate.status, 404);
  assert.deepEqual(await foreignSpoilerUpdate.json(), { error: "workspace_not_bound" });

  const unbound = await request("/sync/preferences", { headers: otherHeaders });
  assert.equal(unbound.status, 404);
  assert.deepEqual(await unbound.json(), { error: "workspace_not_bound" });

  const invalidBodies = [
    { updates: [{ key: "motion", value: "sometimes" }] },
    { updates: [{ key: "language", value: "en" }] },
    { updates: [{ key: "motion", value: "full", version: 50 }] },
    { extra: true, updates: [{ key: "motion", value: "full" }] },
    { updates: [] },
  ];

  for (const body of invalidBodies) {
    const response = await request("/sync/preferences", {
      body,
      headers: ownerHeaders,
      method: "POST",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }
});

test("sync mutations require JSON from the exact desktop origin", async () => {
  const headers = await sessionHeaders();
  const withoutDesktopOrigin = await request("/sync/workspace/bind", {
    body: { localWorkspaceId: randomUUID(), spoilerState: initialSpoilerState },
    desktop: false,
    headers,
    method: "POST",
  });
  const textHeaders = new Headers(headers);
  textHeaders.set("content-type", "text/plain");
  textHeaders.set("electron-origin", "com.mooligan.app:/");
  const textBody = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/sync/workspace/bind", {
      body: JSON.stringify({ localWorkspaceId: randomUUID(), spoilerState: initialSpoilerState }),
      headers: textHeaders,
      method: "POST",
    }),
  );

  assert.equal(withoutDesktopOrigin.status, 403);
  assert.equal(textBody.status, 415);

  const oversized = await request("/sync/workspace/bind", {
    body: { localWorkspaceId: randomUUID(), padding: "x".repeat(17 * 1_024) },
    headers,
    method: "POST",
  });
  assert.equal(oversized.status, 413);
});

type Preference = {
  updatedAt: string;
  value: "full" | "reduced" | "system";
  version: number;
};

type PreferencesResponse = { preferences: { motion?: Preference } };
type BindResponse = PreferencesResponse & {
  spoilerState: RemoteSpoilerState;
  spoilerStateAccepted: boolean;
  workspaceId: string;
};
type RemoteSpoilerState = {
  policy: "protect" | "show";
  resetGeneration: number;
  updatedAt: string;
  version: number;
};
type RemoteSpoilerDecision = {
  generation: number;
  scope: "printing" | "release";
  state: "protect" | "reveal";
  targetId: string;
  updatedAt: string;
  version: number;
};
type SpoilerUpdateResponse = {
  decisions: RemoteSpoilerDecision[];
  operationId: string;
  snapshotVersion: number;
  state: RemoteSpoilerState;
};

function spoilerUpdate(
  localWorkspaceId: string,
  update: { decisions: unknown[]; state?: unknown },
  operationId = randomUUID(),
) {
  return { ...update, localWorkspaceId, operationId };
}

function assertPreference(
  preference: Preference | undefined,
  value: Preference["value"],
  version: number,
) {
  assert.ok(preference);
  assert.equal(preference.value, value);
  assert.equal(preference.version, version);
  assert.equal(new Date(preference.updatedAt).toISOString(), preference.updatedAt);
}

async function sessionHeaders() {
  const auth = await createAuth(env).$context;
  const user = await auth.internalAdapter.createUser({
    email: `${uuidv7()}@example.com`,
    emailVerified: true,
    name: "Sync Test User",
  });
  const session = await auth.internalAdapter.createSession(user.id);
  const signature = await makeSignature(session.token, env.BETTER_AUTH_SECRET);

  return new Headers({
    cookie: `better-auth.session_token=${session.token}.${signature}`,
  });
}

async function request(
  path: string,
  options: {
    body?: unknown;
    desktop?: boolean;
    headers?: Headers;
    method?: "GET" | "POST";
  } = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  let body: string | undefined;

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  if (options.method === "POST" && options.desktop !== false) {
    headers.set("electron-origin", "com.mooligan.app:/");
  }

  return exports.default.fetch(
    new Request(`http://127.0.0.1:3000${path}`, {
      body,
      headers,
      method: options.method,
    }),
  );
}
