import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { workspaceIdForBindingSecret } from "@mooligan/workspace";

import { WorkspaceRegistry } from "../electron/workspace/registry.ts";
import { validateWorkspaceBootstrap } from "../shared/desktop-api.ts";

void test("workspace bootstrap accepts only renderer-safe IDs", () => {
  const bindingSecret = "a432285d-036a-4c6f-85b5-ad70550dc03e";
  const bootstrap = {
    clientId: "0116d9f3-b986-4a0c-a6b1-d18da840576b",
    workspaceId: workspaceIdForBindingSecret(bindingSecret),
  };

  assert.deepEqual(validateWorkspaceBootstrap(bootstrap), bootstrap);
  assert.throws(
    () => validateWorkspaceBootstrap({ ...bootstrap, workspacePath: "/private/workspace.sqlite" }),
    /is unexpected/u,
  );
  assert.throws(
    () => validateWorkspaceBootstrap({ ...bootstrap, bindingSecret }),
    /is unexpected/u,
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
