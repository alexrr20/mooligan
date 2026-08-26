import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import {
  collectionLotsQuery,
  events,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

import type { WorkspaceLegacyBackupSnapshot } from "../shared/desktop-api.ts";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "../src/features/workspace/workspace-backup.ts";

const emptyLegacySnapshot: WorkspaceLegacyBackupSnapshot = {
  cardLists: [],
  decks: [],
  motion: "reduced",
};

void test("staged backup export reads collection and spoiler state from LiveStore", async () => {
  const store = await openStore("backup-source");
  try {
    store.commit(events.spoilerPolicyChanged({ policy: "show" }));
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-one",
        generation: 0,
        observedDecisionId: null,
        resetId: "initial",
        scope: "printing",
        state: "reveal",
        targetId: "printing-one",
      }),
    );
    store.commit(
      events.collectionCopiesAdded({
        additionId: "addition-one",
        lot: {
          acquiredAt: null,
          condition: "near-mint",
          finish: "foil",
          id: "lot-one",
          language: "en",
          locationId: null,
          notes: null,
          printingId: "printing-one",
          quantity: 2,
          unitCost: null,
        },
      }),
    );

    const backup = createWorkspaceBackup(store, emptyLegacySnapshot);
    assert.deepEqual(backup.preferences, { motion: "reduced", spoilerPolicy: "show" });
    assert.deepEqual(backup.spoilerDecisions, [
      { scope: "printing", state: "reveal", targetId: "printing-one" },
    ]);
    assert.deepEqual(backup.collectionLots, [
      {
        id: "lot-one",
        value: {
          condition: "near-mint",
          finish: "foil",
          id: "lot-one",
          language: "en",
          printingId: "printing-one",
          quantity: 2,
        },
      },
    ]);
  } finally {
    await store.shutdownPromise();
  }
});

void test("staged restore commits and verifies spoiler events in a new LiveStore", async () => {
  const store = await openStore("backup-target");
  try {
    restoreWorkspaceBackup(store, {
      cardLists: [],
      collectionLots: [
        {
          id: "lot-one",
          value: {
            condition: "near-mint",
            finish: "nonfoil",
            id: "lot-one",
            language: "en",
            printingId: "printing-one",
            quantity: 4,
          },
        },
      ],
      decks: [],
      format: "mooligan-workspace",
      preferences: { motion: "system", spoilerPolicy: "protect" },
      spoilerDecisions: [
        { scope: "release", state: "protect", targetId: "release-one" },
        { scope: "printing", state: "reveal", targetId: "printing-one" },
      ],
      version: 2,
    });

    assert.equal(store.query(spoilerSettingsQuery).policy, "protect");
    assert.deepEqual(
      store.query(collectionLotsQuery).map(({ id, quantity }) => ({ id, quantity })),
      [{ id: "lot-one", quantity: 4 }],
    );
    assert.deepEqual(
      store
        .query(spoilerDecisionsQuery)
        .map(({ scope, state, targetId }) => ({ scope, state, targetId })),
      [
        { scope: "printing", state: "reveal", targetId: "printing-one" },
        { scope: "release", state: "protect", targetId: "release-one" },
      ],
    );
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
