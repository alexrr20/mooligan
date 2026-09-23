import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { workspaceIdForBindingSecret } from "@mooligan/workspace";

import { WorkspaceRegistry } from "../electron/workspace/registry.ts";

void test("workspace registry keeps a stable client ID and distinct workspace IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-workspace-registry-"));

  try {
    const first = new WorkspaceRegistry(directory);
    const initial = first.bootstrap();
    const initialBindingSecret = first.bindingSecret(initial.workspaceId);
    const nextWorkspaceId = first.createWorkspace();
    const nextBindingSecret = first.bindingSecret(nextWorkspaceId);

    assert.notEqual(nextWorkspaceId, initial.workspaceId);
    assert.equal(workspaceIdForBindingSecret(initialBindingSecret), initial.workspaceId);
    assert.equal(workspaceIdForBindingSecret(nextBindingSecret), nextWorkspaceId);
    assert.equal(Object.hasOwn(initial, "bindingSecret"), false);
    first.bindWorkspace(nextWorkspaceId, "account-one");
    first.activateWorkspace(nextWorkspaceId);
    assert.deepEqual(first.bootstrap(), {
      clientId: initial.clientId,
      workspaceId: nextWorkspaceId,
    });
    first.close();

    const reopened = new WorkspaceRegistry(directory);
    assert.deepEqual(reopened.bootstrap(), {
      clientId: initial.clientId,
      workspaceId: nextWorkspaceId,
    });
    assert.equal(reopened.accountId(nextWorkspaceId), "account-one");
    assert.equal(reopened.bindingSecret(nextWorkspaceId), nextBindingSecret);
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
