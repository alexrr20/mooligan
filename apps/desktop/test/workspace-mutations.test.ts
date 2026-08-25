import assert from "node:assert/strict";
import { test } from "node:test";

import { MutationQueue, runForUnchangedRevision } from "../electron/workspace/mutations.ts";

void test("spoiler mutations finish in invocation order", async () => {
  const mutations = new MutationQueue();
  const lookup = deferred<string>();
  const events: string[] = [];
  let visible = false;
  const reveal = mutations.run(async () => {
    events.push("lookup");
    await lookup.promise;
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

void test("a local protection change invalidates an in-flight reveal", async () => {
  const mutations = new MutationQueue();
  const lookup = deferred<string>();
  let revision = 1;
  let visible = false;
  const reveal = mutations.run(async () => {
    await runForUnchangedRevision(
      () => revision,
      () => lookup.promise,
    );
    visible = true;
  });

  await Promise.resolve();
  revision = 2;
  lookup.resolve("release-a");

  await assert.rejects(reveal, /Spoiler choices changed/u);
  assert.equal(visible, false);
});

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
