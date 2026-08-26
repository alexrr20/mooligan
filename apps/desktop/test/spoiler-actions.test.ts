import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import {
  events,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

import { runSpoilerAction } from "../src/features/spoilers/spoiler-actions.ts";

void test("protecting a printing observes a release reveal completed during catalog lookup", async () => {
  const store = await openStore("protect-printing-race");
  try {
    const settings = store.query(spoilerSettingsQuery);
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "printing-reveal",
        generation: settings.resetGeneration,
        observedDecisionId: null,
        resetId: settings.resetId,
        scope: "printing",
        state: "reveal",
        targetId: "printing-one",
      }),
    );

    const lookup = deferred<string | null>();
    const protection = runSpoilerAction(
      store,
      { targetId: "printing-one", type: "protect-printing" },
      () => lookup.promise,
    );

    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "release-reveal",
        generation: settings.resetGeneration,
        observedDecisionId: null,
        resetId: settings.resetId,
        scope: "release",
        state: "reveal",
        targetId: "release-one",
      }),
    );
    lookup.resolve("release-one");

    await assert.rejects(protection, /Protect this release before/u);
    assert.equal(
      store
        .query(spoilerDecisionsQuery)
        .find(({ scope, targetId }) => scope === "printing" && targetId === "printing-one")?.state,
      "reveal",
    );
  } finally {
    await store.shutdownPromise();
  }
});

void test("an in-flight reveal cannot undo a completed protection reset", async () => {
  const store = await openStore("reveal-reset-race");
  try {
    const settings = store.query(spoilerSettingsQuery);
    const lookup = deferred<string | null>();
    const reveal = runSpoilerAction(
      store,
      { targetId: "printing-one", type: "reveal-printing" },
      () => lookup.promise,
    );

    store.commit(
      events.spoilerProtectionReset({
        generation: settings.resetGeneration + 1,
        resetId: "new-reset",
      }),
    );
    lookup.resolve("release-one");

    await assert.rejects(reveal, /Spoiler protection changed/u);
    assert.deepEqual(store.query(spoilerDecisionsQuery), []);
  } finally {
    await store.shutdownPromise();
  }
});

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
