import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { validatePreferencesUpdate } from "../electron/workspace/preferences.ts";
import { WorkspaceStore } from "../electron/workspace/store.ts";

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
    initial.close();

    const updated = new WorkspaceStore(path);

    assert.equal(updated.workspaceId, workspaceId);
    assert.deepEqual(updated.updatePreferences({ motion: "reduced" }), {
      motion: "reduced",
      spoilerPolicy: "protect",
    });
    updated.close();

    const reopened = new WorkspaceStore(path);

    try {
      assert.equal(reopened.workspaceId, workspaceId);
      assert.deepEqual(reopened.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
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

    store.setSpoilerPolicy("show");
    assert.deepEqual(store.protectAllSpoilers(), {
      activePrintingIds: [],
      activeRootSetIds: [],
      policy: "protect",
      revision: 5,
    });

    store.revealSpoilerPrinting("printing-a");
    assert.deepEqual(store.readSpoilerState().activePrintingIds, ["printing-a"]);
    store.close();

    const reopened = new WorkspaceStore(path);
    assert.deepEqual(reopened.readSpoilerState().activePrintingIds, ["printing-a"]);
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
