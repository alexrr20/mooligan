import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import * as z from "zod";

import { validatePreferencesUpdate } from "../electron/workspace/preferences.ts";
import { WorkspaceStore } from "../electron/workspace/store.ts";

void test("the legacy workspace store retains only staged collection and motion data", async () => {
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
    assert.deepEqual(initial.updatePreferences({ motion: "reduced" }), { motion: "reduced" });
    initial.close();

    const reopened = new WorkspaceStore(path);
    assert.equal(reopened.workspaceId, workspaceId);
    assert.deepEqual(reopened.readPreferences(), { motion: "reduced" });
    reopened.close();

    const database = new DatabaseSync(path, { readOnly: true });
    try {
      const tableNames = z
        .array(z.object({ name: z.string() }))
        .parse(
          database
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
            .all(),
        )
        .map(({ name }) => name);
      assert.equal(tableNames.includes("spoiler_state"), false);
      assert.equal(tableNames.includes("spoiler_decisions"), false);
      assert.deepEqual(
        database
          .prepare("SELECT key FROM preferences ORDER BY key")
          .all()
          .map((row) => row.key),
        ["motion"],
      );
    } finally {
      database.close();
    }

    assert.throws(
      () => validatePreferencesUpdate({ currency: "EUR" }),
      /Unknown preference: currency/,
    );
    assert.throws(
      () => validatePreferencesUpdate({ motion: "sometimes" }),
      /Invalid motion preference/,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
