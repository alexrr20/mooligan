import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise, type Store } from "@livestore/livestore";

import {
  events,
  initialSpoilerResetId,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "../src/schema.ts";

type WorkspaceLiveStore = Store<typeof workspaceSchema>;

void test("a causally observed decision replaces the decision it observed", async () => {
  await withStore("causal", (store) => {
    commitDecision(store, { decisionId: "decision-a", state: "protect" });
    commitDecision(store, {
      decisionId: "decision-b",
      observedDecisionId: "decision-a",
      state: "reveal",
    });

    assert.deepEqual(readDecisionStates(store), ["reveal"]);
  });
});

void test("concurrent reveal and protect decisions resolve to protect in either order", async () => {
  for (const [storeId, first, second] of [
    ["concurrent-reveal-first", "reveal", "protect"],
    ["concurrent-protect-first", "protect", "reveal"],
  ] as const) {
    await withStore(storeId, (store) => {
      commitDecision(store, { decisionId: `${storeId}-a`, state: first });
      commitDecision(store, { decisionId: `${storeId}-b`, state: second });

      assert.deepEqual(readDecisionStates(store), ["protect"]);
    });
  }
});

void test("re-protection remains an explicit tombstone", async () => {
  await withStore("tombstone", (store) => {
    commitDecision(store, { decisionId: "decision-a", state: "reveal" });
    commitDecision(store, {
      decisionId: "decision-b",
      observedDecisionId: "decision-a",
      state: "protect",
    });

    assert.deepEqual(store.query(spoilerDecisionsQuery), [
      {
        decisionId: "decision-b",
        generation: 0,
        id: "printing:printing-one",
        observedDecisionId: "decision-a",
        resetId: initialSpoilerResetId,
        scope: "printing",
        state: "protect",
        targetId: "printing-one",
      },
    ]);
  });
});

void test("a reset invalidates reveals from the previous generation", async () => {
  await withStore("reset", (store) => {
    commitDecision(store, { decisionId: "decision-a", state: "reveal" });
    store.commit(events.spoilerProtectionReset({ generation: 1, resetId: "reset-one" }));

    assert.deepEqual(store.query(spoilerDecisionsQuery), []);
    assert.deepEqual(store.query(spoilerSettingsQuery), {
      id: "spoilers",
      policy: "protect",
      resetGeneration: 1,
      resetId: "reset-one",
    });
  });
});

void test("a stale offline reveal cannot undo a later reset", async () => {
  await withStore("stale-reveal", (store) => {
    store.commit(events.spoilerProtectionReset({ generation: 1, resetId: "reset-one" }));
    commitDecision(store, {
      decisionId: "stale-decision",
      generation: 0,
      resetId: initialSpoilerResetId,
      state: "reveal",
    });

    assert.deepEqual(store.query(spoilerDecisionsQuery), []);
  });
});

void test("globally ordered workspace events replay to the same materialized state", async () => {
  const first = await replay("replay-a");
  const second = await replay("replay-b");

  assert.deepEqual(second, first);
  assert.deepEqual(first, {
    decisions: [
      {
        decisionId: "decision-d",
        generation: 1,
        id: "release:set-one",
        observedDecisionId: null,
        resetId: "reset-one",
        scope: "release",
        state: "reveal",
        targetId: "set-one",
      },
    ],
    settings: {
      id: "spoilers",
      policy: "show",
      resetGeneration: 1,
      resetId: "reset-one",
    },
  });
});

async function withStore(storeId: string, run: (store: WorkspaceLiveStore) => void) {
  const store = await openStore(storeId);
  try {
    run(store);
  } finally {
    await store.shutdownPromise();
  }
}

async function replay(storeId: string) {
  const store = await openStore(storeId);

  try {
    store.commit(events.spoilerPolicyChanged({ policy: "show" }));
    commitDecision(store, { decisionId: "decision-a", state: "reveal" });
    commitDecision(store, { decisionId: "decision-b", state: "protect" });
    store.commit(events.spoilerProtectionReset({ generation: 1, resetId: "reset-one" }));
    commitDecision(store, {
      decisionId: "decision-c",
      generation: 0,
      observedDecisionId: "decision-a",
      resetId: initialSpoilerResetId,
      state: "reveal",
    });
    commitDecision(store, {
      decisionId: "decision-d",
      generation: 1,
      resetId: "reset-one",
      scope: "release",
      state: "reveal",
      targetId: "set-one",
    });

    return {
      decisions: store.query(spoilerDecisionsQuery),
      settings: store.query(spoilerSettingsQuery),
    };
  } finally {
    await store.shutdownPromise();
  }
}

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}

function commitDecision(
  store: WorkspaceLiveStore,
  decision: {
    decisionId: string;
    generation?: number;
    observedDecisionId?: null | string;
    resetId?: string;
    scope?: "printing" | "release";
    state: "protect" | "reveal";
    targetId?: string;
  },
) {
  store.commit(
    events.spoilerDecisionChanged({
      generation: 0,
      observedDecisionId: null,
      resetId: initialSpoilerResetId,
      scope: "printing",
      targetId: "printing-one",
      ...decision,
    }),
  );
}

function readDecisionStates(store: WorkspaceLiveStore) {
  return store.query(spoilerDecisionsQuery).map(({ state }) => state);
}
