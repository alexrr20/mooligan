import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { validatePreferencesUpdate } from "../electron/workspace/preferences.ts";
import { WorkspaceManager, WorkspaceStore } from "../electron/workspace/store.ts";

void test("a local workspace initializes, reopens, updates, and validates preferences", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-workspace-"));
  const path = join(directory, "workspace.sqlite");

  try {
    const initial = new WorkspaceStore(path);
    const workspaceId = initial.workspaceId;

    assert.match(
      workspaceId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.deepEqual(initial.readPreferences(), { motion: "system", spoilerPolicy: "protect" });
    assert.deepEqual(initial.readPreferenceSyncState(), {
      motion: { conflict: null, pending: false, remoteVersion: null },
    });
    initial.close();

    const updated = new WorkspaceStore(path);

    assert.equal(updated.workspaceId, workspaceId);
    assert.deepEqual(updated.updatePreferences({ motion: "reduced" }), {
      motion: "reduced",
      spoilerPolicy: "protect",
    });
    assert.equal(updated.readPreferenceSyncState().motion.pending, true);
    updated.close();

    const reopened = new WorkspaceStore(path);

    try {
      assert.equal(reopened.workspaceId, workspaceId);
      assert.deepEqual(reopened.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
      assert.equal(reopened.readPreferenceSyncState().motion.pending, true);
      assert.throws(
        () => validatePreferencesUpdate({ currency: "EUR" }),
        /Unknown preference: currency/,
      );
      assert.throws(
        () => validatePreferencesUpdate({ motion: "sometimes" }),
        /Invalid motion preference/,
      );
      assert.deepEqual(reopened.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("account selection keeps workspace data isolated and restores the active workspace", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-workspaces-"));

  try {
    const manager = new WorkspaceManager(directory);
    const accountFreeWorkspaceId = manager.workspaceId;

    assert.equal(manager.boundUserId, null);
    assert.equal(
      manager.databasePath,
      join(directory, "workspaces", `${accountFreeWorkspaceId}.sqlite`),
    );
    assert.equal(manager.remoteWorkspaceId, null);
    manager.updatePreferences({ motion: "full" });

    assert.equal(manager.selectForUser("user-a").workspaceId, accountFreeWorkspaceId);
    assert.equal(manager.boundUserId, "user-a");
    manager.bindActiveWorkspace("user-a", "remote-a");
    assert.equal(manager.remoteWorkspaceId, "remote-a");

    const userBWorkspaceId = manager.selectForUser("user-b").workspaceId;
    assert.notEqual(userBWorkspaceId, accountFreeWorkspaceId);
    assert.equal(manager.boundUserId, "user-b");
    assert.equal(manager.remoteWorkspaceId, null);
    assert.deepEqual(manager.readPreferences(), { motion: "system", spoilerPolicy: "protect" });
    manager.updatePreferences({ motion: "reduced" });
    manager.bindActiveWorkspace("user-b", "remote-b");
    manager.close();

    const reopened = new WorkspaceManager(directory);

    assert.equal(reopened.workspaceId, userBWorkspaceId);
    assert.equal(reopened.boundUserId, "user-b");
    assert.equal(reopened.remoteWorkspaceId, "remote-b");
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });

    assert.equal(reopened.selectForUser("user-a").workspaceId, accountFreeWorkspaceId);
    assert.equal(reopened.remoteWorkspaceId, "remote-a");
    assert.deepEqual(reopened.readPreferences(), { motion: "full", spoilerPolicy: "protect" });

    assert.equal(reopened.selectForUser("user-b").workspaceId, userBWorkspaceId);
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
    assert.throws(
      () => reopened.bindActiveWorkspace("user-a", "remote-a"),
      /already bound to another user/,
    );
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("motion sync keeps local edits pending and records remote conflicts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-sync-state-"));

  try {
    const manager = new WorkspaceManager(directory);
    const firstRemote = {
      updatedAt: "2026-08-04T10:00:00.000Z",
      value: "reduced" as const,
      version: 1,
    };

    manager.updatePreferences({ motion: "full" });
    assert.equal(manager.applyRemotePreference(firstRemote), "conflict");
    assert.deepEqual(manager.readPreferences(), { motion: "full", spoilerPolicy: "protect" });
    assert.deepEqual(manager.readPreferenceSyncState(), {
      motion: { conflict: firstRemote, pending: true, remoteVersion: 1 },
    });

    const synced = {
      updatedAt: "2026-08-04T10:01:00.000Z",
      value: "full" as const,
      version: 2,
    };
    assert.equal(manager.markPreferenceSynced("full", synced), true);
    assert.deepEqual(manager.readPreferenceSyncState(), {
      motion: { conflict: null, pending: false, remoteVersion: 2 },
    });

    manager.updatePreferences({ motion: "reduced" });
    assert.equal(
      manager.markPreferenceSynced("full", {
        updatedAt: "2026-08-04T10:02:00.000Z",
        value: "full",
        version: 3,
      }),
      false,
    );
    assert.deepEqual(manager.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
    assert.deepEqual(manager.readPreferenceSyncState(), {
      motion: { conflict: null, pending: true, remoteVersion: 3 },
    });

    assert.equal(
      manager.applyRemotePreference({
        updatedAt: "2026-08-04T10:03:00.000Z",
        value: "reduced",
        version: 4,
      }),
      "applied",
    );
    assert.deepEqual(manager.readPreferenceSyncState(), {
      motion: { conflict: null, pending: false, remoteVersion: 4 },
    });
    manager.close();

    const reopened = new WorkspaceManager(directory);
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
    assert.deepEqual(reopened.readPreferenceSyncState(), {
      motion: { conflict: null, pending: false, remoteVersion: 4 },
    });
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("spoiler decisions persist, remain narrow, and reset by generation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-state-"));
  const path = join(directory, "workspace.sqlite");

  try {
    const store = new WorkspaceStore(path);

    assert.deepEqual(store.readSpoilerState(), {
      activePrintingIds: [],
      activeRootSetIds: [],
      policy: "protect",
      revision: 0,
    });

    store.revealSpoilerPrinting("printing-a");
    store.revealSpoilerRelease("release-a");
    assert.deepEqual(store.readSpoilerState().activePrintingIds, ["printing-a"]);
    assert.deepEqual(store.readSpoilerState().activeRootSetIds, ["release-a"]);

    store.protectSpoilerPrinting("printing-a");
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    assert.equal(
      store
        .readSpoilerSyncState()
        .decisions.find(({ decision }) => decision.targetId === "printing-a")?.decision.state,
      "protect",
    );

    store.setSpoilerPolicy("show");
    store.protectAllSpoilers();
    const reset = store.readSpoilerSyncState();
    assert.equal(reset.global.policy, "protect");
    assert.equal(reset.global.resetGeneration, 1);
    assert.deepEqual(reset.decisions, []);

    store.revealSpoilerPrinting("printing-a");
    assert.deepEqual(store.readSpoilerState().activePrintingIds, ["printing-a"]);
    assert.equal(store.readSpoilerSyncState().decisions[0]?.decision.generation, 1);
    store.close();

    const reopened = new WorkspaceStore(path);
    assert.deepEqual(reopened.readSpoilerState().activePrintingIds, ["printing-a"]);
    assert.equal(reopened.readSpoilerSyncState().global.resetGeneration, 1);
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("rejected remote spoiler batches do not persist an earlier reveal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-batch-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    const reveal = {
      generation: 0,
      scope: "printing" as const,
      state: "reveal" as const,
      targetId: "printing-a",
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    };

    assert.throws(
      () => store.applyRemoteSpoilerDecisions([reveal, { ...reveal, targetId: " " }]),
      /too_small/,
    );
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    assert.deepEqual(store.readSpoilerSyncState().decisions, []);

    assert.throws(
      () =>
        store.applyRemoteSpoilerDecisions([reveal, { ...reveal, state: "protect", version: 2 }]),
      /must be unique/,
    );
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    assert.deepEqual(store.readSpoilerSyncState().decisions, []);

    assert.throws(
      () =>
        store.applyRemoteSpoilerDecisions([
          reveal,
          { ...reveal, generation: 1, targetId: "printing-b" },
        ]),
      /unknown reset generation/,
    );
    assert.deepEqual(store.readSpoilerState(), {
      activePrintingIds: [],
      activeRootSetIds: [],
      policy: "protect",
      revision: 0,
    });
    assert.deepEqual(store.readSpoilerSyncState().decisions, []);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a pull rebases persisted reset intent above a newer remote reset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-pull-reset-"));
  const path = join(directory, "workspace.sqlite");

  try {
    const initial = new WorkspaceStore(path);
    initial.protectAllSpoilers();
    initial.revealSpoilerPrinting("printing-local");
    assert.equal(initial.readSpoilerSyncState().global.resetGeneration, 1);
    assert.deepEqual(initial.readSpoilerState().activePrintingIds, ["printing-local"]);
    initial.close();

    const reopened = new WorkspaceStore(path);
    assert.equal(
      reopened.applyRemoteSpoilerState({
        policy: "protect",
        resetGeneration: 10,
        updatedAt: "2026-08-04T10:00:00.000Z",
        version: 10,
      }),
      "pending",
    );
    reopened.applyRemoteSpoilerDecisions([
      {
        generation: 10,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 1,
      },
    ]);

    const sync = reopened.readSpoilerSyncState();
    assert.equal(sync.global.policy, "protect");
    assert.equal(sync.global.resetGeneration, 11);
    assert.equal(sync.global.pending, true);
    assert.deepEqual(sync.decisions, []);
    assert.deepEqual(reopened.readSpoilerState().activePrintingIds, []);
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a stale reset push rebases above remote state before applying decisions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-push-reset-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "show",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.protectAllSpoilers();
    const submitted = store.readSpoilerSyncState().global;

    assert.equal(
      store.markSpoilerStateSynced(submitted, {
        policy: "show",
        resetGeneration: 10,
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 3,
      }),
      false,
    );
    store.applyRemoteSpoilerDecisions([
      {
        generation: 10,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:02:00.000Z",
        version: 1,
      },
    ]);

    const sync = store.readSpoilerSyncState();
    assert.equal(sync.global.policy, "protect");
    assert.equal(sync.global.resetGeneration, 11);
    assert.equal(sync.global.pending, true);
    assert.deepEqual(sync.decisions, []);
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("equal-generation policy and version conflicts do not acknowledge reset intent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-reset-collision-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "protect",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.protectAllSpoilers();
    const submitted = store.readSpoilerSyncState().global;

    assert.equal(
      store.markSpoilerStateSynced(submitted, {
        policy: "show",
        resetGeneration: 1,
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 2,
      }),
      false,
    );
    const policyRebased = store.readSpoilerSyncState().global;
    assert.equal(policyRebased.policy, "protect");
    assert.equal(policyRebased.resetGeneration, 2);
    assert.equal(policyRebased.pending, true);

    assert.equal(
      store.markSpoilerStateSynced(policyRebased, {
        policy: "protect",
        resetGeneration: 2,
        updatedAt: "2026-08-04T10:02:00.000Z",
        version: 4,
      }),
      false,
    );
    const versionRebased = store.readSpoilerSyncState().global;
    assert.equal(versionRebased.resetGeneration, 3);
    assert.equal(versionRebased.pending, true);

    assert.equal(
      store.markSpoilerStateSynced(versionRebased, {
        policy: "protect",
        resetGeneration: 3,
        updatedAt: "2026-08-04T10:03:00.000Z",
        version: 5,
      }),
      true,
    );
    assert.equal(store.readSpoilerSyncState().global.pending, false);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a global acknowledgement preserves a newer local policy edit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-global-ack-race-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "show",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.setSpoilerPolicy("protect");
    const submitted = store.readSpoilerSyncState().global;
    store.setSpoilerPolicy("show");

    assert.equal(
      store.markSpoilerStateSynced(submitted, {
        policy: "protect",
        resetGeneration: 0,
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 2,
      }),
      false,
    );
    const pending = store.readSpoilerSyncState().global;
    assert.equal(pending.policy, "show");
    assert.equal(pending.pending, true);
    assert.equal(pending.remoteVersion, 2);

    assert.equal(
      store.markSpoilerStateSynced(pending, {
        policy: "show",
        resetGeneration: 0,
        updatedAt: "2026-08-04T10:02:00.000Z",
        version: 3,
      }),
      true,
    );
    assert.equal(store.readSpoilerSyncState().global.pending, false);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("non-advancing spoiler responses cannot clear pending changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-stale-ack-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "show",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.setSpoilerPolicy("protect");
    const submittedGlobal = store.readSpoilerSyncState().global;

    assert.equal(
      store.markSpoilerStateSynced(submittedGlobal, {
        policy: "protect",
        resetGeneration: 0,
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 1,
      }),
      false,
    );
    assert.equal(store.readSpoilerSyncState().global.pending, true);

    store.applyRemoteSpoilerDecisions([
      {
        generation: 0,
        scope: "printing",
        state: "protect",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:02:00.000Z",
        version: 1,
      },
    ]);
    store.revealSpoilerPrinting("printing-a");
    const submittedDecision = store.readSpoilerSyncState().decisions[0];
    assert.ok(submittedDecision);

    assert.equal(
      store.markSpoilerDecisionSynced(submittedDecision, {
        generation: 0,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:03:00.000Z",
        version: 1,
      }),
      false,
    );
    const decision = store.readSpoilerSyncState().decisions[0];
    assert.equal(decision?.decision.state, "reveal");
    assert.equal(decision?.pending, true);
    assert.equal(decision?.remoteVersion, 1);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a target acknowledgement preserves a newer local reveal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-target-ack-race-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "protect",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.applyRemoteSpoilerDecisions([
      {
        generation: 0,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:00:30.000Z",
        version: 1,
      },
    ]);
    store.protectSpoilerPrinting("printing-a");
    const submitted = store.readSpoilerSyncState().decisions[0];
    assert.ok(submitted);
    store.revealSpoilerPrinting("printing-a");

    assert.equal(
      store.markSpoilerDecisionSynced(submitted, {
        generation: 0,
        scope: "printing",
        state: "protect",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 2,
      }),
      false,
    );
    const pending = store.readSpoilerSyncState().decisions[0];
    assert.equal(pending?.decision.state, "reveal");
    assert.equal(pending?.pending, true);
    assert.equal(pending?.remoteVersion, 2);

    assert.ok(pending);
    assert.equal(
      store.markSpoilerDecisionSynced(pending, {
        generation: 0,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:02:00.000Z",
        version: 3,
      }),
      true,
    );
    assert.equal(store.readSpoilerSyncState().decisions[0]?.pending, false);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a reset acknowledgement keeps a reveal made while the reset was in flight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-reset-ack-race-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "protect",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.protectAllSpoilers();
    const submitted = store.readSpoilerSyncState().global;
    store.revealSpoilerPrinting("printing-a");

    assert.equal(
      store.markSpoilerStateSynced(submitted, {
        policy: "protect",
        resetGeneration: 1,
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 2,
      }),
      true,
    );
    const sync = store.readSpoilerSyncState();
    assert.equal(sync.global.pending, false);
    assert.equal(sync.decisions[0]?.decision.state, "reveal");
    assert.equal(sync.decisions[0]?.decision.generation, 1);
    assert.equal(sync.decisions[0]?.pending, true);
    assert.deepEqual(store.readSpoilerState().activePrintingIds, ["printing-a"]);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a stale target acknowledgement keeps a protect tombstone rebased by a reset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-target-reset-ack-race-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "protect",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.protectAllSpoilers();
    store.protectSpoilerPrinting("printing-a");
    const submitted = store.readSpoilerSyncState().decisions[0];
    assert.ok(submitted);

    store.applyRemoteSpoilerState({
      policy: "show",
      resetGeneration: 1,
      updatedAt: "2026-08-04T10:01:00.000Z",
      version: 2,
    });
    assert.equal(store.readSpoilerSyncState().decisions[0]?.decision.generation, 2);

    assert.equal(
      store.markSpoilerDecisionSynced(submitted, {
        generation: 1,
        scope: "printing",
        state: "protect",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:02:00.000Z",
        version: 1,
      }),
      false,
    );
    const decision = store.readSpoilerSyncState().decisions[0];
    assert.equal(decision?.decision.generation, 2);
    assert.equal(decision?.decision.state, "protect");
    assert.equal(decision?.pending, true);
    assert.equal(decision?.remoteVersion, 1);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("spoiler sync conflicts and stale generations resolve to protection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-conflict-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.applyRemoteSpoilerState({
      policy: "protect",
      resetGeneration: 0,
      updatedAt: "2026-08-04T10:00:00.000Z",
      version: 1,
    });
    store.revealSpoilerPrinting("printing-a");
    store.applyRemoteSpoilerDecisions([
      {
        generation: 0,
        scope: "printing",
        state: "protect",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 1,
      },
    ]);
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    assert.equal(store.readSpoilerSyncState().decisions[0]?.pending, false);

    store.revealSpoilerPrinting("printing-a");
    store.protectAllSpoilers();
    store.applyRemoteSpoilerState({
      policy: "show",
      resetGeneration: 2,
      updatedAt: "2026-08-04T10:02:00.000Z",
      version: 2,
    });
    assert.equal(store.readSpoilerSyncState().global.policy, "protect");
    assert.equal(store.readSpoilerSyncState().global.resetGeneration, 3);
    assert.equal(store.readSpoilerSyncState().global.pending, true);
    store.applyRemoteSpoilerDecisions([
      {
        generation: 0,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:03:00.000Z",
        version: 2,
      },
    ]);
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    assert.equal(store.readSpoilerSyncState().global.pending, true);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("equal remote versions cannot contradict synced spoiler state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-equal-version-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    const updatedAt = "2026-08-04T10:00:00.000Z";
    store.applyRemoteSpoilerState({
      policy: "protect",
      resetGeneration: 0,
      updatedAt,
      version: 1,
    });
    store.applyRemoteSpoilerDecisions([
      {
        generation: 0,
        scope: "printing",
        state: "protect",
        targetId: "printing-a",
        updatedAt,
        version: 1,
      },
    ]);

    assert.equal(
      store.applyRemoteSpoilerState({
        policy: "show",
        resetGeneration: 0,
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 1,
      }),
      "pending",
    );
    store.applyRemoteSpoilerDecisions([
      {
        generation: 0,
        scope: "printing",
        state: "reveal",
        targetId: "printing-a",
        updatedAt: "2026-08-04T10:01:00.000Z",
        version: 1,
      },
    ]);

    const sync = store.readSpoilerSyncState();
    assert.equal(sync.global.policy, "protect");
    assert.equal(sync.global.pending, true);
    assert.equal(sync.decisions[0]?.decision.state, "protect");
    assert.equal(sync.decisions[0]?.pending, true);
    assert.deepEqual(store.readSpoilerState().activePrintingIds, []);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
