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
    assert.deepEqual(initial.readPreferences(), { motion: "system" });
    assert.deepEqual(initial.readPreferenceSyncState(), {
      motion: { conflict: null, pending: false, remoteVersion: null },
    });
    initial.close();

    const updated = new WorkspaceStore(path);

    assert.equal(updated.workspaceId, workspaceId);
    assert.deepEqual(updated.updatePreferences({ motion: "reduced" }), { motion: "reduced" });
    assert.equal(updated.readPreferenceSyncState().motion.pending, true);
    updated.close();

    const reopened = new WorkspaceStore(path);

    try {
      assert.equal(reopened.workspaceId, workspaceId);
      assert.deepEqual(reopened.readPreferences(), { motion: "reduced" });
      assert.equal(reopened.readPreferenceSyncState().motion.pending, true);
      assert.throws(
        () => validatePreferencesUpdate({ currency: "EUR" }),
        /Unknown preference: currency/,
      );
      assert.throws(
        () => validatePreferencesUpdate({ motion: "sometimes" }),
        /Invalid motion preference/,
      );
      assert.deepEqual(reopened.readPreferences(), { motion: "reduced" });
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
    assert.deepEqual(manager.readPreferences(), { motion: "system" });
    manager.updatePreferences({ motion: "reduced" });
    manager.bindActiveWorkspace("user-b", "remote-b");
    manager.close();

    const reopened = new WorkspaceManager(directory);

    assert.equal(reopened.workspaceId, userBWorkspaceId);
    assert.equal(reopened.boundUserId, "user-b");
    assert.equal(reopened.remoteWorkspaceId, "remote-b");
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced" });

    assert.equal(reopened.selectForUser("user-a").workspaceId, accountFreeWorkspaceId);
    assert.equal(reopened.remoteWorkspaceId, "remote-a");
    assert.deepEqual(reopened.readPreferences(), { motion: "full" });

    assert.equal(reopened.selectForUser("user-b").workspaceId, userBWorkspaceId);
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced" });
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
    assert.deepEqual(manager.readPreferences(), { motion: "full" });
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
    assert.deepEqual(manager.readPreferences(), { motion: "reduced" });
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
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced" });
    assert.deepEqual(reopened.readPreferenceSyncState(), {
      motion: { conflict: null, pending: false, remoteVersion: 4 },
    });
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
