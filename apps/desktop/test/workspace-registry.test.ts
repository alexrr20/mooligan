import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { WorkspaceRegistry } from "../electron/workspace/registry.ts";
import { validateWorkspaceBootstrap } from "../shared/desktop-api.ts";

void test("workspace bootstrap accepts only renderer-safe IDs", () => {
  const bootstrap = {
    clientId: "0116d9f3-b986-4a0c-a6b1-d18da840576b",
    workspaceId: "42aefc23-ea80-4e4a-8cbc-8905f405ccf8",
  };

  assert.deepEqual(validateWorkspaceBootstrap(bootstrap), bootstrap);
  assert.throws(
    () => validateWorkspaceBootstrap({ ...bootstrap, workspacePath: "/private/workspace.sqlite" }),
    /Unrecognized key/u,
  );
  assert.throws(
    () => validateWorkspaceBootstrap({ ...bootstrap, clientId: "not-a-client-id" }),
    /UUID/u,
  );
});

void test("workspace registry keeps a stable client ID and distinct workspace IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-workspace-registry-"));

  try {
    const first = new WorkspaceRegistry(directory);
    const initial = first.bootstrap();
    const nextWorkspaceId = first.createWorkspace();

    assert.notEqual(nextWorkspaceId, initial.workspaceId);
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
    reopened.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
