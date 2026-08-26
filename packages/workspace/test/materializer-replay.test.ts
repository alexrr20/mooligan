import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";

import {
  events,
  initialSpoilerResetId,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "../src/schema.ts";

void test("workspace events replay to the same materialized state", async () => {
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

async function replay(storeId: string) {
  const store = await createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });

  try {
    store.commit(events.spoilerPolicyChanged({ policy: "show" }));
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-a",
        generation: 0,
        observedDecisionId: null,
        resetId: initialSpoilerResetId,
        scope: "printing",
        state: "reveal",
        targetId: "printing-one",
      }),
    );
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-b",
        generation: 0,
        observedDecisionId: null,
        resetId: initialSpoilerResetId,
        scope: "printing",
        state: "protect",
        targetId: "printing-one",
      }),
    );
    store.commit(events.spoilerProtectionReset({ generation: 1, resetId: "reset-one" }));
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-c",
        generation: 0,
        observedDecisionId: "decision-a",
        resetId: initialSpoilerResetId,
        scope: "printing",
        state: "reveal",
        targetId: "printing-one",
      }),
    );
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-d",
        generation: 1,
        observedDecisionId: null,
        resetId: "reset-one",
        scope: "release",
        state: "reveal",
        targetId: "set-one",
      }),
    );

    return {
      decisions: store.query(spoilerDecisionsQuery),
      settings: store.query(spoilerSettingsQuery),
    };
  } finally {
    await store.shutdownPromise();
  }
}
