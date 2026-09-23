import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import { Schema } from "effect";
import type { WorkspaceBackup } from "@mooligan/workspace/backup";
import { collectionLotsQuery } from "@mooligan/workspace/collection";
import { events, workspaceSchema, workspaceSyncedEventSchema } from "@mooligan/workspace/schema";
import { spoilerDecisionsQuery, spoilerSettingsQuery } from "@mooligan/workspace/spoilers";

import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";

void test("backup v9 reads collection, deck, and spoiler state from LiveStore", async () => {
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
      cardTags: [],
      tagAssignments: [],
      tagTemplates: [],
      version: 9,
    });
    assert.equal(Object.hasOwn(backup, "clientId"), false);
    assert.equal(Object.hasOwn(backup, "motion"), false);
  } finally {
    await store.shutdownPromise();
  }
});

void test("backup v9 restore commits and verifies normal LiveStore events", async () => {
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

void test("restore groups assignments by tag into bounded events and keeps 500-event batches", async (t) => {
  const store = await openStore("backup-many-tags");
  try {
    const cardTags = Array.from({ length: 500 }, (_, index) => ({
      id: `tag-${index}`,
      name: `Tag ${index}`,
      color: "sage" as const,
      deckId: null,
    }));
    const tagAssignments = Array.from({ length: 10_001 }, (_, index) => [
      { tagId: "tag-0", cardId: `card-${index}` },
      { tagId: "tag-1", cardId: `card-${index}` },
    ]).flat();
    const commit = t.mock.method(store, "commit");
    await restoreWorkspaceBackup(store, { ...backupFixture, cardTags, tagAssignments });
    const batches = commit.mock.calls.map(({ arguments: args }) => args.slice(1));
    assert.equal(batches[0]?.length, 500);
    assert.ok(batches.every((batch) => batch.length <= 500));
    const tagging = batches.flat().flatMap((event) => {
      const decoded = Schema.decodeUnknownSync(workspaceSyncedEventSchema)(event);
      return decoded.name === events.cardsTagged.name ? [decoded] : [];
    });
    assert.deepEqual(
      tagging.map(({ args }) => [args.tagId, args.cardIds.length]),
      [
        ["tag-0", 10_000],
        ["tag-0", 1],
        ["tag-1", 10_000],
        ["tag-1", 1],
      ],
    );
    assert.equal(createWorkspaceBackup(store).tagAssignments.length, tagAssignments.length);
  } finally {
    await store.shutdownPromise();
  }
});

const backupFixture: WorkspaceBackup = {
  collectionLots: [
    {
      acquiredAt: null,
      condition: "near-mint",
      finish: "nonfoil",
      id: "lot-one",
      language: "en",
      locationId: null,
      notes: null,
      printingId: "printing-one",
      quantity: 4,
      unitCost: null,
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
  cardTags: [],
  tagAssignments: [],
  tagTemplates: [],
  version: 9,
};

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}
