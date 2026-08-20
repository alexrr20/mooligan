import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as z from "zod";
import type { JSONType } from "zod";

import {
  MotionPreferenceSchema,
  SPOILER_SYNC_BATCH_SIZE,
  type RemoteMotionPreference,
  type RemoteSpoilerDecision,
  type RemoteSpoilerState,
} from "@mooligan/domain/workspace-sync";

import { SpoilerService } from "../electron/spoilers/service.ts";
import type { MotionPreference, Preferences } from "../electron/workspace/preferences.ts";
import {
  PreferenceSyncCoordinator,
  type PreferenceSyncAuth,
  type PreferenceSyncWorkspace,
} from "../electron/workspace/preference-sync.ts";
import type {
  PreferenceSyncState,
  SpoilerSyncBatch,
  SpoilerSyncState,
} from "../electron/workspace/store.ts";
import { WorkspaceManager } from "../electron/workspace/store.ts";

const REMOTE_A = "01989924-0000-7000-8000-000000000001";
const REMOTE_B = "01989924-0000-7000-8000-000000000002";
const UpdateRequestSchema = z.object({
  updates: z.tuple([z.object({ key: z.literal("motion"), value: MotionPreferenceSchema })]),
});

void test("first bind uploads local motion and an existing account downloads cloud motion", async () => {
  const local = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, local);

  local.update("full");
  auth.respond = (request) => {
    assert.equal(request.path, "/sync/workspace/bind");
    assert.deepEqual(request.body, {
      localWorkspaceId: local.workspaceId,
      preferences: { motion: "full" },
      spoilerState: { policy: "protect", resetGeneration: 0 },
    });
    return json(bindResponse(REMOTE_A, remote("full", 1)));
  };

  assert.deepEqual(await sync.connect("user-a"), { status: "synced" });
  assert.equal(local.remoteWorkspaceId, REMOTE_A);
  assert.equal(local.motion, "full");
  assert.equal(local.pending, false);
  assert.equal(auth.requests.length, 2);

  const secondDevice = new FakeWorkspace();
  const secondAuth = new FakeAuth();
  const secondSync = new PreferenceSyncCoordinator(secondAuth, secondDevice);

  secondAuth.respond = () => json(bindResponse(REMOTE_A, remote("reduced", 2)));
  assert.deepEqual(await secondSync.connect("user-a"), { status: "synced" });
  assert.equal(secondDevice.motion, "reduced");
  assert.equal(secondDevice.pending, false);
});

void test("a pending local preference wins a cloud conflict", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  workspace.update("full");
  auth.respond = (request) => {
    if (request.path === "/sync/workspace/bind") {
      return json(bindResponse(REMOTE_A, remote("reduced", 4)));
    }

    assert.deepEqual(request.body, { updates: [{ key: "motion", value: "full" }] });
    return json(preferencesResponse(remote("full", 5)));
  };

  assert.deepEqual(await sync.connect("user-a"), { status: "synced" });
  assert.equal(workspace.motion, "full");
  assert.deepEqual(workspace.readPreferenceSyncState(), {
    motion: { conflict: null, pending: false, remoteVersion: 5 },
  });
  assert.deepEqual(
    auth.requests.map(({ path }) => path),
    ["/sync/workspace/bind", "/sync/spoilers", "/sync/preferences"],
  );
});

void test("a first bind applies spoiler decisions with the later authoritative state", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  auth.respond = () =>
    json({
      ...bindResponse(REMOTE_A, remote("system", 1)),
      spoilerState: remoteSpoilerState("show", 0, 1),
    });
  auth.respondToSpoilers = () =>
    json({
      decisions: [],
      nextCursor: null,
      snapshotVersion: 2,
      state: remoteSpoilerState("protect", 1, 2),
    });

  assert.deepEqual(await sync.connect("user-a"), { status: "synced" });
  assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
  assert.equal(workspace.readSpoilerSyncState().global.resetGeneration, 1);
  assert.equal(workspace.readSpoilerSyncState().global.remoteVersion, 2);
});

void test("a first-bind reset acknowledgement preserves a later local reveal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-first-bind-reset-"));
  const workspace = new WorkspaceManager(directory);

  try {
    workspace.protectAllSpoilers();
    const auth = new FakeAuth();
    const bindStarted = deferred<void>();
    const releaseBind = deferred<Response>();
    const sync = new PreferenceSyncCoordinator(auth, workspace);

    auth.respond = (request) => {
      if (request.path === "/sync/workspace/bind") {
        assert.deepEqual(request.body, {
          localWorkspaceId: workspace.workspaceId,
          preferences: { motion: "system" },
          spoilerState: { policy: "protect", resetGeneration: 1 },
        });
        bindStarted.resolve();
        return releaseBind.promise;
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        assert.deepEqual(
          { decisions: operation.decisions, state: operation.state },
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
            state: undefined,
          },
        );
        return json({
          decisions: [
            {
              generation: 1,
              scope: "printing",
              state: "reveal",
              targetId: "printing-a",
              updatedAt: "2026-08-04T12:02:00.000Z",
              version: 1,
            },
          ],
          operationId: operation.operationId,
          snapshotVersion: 2,
          state: remoteSpoilerState("protect", 1, 1),
        });
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    auth.respondToSpoilers = () =>
      json({
        decisions: [],
        nextCursor: null,
        snapshotVersion: 1,
        state: remoteSpoilerState("protect", 1, 1),
      });

    const connecting = sync.connect("user-a");
    await bindStarted.promise;
    workspace.revealSpoilerPrinting("printing-a");
    releaseBind.resolve(
      json({
        ...bindResponse(REMOTE_A, remote("system", 1)),
        spoilerState: remoteSpoilerState("protect", 1, 1),
        spoilerStateAccepted: true,
      }),
    );

    assert.deepEqual(await connecting, { status: "synced" });
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, ["printing-a"]);
    assert.equal(workspace.readSpoilerSyncState().global.pending, false);
    assert.equal(workspace.readSpoilerSyncState().decisions[0]?.pending, false);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a lost bind response does not discard a local Show before retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-bind-retry-policy-"));
  const workspace = new WorkspaceManager(directory);

  try {
    const auth = new FakeAuth();
    const sync = new PreferenceSyncCoordinator(auth, workspace);
    let bindAttempts = 0;

    auth.respond = (request) => {
      if (request.path === "/sync/workspace/bind") {
        bindAttempts += 1;

        if (bindAttempts === 1) {
          assert.deepEqual(request.body, {
            localWorkspaceId: workspace.workspaceId,
            preferences: { motion: "system" },
            spoilerState: { policy: "protect", resetGeneration: 0 },
          });
          throw new TypeError("bind response lost");
        }

        assert.deepEqual(request.body, {
          localWorkspaceId: workspace.workspaceId,
          preferences: { motion: "system" },
          spoilerState: { policy: "show", resetGeneration: 0 },
        });
        return json({
          ...bindResponse(REMOTE_A, remote("system", 1)),
          spoilerStateAccepted: true,
        });
      }

      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        assert.deepEqual(
          { decisions: operation.decisions, state: operation.state },
          {
            decisions: [],
            state: { baseVersion: 1, policy: "show", resetGeneration: 0 },
          },
        );
        return json({
          decisions: [],
          operationId: operation.operationId,
          snapshotVersion: 2,
          state: remoteSpoilerState("show", 0, 2),
        });
      }

      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    auth.respondToSpoilers = () => json(spoilerPageResponse());

    assert.deepEqual(await sync.connect("user-a"), { status: "paused" });
    assert.equal(workspace.remoteWorkspaceId, null);

    workspace.setSpoilerPolicy("show");

    assert.deepEqual(await sync.workspaceChanged(), { status: "synced" });
    assert.equal(bindAttempts, 2);
    assert.equal(workspace.remoteWorkspaceId, REMOTE_A);
    assert.equal(workspace.readPreferences().spoilerPolicy, "show");
    assert.equal(workspace.readSpoilerSyncState().global.pending, false);
    assert.equal(workspace.readSpoilerSyncState().global.remoteVersion, 2);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("offline edits remain pending, reconnect, and reject invalid cloud data safely", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  auth.respond = () => json(bindResponse(REMOTE_A, remote("system", 1)));
  await sync.connect("user-a");
  workspace.update("reduced");
  auth.respond = () => {
    throw new TypeError("offline");
  };

  assert.deepEqual(await sync.preferenceChanged(), { status: "pending" });
  assert.equal(workspace.motion, "reduced");
  assert.equal(workspace.pending, true);

  auth.respond = (request) =>
    request.init?.method === "POST"
      ? json(preferencesResponse(remote("reduced", 2)))
      : json(preferencesResponse(remote("system", 1)));
  assert.deepEqual(await sync.sync(), { status: "synced" });
  assert.equal(workspace.motion, "reduced");
  assert.equal(workspace.pending, false);

  auth.respond = () => json({ preferences: { motion: { ...remote("full", 3), extra: true } } });
  assert.deepEqual(await sync.sync(), { status: "paused" });
  assert.equal(workspace.motion, "reduced");

  workspace.update("full");
  auth.respond = () => new Response(null, { status: 401 });
  assert.deepEqual(await sync.preferenceChanged(), { status: "pending" });
  assert.equal(workspace.motion, "full");
});

void test("switching accounts selects isolated local workspaces", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);
  let account: keyof typeof cloud = "user-a";
  const cloud = {
    "user-a": { motion: remote("full", 1), workspaceId: REMOTE_A },
    "user-b": { motion: remote("reduced", 1), workspaceId: REMOTE_B },
  };

  auth.respond = (request) => {
    const current = cloud[account];
    if (request.path === "/sync/workspace/bind") {
      return json(bindResponse(current.workspaceId, current.motion));
    }

    if (request.init?.method === "POST") {
      const body = UpdateRequestSchema.parse(request.body);
      current.motion = remote(body.updates[0].value, current.motion.version + 1);
    }

    return json(preferencesResponse(current.motion));
  };

  await sync.connect("user-a");
  const localA = workspace.workspaceId;
  assert.equal(workspace.motion, "full");

  account = "user-b";
  const switching = sync.connect("user-b");
  workspace.update("system");
  const staleChange = sync.preferenceChanged();
  await switching;
  await staleChange;
  const localB = workspace.workspaceId;
  assert.notEqual(localB, localA);
  assert.equal(workspace.motion, "reduced");

  account = "user-a";
  await sync.connect("user-a");
  assert.equal(workspace.workspaceId, localA);
  assert.equal(workspace.remoteWorkspaceId, REMOTE_A);
  assert.equal(workspace.motion, "system");
  assert.equal(cloud["user-a"].motion.value, "system");
  assert.equal(cloud["user-b"].motion.value, "reduced");

  assert.deepEqual(await sync.disconnect(), { status: "local-only" });
});

void test("a paused restored session selects and retains its local account workspace", async () => {
  const workspace = new FakeWorkspace();
  workspace.selectForUser("user-a");
  const workspaceA = workspace.workspaceId;
  const auth = new FakeAuth();
  const selected: string[] = [];
  const sync = new PreferenceSyncCoordinator(auth, workspace, {
    onWorkspaceSelected(workspaceId) {
      selected.push(workspaceId);
    },
  });

  assert.deepEqual(await sync.pause("user-b"), { status: "paused" });
  const workspaceB = workspace.workspaceId;
  assert.notEqual(workspaceB, workspaceA);
  assert.deepEqual(selected, [workspaceB]);

  auth.respond = () => json(bindResponse(REMOTE_B, remote("system", 1)));
  assert.deepEqual(await sync.sync(), { status: "synced" });
  assert.equal(workspace.remoteWorkspaceId, REMOTE_B);
});

void test("remote spoiler protection is published before later sync network work", async () => {
  const workspace = new FakeWorkspace();
  workspace.selectForUser("user-a");
  workspace.bindActiveWorkspace("user-a", REMOTE_A);
  workspace.applyRemoteSpoilerState(remoteSpoilerState("show", 0, 1));
  workspace.update("full");
  const auth = new FakeAuth();
  const pushStarted = deferred<void>();
  const releasePush = deferred<Response>();
  const publishedPolicies: Array<"protect" | "show"> = [];
  const sync = new PreferenceSyncCoordinator(auth, workspace, {
    onSpoilersApplied() {
      publishedPolicies.push(workspace.readPreferences().spoilerPolicy);
    },
  });

  auth.respond = (request) => {
    if (request.init?.method === "POST") {
      pushStarted.resolve();
      return releasePush.promise;
    }
    return json(preferencesResponse(remote("system", 1)));
  };
  auth.respondToSpoilers = () =>
    json({
      decisions: [],
      nextCursor: null,
      snapshotVersion: 2,
      state: remoteSpoilerState("protect", 1, 2),
    });

  const connecting = sync.connect("user-a");
  await pushStarted.promise;
  assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
  assert.deepEqual(publishedPolicies, ["protect"]);

  releasePush.resolve(json(preferencesResponse(remote("full", 2))));
  assert.deepEqual(await connecting, { status: "synced" });
});

void test("workspace selection publishes protected state before account sync waits on the network", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-workspace-selection-"));
  const workspace = new WorkspaceManager(directory);
  workspace.selectForUser("user-a");
  workspace.bindActiveWorkspace("user-a", REMOTE_A);
  workspace.setSpoilerPolicy("show");
  const spoilers = new SpoilerService(workspace);

  try {
    const auth = new FakeAuth();
    const observedPolicies: Array<"protect" | "show"> = [];
    const sync = new PreferenceSyncCoordinator(auth, workspace, {
      onWorkspaceSelected() {
        observedPolicies.push(spoilers.refresh().policy);
      },
    });
    const networkStarted = deferred<void>();
    const releaseNetwork = deferred<Response>();

    auth.respond = (request) => {
      networkStarted.resolve();
      assert.equal(request.path, "/sync/workspace/bind");
      assert.equal(spoilers.snapshot().policy, "protect");
      assert.deepEqual(observedPolicies, ["protect"]);
      return releaseNetwork.promise;
    };

    const switching = sync.connect("user-b");
    await networkStarted.promise;

    assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
    assert.equal(spoilers.snapshot().policy, "protect");
    releaseNetwork.resolve(json(bindResponse(REMOTE_B, remote("system", 1))));
    assert.deepEqual(await switching, { status: "synced" });
  } finally {
    spoilers.close();
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a local edit racing an in-flight push is not cleared", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  auth.respond = () => json(bindResponse(REMOTE_A, remote("system", 1)));
  await sync.connect("user-a");

  const firstStarted = deferred<void>();
  const releaseFirst = deferred<Response>();
  let push = 0;

  auth.respond = (request) => {
    push += 1;
    if (push === 1) {
      assert.deepEqual(request.body, { updates: [{ key: "motion", value: "full" }] });
      firstStarted.resolve();
      return releaseFirst.promise;
    }

    assert.deepEqual(request.body, { updates: [{ key: "motion", value: "reduced" }] });
    return json(preferencesResponse(remote("reduced", 3)));
  };

  workspace.update("full");
  const first = sync.preferenceChanged();
  await firstStarted.promise;

  workspace.update("reduced");
  const second = sync.preferenceChanged();
  releaseFirst.resolve(json(preferencesResponse(remote("full", 2))));

  assert.deepEqual(await first, { status: "pending" });
  assert.deepEqual(await second, { status: "synced" });
  assert.equal(workspace.motion, "reduced");
  assert.equal(workspace.pending, false);
  assert.equal(push, 2);
});

void test("a lost spoiler response recovers its persisted batch before newer local edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-lost-spoiler-response-"));
  let workspace = new WorkspaceManager(directory);

  try {
    workspace.selectForUser("user-a");
    workspace.bindActiveWorkspace("user-a", REMOTE_A);
    workspace.applyRemoteSpoilerState(remoteSpoilerState("protect", 0, 1));
    workspace.protectAllSpoilers();
    const firstAuth = new FakeAuth();
    const firstSync = new PreferenceSyncCoordinator(firstAuth, workspace);
    let committedOperationId: string | undefined;
    let serverState = remoteSpoilerState("protect", 0, 1);

    firstAuth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        assert.deepEqual(operation.state, {
          baseVersion: 1,
          policy: "protect",
          resetGeneration: 1,
        });
        committedOperationId = operation.operationId;
        serverState = remoteSpoilerState("protect", 1, 2);
        throw new TypeError("response lost");
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    firstAuth.respondToSpoilers = () =>
      json({
        decisions: [],
        nextCursor: null,
        snapshotVersion: 1,
        state: serverState,
      });

    assert.deepEqual(await firstSync.connect("user-a"), { status: "pending" });
    assert.ok(committedOperationId);
    assert.equal(workspace.hasSpoilerSyncBatch(), true);
    workspace.revealSpoilerPrinting("printing-a");
    workspace.close();

    workspace = new WorkspaceManager(directory);
    const retryAuth = new FakeAuth();
    const retrySync = new PreferenceSyncCoordinator(retryAuth, workspace);
    let serverDecision: RemoteSpoilerDecision | undefined;
    let spoilerPosts = 0;

    retryAuth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        spoilerPosts += 1;
        const operation = spoilerOperationRequest(request, workspace.workspaceId);

        if (spoilerPosts === 1) {
          assert.equal(operation.operationId, committedOperationId);
          return json({
            decisions: [],
            operationId: operation.operationId,
            snapshotVersion: 2,
            state: serverState,
          });
        }

        assert.deepEqual(operation.decisions, [
          {
            baseVersion: null,
            generation: 1,
            scope: "printing",
            state: "reveal",
            targetId: "printing-a",
          },
        ]);
        serverDecision = {
          generation: 1,
          scope: "printing",
          state: "reveal",
          targetId: "printing-a",
          updatedAt: "2026-08-04T12:03:00.000Z",
          version: 1,
        };
        return json({
          decisions: [serverDecision],
          operationId: operation.operationId,
          snapshotVersion: 3,
          state: serverState,
        });
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    retryAuth.respondToSpoilers = () =>
      json({
        decisions: serverDecision ? [serverDecision] : [],
        nextCursor: null,
        snapshotVersion: serverDecision ? 3 : 2,
        state: serverState,
      });

    assert.deepEqual(await retrySync.connect("user-a"), { status: "synced" });
    assert.equal(spoilerPosts, 2);
    assert.equal(workspace.hasSpoilerSyncBatch(), false);
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, ["printing-a"]);
    assert.equal(workspace.readSpoilerSyncState().decisions[0]?.pending, false);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a lost target acknowledgement cannot clear a newer edit to the same target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-lost-target-ack-"));
  let workspace = new WorkspaceManager(directory);

  try {
    workspace.selectForUser("user-a");
    workspace.bindActiveWorkspace("user-a", REMOTE_A);
    workspace.applyRemoteSpoilerState(remoteSpoilerState("protect", 0, 1));
    let serverDecision: RemoteSpoilerDecision = {
      generation: 0,
      scope: "printing",
      state: "reveal",
      targetId: "printing-a",
      updatedAt: "2026-08-04T12:01:00.000Z",
      version: 1,
    };
    workspace.applyRemoteSpoilerDecisions([serverDecision]);
    workspace.protectSpoilerPrinting("printing-a");
    const firstAuth = new FakeAuth();
    const firstSync = new PreferenceSyncCoordinator(firstAuth, workspace);
    let committedOperationId: string | undefined;

    firstAuth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        assert.deepEqual(operation.decisions, [
          {
            baseVersion: 1,
            generation: 0,
            scope: "printing",
            state: "protect",
            targetId: "printing-a",
          },
        ]);
        committedOperationId = operation.operationId;
        serverDecision = {
          ...serverDecision,
          state: "protect",
          updatedAt: "2026-08-04T12:02:00.000Z",
          version: 2,
        };
        throw new TypeError("response lost");
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    firstAuth.respondToSpoilers = () =>
      json({
        decisions: [serverDecision],
        nextCursor: null,
        snapshotVersion: 1,
        state: remoteSpoilerState("protect", 0, 1),
      });

    assert.deepEqual(await firstSync.connect("user-a"), { status: "pending" });
    assert.ok(committedOperationId);
    workspace.revealSpoilerPrinting("printing-a");
    workspace.close();

    workspace = new WorkspaceManager(directory);
    const retryAuth = new FakeAuth();
    const retrySync = new PreferenceSyncCoordinator(retryAuth, workspace);
    let spoilerPosts = 0;

    retryAuth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        spoilerPosts += 1;
        const operation = spoilerOperationRequest(request, workspace.workspaceId);

        if (spoilerPosts === 1) {
          assert.equal(operation.operationId, committedOperationId);
        } else {
          assert.deepEqual(operation.decisions, [
            {
              baseVersion: 2,
              generation: 0,
              scope: "printing",
              state: "reveal",
              targetId: "printing-a",
            },
          ]);
          serverDecision = {
            ...serverDecision,
            state: "reveal",
            updatedAt: "2026-08-04T12:03:00.000Z",
            version: 3,
          };
        }

        return json({
          decisions: [serverDecision],
          operationId: operation.operationId,
          snapshotVersion: spoilerPosts + 1,
          state: remoteSpoilerState("protect", 0, 1),
        });
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    retryAuth.respondToSpoilers = () =>
      json({
        decisions: [serverDecision],
        nextCursor: null,
        snapshotVersion: 3,
        state: remoteSpoilerState("protect", 0, 1),
      });

    assert.deepEqual(await retrySync.connect("user-a"), { status: "synced" });
    assert.equal(spoilerPosts, 2);
    assert.equal(workspace.hasSpoilerSyncBatch(), false);
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, ["printing-a"]);
    const synced = workspace.readSpoilerSyncState().decisions[0];
    assert.equal(synced?.decision.state, "reveal");
    assert.equal(synced?.remoteVersion, 3);
    assert.equal(synced?.pending, false);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("recovering a historical receipt pulls a newer protection before reporting synced", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-stale-receipt-"));
  const workspace = new WorkspaceManager(directory);

  try {
    workspace.selectForUser("user-a");
    workspace.bindActiveWorkspace("user-a", REMOTE_A);
    workspace.applyRemoteSpoilerState(remoteSpoilerState("protect", 0, 1));
    workspace.revealSpoilerPrinting("printing-a");
    const auth = new FakeAuth();
    const sync = new PreferenceSyncCoordinator(auth, workspace);
    let committedOperationId: string | undefined;
    const historicalReveal: RemoteSpoilerDecision = {
      generation: 0,
      scope: "printing",
      state: "reveal",
      targetId: "printing-a",
      updatedAt: "2026-08-04T12:01:00.000Z",
      version: 1,
    };

    auth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        committedOperationId = operation.operationId;
        throw new TypeError("response lost");
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    auth.respondToSpoilers = () => json(spoilerPageResponse());

    assert.deepEqual(await sync.connect("user-a"), { status: "pending" });
    assert.ok(committedOperationId);

    const newerProtection: RemoteSpoilerDecision = {
      ...historicalReveal,
      state: "protect",
      updatedAt: "2026-08-04T12:02:00.000Z",
      version: 2,
    };
    let spoilerGets = 0;

    auth.respond = (request) => {
      if (request.path === "/sync/preferences" && request.init?.method === "POST") {
        return json(preferencesResponse(remote("full", 2)));
      }
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        assert.equal(operation.operationId, committedOperationId);
        return json({
          decisions: [historicalReveal],
          operationId: operation.operationId,
          snapshotVersion: 2,
          state: remoteSpoilerState("protect", 0, 1),
        });
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };
    auth.respondToSpoilers = () => {
      spoilerGets += 1;
      return json({
        decisions: [newerProtection],
        nextCursor: null,
        snapshotVersion: 3,
        state: remoteSpoilerState("protect", 0, 1),
      });
    };

    workspace.updatePreferences({ motion: "full" });
    assert.deepEqual(await sync.preferenceChanged(), { status: "synced" });
    assert.equal(spoilerGets, 1);
    assert.equal(workspace.hasSpoilerSyncBatch(), false);
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, []);
    const synced = workspace.readSpoilerSyncState().decisions[0];
    assert.equal(synced?.decision.state, "protect");
    assert.equal(synced?.remoteVersion, 2);
    assert.equal(synced?.pending, false);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a decision response applies an advanced reset before its authoritative tombstone", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-reset-race-"));

  try {
    const workspace = new WorkspaceManager(directory);
    workspace.selectForUser("user-a");
    workspace.bindActiveWorkspace("user-a", REMOTE_A);
    workspace.revealSpoilerPrinting("printing-a");
    const auth = new FakeAuth();
    const sync = new PreferenceSyncCoordinator(auth, workspace);

    auth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        return json({
          decisions: [
            {
              generation: 1,
              scope: "printing",
              state: "protect",
              targetId: "printing-a",
              updatedAt: "2026-08-04T12:01:00.000Z",
              version: 1,
            },
          ],
          operationId: operation.operationId,
          snapshotVersion: 2,
          state: remoteSpoilerState("protect", 1, 2),
        });
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };

    assert.deepEqual(await sync.connect("user-a"), { status: "synced" });
    assert.equal(workspace.readSpoilerSyncState().global.resetGeneration, 1);
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, []);
    assert.equal(workspace.readSpoilerSyncState().decisions[0]?.decision.state, "protect");
    assert.equal(workspace.readSpoilerSyncState().decisions[0]?.pending, false);
    workspace.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("an incomplete decision response cannot widen global visibility", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-incomplete-spoilers-"));
  const workspace = new WorkspaceManager(directory);

  try {
    workspace.selectForUser("user-a");
    workspace.bindActiveWorkspace("user-a", REMOTE_A);
    workspace.protectSpoilerPrinting("printing-a");
    const auth = new FakeAuth();
    const sync = new PreferenceSyncCoordinator(auth, workspace);

    auth.respond = (request) => {
      if (request.path === "/sync/preferences") {
        return json(preferencesResponse(remote("system", 1)));
      }
      if (request.path === "/sync/spoilers" && request.init?.method === "POST") {
        const operation = spoilerOperationRequest(request, workspace.workspaceId);
        return json({
          decisions: [],
          operationId: operation.operationId,
          snapshotVersion: 2,
          state: remoteSpoilerState("show", 0, 2),
        });
      }
      throw new Error(`Unexpected sync request: ${request.path}`);
    };

    assert.deepEqual(await sync.connect("user-a"), { status: "pending" });
    assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, []);
    assert.equal(workspace.readSpoilerSyncState().decisions[0]?.pending, true);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a malformed spoiler pull cannot apply its global show policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-invalid-spoiler-pull-"));
  const workspace = new WorkspaceManager(directory);

  try {
    workspace.selectForUser("user-a");
    workspace.bindActiveWorkspace("user-a", REMOTE_A);
    const auth = new FakeAuth();
    const sync = new PreferenceSyncCoordinator(auth, workspace);

    auth.respond = () => json(preferencesResponse(remote("system", 1)));
    auth.respondToSpoilers = () =>
      json({
        decisions: [
          {
            generation: 1,
            scope: "printing",
            state: "reveal",
            targetId: "printing-a",
            updatedAt: "2026-08-04T12:01:00.000Z",
            version: 1,
          },
        ],
        nextCursor: null,
        snapshotVersion: 2,
        state: remoteSpoilerState("show", 0, 2),
      });

    assert.deepEqual(await sync.connect("user-a"), { status: "paused" });
    assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
    assert.deepEqual(workspace.readSpoilerState().activePrintingIds, []);
    assert.deepEqual(workspace.readSpoilerSyncState().decisions, []);
  } finally {
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a spoiler pull rejects pages from different server snapshots", async () => {
  const workspace = new FakeWorkspace();
  workspace.selectForUser("user-a");
  workspace.bindActiveWorkspace("user-a", REMOTE_A);
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);
  let page = 0;

  auth.respond = () => json(preferencesResponse(remote("system", 1)));
  auth.respondToSpoilers = () => {
    page += 1;
    return json({
      decisions: [],
      nextCursor: page === 1 ? "page-2" : null,
      snapshotVersion: page,
      state: remoteSpoilerState("show", 0, 1),
    });
  };

  assert.deepEqual(await sync.connect("user-a"), { status: "paused" });
  assert.equal(page, 2);
  assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
});

void test("a spoiler pull stops after the bounded page limit", async () => {
  const workspace = new FakeWorkspace();
  workspace.selectForUser("user-a");
  workspace.bindActiveWorkspace("user-a", REMOTE_A);
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);
  let page = 0;

  auth.respond = () => json(preferencesResponse(remote("system", 1)));
  auth.respondToSpoilers = () => {
    page += 1;
    return json({
      decisions: [],
      nextCursor: `page-${page}`,
      snapshotVersion: 1,
      state: remoteSpoilerState("protect", 0, 1),
    });
  };

  assert.deepEqual(await sync.connect("user-a"), { status: "paused" });
  assert.equal(page, 4_000);
  assert.equal(workspace.readPreferences().spoilerPolicy, "protect");
});

type LocalWorkspace = {
  boundUserId: string | null;
  conflict: RemoteMotionPreference | null;
  motion: MotionPreference;
  pending: boolean;
  remoteVersion: number | null;
  remoteWorkspaceId: string | null;
  spoilers: SpoilerSyncState;
  spoilerSyncBatch: SpoilerSyncBatch | null;
  workspaceId: string;
};

class FakeWorkspace implements PreferenceSyncWorkspace {
  readonly #accounts = new Map<string, LocalWorkspace>();
  #active = createLocalWorkspace();

  get motion() {
    return this.#active.motion;
  }

  get pending() {
    return this.#active.pending;
  }

  get remoteWorkspaceId() {
    return this.#active.remoteWorkspaceId;
  }

  get workspaceId() {
    return this.#active.workspaceId;
  }

  applyRemotePreference(remotePreference: RemoteMotionPreference): "applied" | "conflict" {
    if (this.#active.pending && this.#active.motion !== remotePreference.value) {
      this.#active.conflict = remotePreference;
      this.#active.remoteVersion = remotePreference.version;
      return "conflict";
    }

    this.#active.motion = remotePreference.value;
    this.#active.pending = false;
    this.#active.conflict = null;
    this.#active.remoteVersion = remotePreference.version;
    return "applied";
  }

  applyRemoteSpoilerState(remoteState: RemoteSpoilerState): "applied" | "pending" {
    this.#active.spoilers.global = {
      pending: false,
      policy: remoteState.policy,
      remoteVersion: remoteState.version,
      resetGeneration: remoteState.resetGeneration,
      revision: this.#active.spoilers.global.revision + 1,
      updatedAt: remoteState.updatedAt,
    };
    return "applied";
  }

  applyRemoteSpoilerDecisions(remoteDecisions: RemoteSpoilerDecision[]) {
    this.#active.spoilers.decisions = remoteDecisions.map((decision) => ({
      decision: {
        generation: decision.generation,
        revision: decision.version,
        scope: decision.scope,
        state: decision.state,
        targetId: decision.targetId,
        updatedAt: decision.updatedAt,
      },
      pending: false,
      remoteVersion: decision.version,
    }));
  }

  bindActiveWorkspace(userId: string, remoteWorkspaceId: string) {
    assert.equal(this.#active.boundUserId, userId);
    this.#active.remoteWorkspaceId = remoteWorkspaceId;
  }

  completeSpoilerSyncBatch(operationId: string) {
    assert.equal(this.#active.spoilerSyncBatch?.operationId, operationId);
    this.#active.spoilerSyncBatch = null;
  }

  hasSpoilerSyncBatch() {
    return this.#active.spoilerSyncBatch !== null;
  }

  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference) {
    assert.equal(preference.value, pushedValue);
    const unchanged = this.#active.motion === pushedValue;

    this.#active.conflict = null;
    this.#active.pending = !unchanged;
    this.#active.remoteVersion = preference.version;
    return unchanged;
  }

  markSpoilerStateSynced(pushedState: SpoilerSyncState["global"], state: RemoteSpoilerState) {
    assert.equal(pushedState.revision, this.#active.spoilers.global.revision);
    this.applyRemoteSpoilerState(state);
    return true;
  }

  markSpoilerDecisionSynced(
    pushedDecision: SpoilerSyncState["decisions"][number],
    decision: RemoteSpoilerDecision,
  ) {
    assert.equal(pushedDecision.decision.scope, decision.scope);
    assert.equal(pushedDecision.decision.targetId, decision.targetId);
    this.applyRemoteSpoilerDecisions([decision]);
    return true;
  }

  prepareSpoilerSyncBatch(): SpoilerSyncBatch | null {
    if (this.#active.spoilerSyncBatch) {
      return structuredClone(this.#active.spoilerSyncBatch);
    }

    const sync = this.readSpoilerSyncState();
    const decisions = sync.decisions
      .filter(({ pending }) => pending)
      .slice(0, SPOILER_SYNC_BATCH_SIZE);
    const global = sync.global.pending ? sync.global : null;
    if (!global && decisions.length === 0) {
      return null;
    }

    this.#active.spoilerSyncBatch = {
      decisions,
      global,
      operationId: randomUUID(),
    };
    return structuredClone(this.#active.spoilerSyncBatch);
  }

  readPreferences(): Preferences {
    return {
      motion: this.#active.motion,
      spoilerPolicy: this.#active.spoilers.global.policy,
    };
  }

  readPreferenceSyncState(): PreferenceSyncState {
    return {
      motion: {
        conflict: this.#active.conflict,
        pending: this.#active.pending,
        remoteVersion: this.#active.remoteVersion,
      },
    };
  }

  readSpoilerSyncState(): SpoilerSyncState {
    return structuredClone(this.#active.spoilers);
  }

  selectForUser(userId: string) {
    const existing = this.#accounts.get(userId);

    if (existing) {
      this.#active = existing;
      return existing;
    }

    if (this.#active.boundUserId === null) {
      this.#active.boundUserId = userId;
    } else if (this.#active.boundUserId !== userId) {
      this.#active = createLocalWorkspace();
      this.#active.boundUserId = userId;
    }

    this.#accounts.set(userId, this.#active);
    return this.#active;
  }

  update(motion: MotionPreference) {
    this.#active.motion = motion;
    this.#active.pending = true;
  }
}

type CapturedRequest = {
  body: JSONType | undefined;
  init: RequestInit | undefined;
  path: `/sync/${string}`;
};

class FakeAuth implements PreferenceSyncAuth {
  readonly requests: CapturedRequest[] = [];
  respond: (request: CapturedRequest) => Response | Promise<Response> = () => {
    throw new Error("Unexpected sync request.");
  };
  respondToSpoilers: ((request: CapturedRequest) => Response | Promise<Response>) | undefined;

  async request(_userId: string, path: `/sync/${string}`, init?: RequestInit) {
    const body = z.string().safeParse(init?.body);
    const request = {
      body: body.success ? z.json().parse(JSON.parse(body.data)) : undefined,
      init,
      path,
    };
    this.requests.push(request);
    if (path.startsWith("/sync/spoilers") && init?.method !== "POST") {
      return await (this.respondToSpoilers?.(request) ?? json(spoilerPageResponse()));
    }
    return await this.respond(request);
  }
}

let nextWorkspace = 0;

function createLocalWorkspace(): LocalWorkspace {
  nextWorkspace += 1;
  return {
    boundUserId: null,
    conflict: null,
    motion: "system",
    pending: false,
    remoteVersion: null,
    remoteWorkspaceId: null,
    spoilers: {
      decisions: [],
      global: {
        pending: false,
        policy: "protect",
        remoteVersion: null,
        resetGeneration: 0,
        revision: 0,
        updatedAt: "2026-08-04T10:00:00.000Z",
      },
    },
    spoilerSyncBatch: null,
    workspaceId: `00000000-0000-4000-8000-${String(nextWorkspace).padStart(12, "0")}`,
  };
}

function remote(value: MotionPreference, version: number): RemoteMotionPreference {
  return {
    updatedAt: `2026-08-04T10:${String(version).padStart(2, "0")}:00.000Z`,
    value,
    version,
  };
}

function bindResponse(workspaceId: string, motion: RemoteMotionPreference) {
  return {
    preferences: { motion },
    spoilerState: remoteSpoilerState("protect", 0, 1),
    spoilerStateAccepted: false,
    workspaceId,
  };
}

function preferencesResponse(motion: RemoteMotionPreference) {
  return { preferences: { motion } };
}

function remoteSpoilerState(
  policy: RemoteSpoilerState["policy"],
  resetGeneration: number,
  version: number,
): RemoteSpoilerState {
  return {
    policy,
    resetGeneration,
    updatedAt: `2026-08-04T11:${String(version).padStart(2, "0")}:00.000Z`,
    version,
  };
}

function spoilerPageResponse() {
  return {
    decisions: [],
    nextCursor: null,
    snapshotVersion: 1,
    state: remoteSpoilerState("protect", 0, 1),
  };
}

function spoilerOperationRequest(request: CapturedRequest, localWorkspaceId: string) {
  const body = z
    .object({
      decisions: z.array(z.json()),
      localWorkspaceId: z.uuid(),
      operationId: z.uuid(),
      state: z.json().optional(),
    })
    .parse(request.body);
  assert.equal(body.localWorkspaceId, localWorkspaceId);
  return body;
}

function json(value: JSONType) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
