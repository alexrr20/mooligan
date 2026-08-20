import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSelectedWorkspace,
  canUseCurrentWorkspace,
  runForSelectedWorkspace,
  runForUnchangedRevision,
  WorkspaceMutationQueue,
} from "../electron/workspace/selection.ts";

void test("terminal auth states without an account keep the current workspace available", () => {
  for (const status of ["signed-out", "protected-storage-unavailable", "sync-paused"] as const) {
    assert.equal(canUseCurrentWorkspace({ status, user: null }), true);
  }
});

void test("account-bearing auth states wait for account workspace selection", () => {
  const user = {
    email: "user-a@example.com",
    id: "user-a",
    image: null,
    name: "User A",
  };

  assert.equal(canUseCurrentWorkspace({ status: "signed-in", user }), false);
  assert.equal(canUseCurrentWorkspace({ status: "sync-paused", user }), false);
});

void test("an asynchronous workspace action cannot cross an account switch", async () => {
  const workspace = { workspaceId: "workspace-a" };
  const lookup = deferred<string>();
  const mutations = new WorkspaceMutationQueue(workspace);
  let changed = false;
  const action = mutations.run(async () => {
    await runForSelectedWorkspace(workspace, () => lookup.promise);
    changed = true;
  });

  await Promise.resolve();
  workspace.workspaceId = "workspace-b";
  lookup.resolve("release-a");

  await assert.rejects(action, /active workspace changed/u);
  assert.equal(changed, false);
});

void test("an asynchronous workspace action returns in its original workspace", async () => {
  const workspace = { workspaceId: "workspace-a" };

  assert.equal(
    await runForSelectedWorkspace(workspace, () => Promise.resolve("release-a")),
    "release-a",
  );
});

void test("spoiler mutations finish in invocation order", async () => {
  const workspace = { workspaceId: "workspace-a" };
  const mutations = new WorkspaceMutationQueue(workspace);
  const lookup = deferred<string>();
  const events: string[] = [];
  let visible = false;
  const reveal = mutations.run(async () => {
    events.push("lookup");
    await runForSelectedWorkspace(workspace, () => lookup.promise);
    visible = true;
    events.push("reveal");
  });
  const protectAll = mutations.run(() => {
    visible = false;
    events.push("protect-all");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["lookup"]);
  lookup.resolve("release-a");
  await Promise.all([reveal, protectAll]);

  assert.equal(visible, false);
  assert.deepEqual(events, ["lookup", "reveal", "protect-all"]);
});

void test("a remote protection change invalidates an in-flight reveal", async () => {
  const workspace = { workspaceId: "workspace-a" };
  const mutations = new WorkspaceMutationQueue(workspace);
  const lookup = deferred<string>();
  let persistedRevision = 1;
  const cachedServiceRevision = 1;
  let visible = false;
  const reveal = mutations.run(async () => {
    await runForUnchangedRevision(
      () => persistedRevision,
      () => lookup.promise,
    );
    visible = true;
  });

  await Promise.resolve();
  persistedRevision = 2;
  lookup.resolve("release-a");

  await assert.rejects(reveal, /Spoiler choices changed/u);
  assert.equal(cachedServiceRevision, 1);
  assert.equal(visible, false);
});

void test("a queued backup commit stays bound to its invocation workspace", async () => {
  const workspace = { workspaceId: "workspace-a" };
  const mutations = new WorkspaceMutationQueue(workspace);
  const invocationWorkspaceId = workspace.workspaceId;
  workspace.workspaceId = "workspace-b";

  await assert.rejects(
    mutations.runFor(invocationWorkspaceId, () => undefined),
    /active workspace changed/u,
  );
  assert.throws(
    () => assertSelectedWorkspace(workspace, invocationWorkspaceId),
    /active workspace changed/u,
  );
});

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
