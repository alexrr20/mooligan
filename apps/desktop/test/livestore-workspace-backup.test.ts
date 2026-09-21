import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import type { WorkspaceBackup } from "@mooligan/workspace/backup";
import {
  collectionLotsQuery,
  events,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";

void test("backup v7 reads collection, deck, and spoiler state from LiveStore", async () => {
  const store = await openStore("backup-source");
  try {
    store.commit(events.spoilerPolicyChanged({ policy: "show" }));
    store.commit(events.spoilerProtectionReset({ generation: 4, resetId: "reset-four" }));
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-one",
        generation: 4,
        observedDecisionId: null,
        resetId: "reset-four",
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

    const backup = createWorkspaceBackup(store);
    assert.deepEqual(backup, {
      collectionLots: [
        {
          acquiredAt: undefined,
          condition: "near-mint",
          finish: "foil",
          id: "lot-one",
          language: "en",
          locationId: undefined,
          notes: undefined,
          printingId: "printing-one",
          quantity: 2,
          unitCost: undefined,
        },
      ],
      decks: [],
      format: "mooligan-workspace",
      priceCurrency: "EUR",
      priceProviders: ["cardmarket", "tcgplayer", "cardkingdom", "cardsphere", "manapool"],
      profile: { bannerPrintingId: null, featuredPrintingIds: [null, null, null, null] },
      spoilers: {
        decisions: [{ scope: "printing", state: "reveal", targetId: "printing-one" }],
        policy: "show",
        resetGeneration: 4,
      },
      version: 7,
    });
    assert.equal(Object.hasOwn(backup, "clientId"), false);
    assert.equal(Object.hasOwn(backup, "motion"), false);
  } finally {
    await store.shutdownPromise();
  }
});

void test("backup v7 restore commits and verifies normal LiveStore events", async () => {
  const store = await openStore("backup-target");
  try {
    await restoreWorkspaceBackup(store, backupFixture);

    const settings = store.query(spoilerSettingsQuery);
    assert.deepEqual(
      { ...settings, resetId: "restored" },
      {
        id: "spoilers",
        policy: "protect",
        resetGeneration: 7,
        resetId: "restored",
      },
    );
    assert.match(settings.resetId, /^[0-9a-f-]{36}$/u);
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

void test("restore verification rejects a non-empty target store", async () => {
  const store = await openStore("backup-non-empty-target");
  try {
    store.commit(
      events.collectionCopiesAdded({
        additionId: "existing-addition",
        lot: {
          acquiredAt: null,
          condition: "near-mint",
          finish: "nonfoil",
          id: "existing-lot",
          language: "en",
          locationId: null,
          notes: null,
          printingId: "existing-printing",
          quantity: 1,
          unitCost: null,
        },
      }),
    );

    await assert.rejects(restoreWorkspaceBackup(store, backupFixture), /could not be verified/u);
  } finally {
    await store.shutdownPromise();
  }
});

const backupFixture: WorkspaceBackup = {
  collectionLots: [
    {
      condition: "near-mint",
      finish: "nonfoil",
      id: "lot-one",
      language: "en",
      printingId: "printing-one",
      quantity: 4,
    },
  ],
  decks: [],
  format: "mooligan-workspace",
  priceCurrency: "EUR",
  priceProviders: ["cardmarket", "tcgplayer", "cardkingdom", "cardsphere", "manapool"],
  profile: { bannerPrintingId: null, featuredPrintingIds: [null, null, null, null] },
  spoilers: {
    decisions: [
      { scope: "release", state: "protect", targetId: "release-one" },
      { scope: "printing", state: "reveal", targetId: "printing-one" },
    ],
    policy: "protect",
    resetGeneration: 7,
  },
  version: 7,
};

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}
