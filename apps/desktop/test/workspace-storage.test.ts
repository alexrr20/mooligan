import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { requirePersistentWorkspaceStorage } from "../src/features/workspace/workspace-storage.ts";

void test("a Workspace never falls back to temporary memory when OPFS is unavailable", () => {
  assert.doesNotThrow(() => requirePersistentWorkspaceStorage("persisted"));
  assert.throws(
    () => requirePersistentWorkspaceStorage("in-memory"),
    /refused to open a temporary in-memory Workspace/u,
  );
});

void test("a sync backend reset shuts down without clearing the local Workspace", async () => {
  const workerSource = await readFile(
    new URL("../src/features/workspace/livestore-sync.worker.ts", import.meta.url),
    "utf8",
  );

  assert.match(workerSource, /onBackendIdMismatch:\s*"shutdown"/u);
  assert.doesNotMatch(workerSource, /onBackendIdMismatch:\s*"reset"/u);
});
