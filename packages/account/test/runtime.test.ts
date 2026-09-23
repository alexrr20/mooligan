import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceIdForBindingSecret } from "@mooligan/workspace";
import { validateWorkspaceBootstrap } from "../src/runtime.ts";

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
