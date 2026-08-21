import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { CollectionLot } from "@mooligan/domain/collection";
import type { Deck } from "@mooligan/domain/decks";
import type { CardList } from "@mooligan/domain/lists";

import { parseWorkspaceBackup } from "../electron/workspace/backup.ts";
import { WorkspaceManager, WorkspaceStore } from "../electron/workspace/store.ts";

const collectionLot: CollectionLot = {
  acquiredAt: "2026-08-01T10:00:00.000Z",
  condition: "near-mint",
  finish: "foil",
  id: "lot-stable-id",
  language: "en",
  notes: "Draft night",
  printingId: "printing-1",
  quantity: 2,
  unitCost: { amountMinor: 125, currency: "EUR" },
};

const deck: Deck = {
  createdAt: "2026-08-02T10:00:00.000Z",
  entries: [
    {
      finish: "foil",
      id: "deck-entry-stable-id",
      printingId: "printing-1",
      quantity: 1,
      section: "mainboard",
    },
  ],
  formatId: "commander",
  id: "deck-stable-id",
  name: "Library test",
  tags: ["paper"],
  updatedAt: "2026-08-03T10:00:00.000Z",
};

const cardList: CardList = {
  createdAt: "2026-08-02T11:00:00.000Z",
  entries: [
    {
      cardId: "card-1",
      desiredPrinting: { finish: "nonfoil", printingId: "printing-2" },
      id: "list-entry-stable-id",
      quantity: 3,
    },
  ],
  id: "list-stable-id",
  name: "Trade targets",
  updatedAt: "2026-08-03T11:00:00.000Z",
};

void test("workspace backups round-trip user data while preserving local metadata", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "mooligan-backup-source-"));
  const targetDirectory = await mkdtemp(join(tmpdir(), "mooligan-backup-target-"));

  try {
    const source = new WorkspaceStore(join(sourceDirectory, "workspace.sqlite"));
    putCollectionLotThroughBackup(source, collectionLot);
    source.updatePreferences({ motion: "reduced" });
    source.putDeck(deck);
    source.putCardList(cardList);
    source.revealSpoilerPrinting("preview-printing");
    source.protectSpoilerRelease("preview-release");
    const backup = source.createBackup();
    source.close();

    const exported = parseWorkspaceBackup(backup);
    assert.deepEqual(Object.keys(exported).sort(), [
      "cardLists",
      "collectionLots",
      "decks",
      "format",
      "preferences",
      "spoilerDecisions",
      "version",
    ]);
    assert.equal(exported.format, "mooligan-workspace");
    assert.equal(exported.version, 2);
    assert.equal(Object.hasOwn(exported, "workspaceId"), false);
    assert.equal(Object.hasOwn(exported, "boundUserId"), false);
    assert.equal(Object.hasOwn(exported, "remoteWorkspaceId"), false);
    assert.deepEqual(exported.spoilerDecisions, [
      { scope: "printing", state: "reveal", targetId: "preview-printing" },
      { scope: "release", state: "protect", targetId: "preview-release" },
    ]);

    const target = new WorkspaceManager(targetDirectory);
    target.selectForUser("target-user");
    target.bindActiveWorkspace("target-user", "target-remote");
    const targetWorkspaceId = target.workspaceId;
    putCollectionLotThroughBackup(target, { ...collectionLot, id: "old-lot" });
    target.applyRemotePreference({
      updatedAt: "2026-08-04T10:00:00.000Z",
      value: "full",
      version: 8,
    });

    target.importBackup(exported);

    assert.equal(target.workspaceId, targetWorkspaceId);
    assert.equal(target.boundUserId, "target-user");
    assert.equal(target.remoteWorkspaceId, "target-remote");
    assert.deepEqual(target.readPreferences(), { motion: "reduced", spoilerPolicy: "protect" });
    assert.deepEqual(target.readPreferenceSyncState(), {
      motion: { conflict: null, pending: true, remoteVersion: 8 },
    });
    assert.deepEqual(target.readCollectionLots(), [collectionLot]);
    assert.deepEqual(target.readDecks(), [deck]);
    assert.deepEqual(target.readCardLists(), [cardList]);
    assert.equal(target.readDecks()[0]?.entries[0]?.id, "deck-entry-stable-id");
    assert.equal(target.readCardLists()[0]?.entries[0]?.id, "list-entry-stable-id");
    assert.deepEqual(target.readSpoilerState().activePrintingIds, ["preview-printing"]);
    assert.deepEqual(
      target.readSpoilerSyncState().decisions.map(({ decision, pending, remoteVersion }) => ({
        generation: decision.generation,
        pending,
        remoteVersion,
        scope: decision.scope,
        state: decision.state,
        targetId: decision.targetId,
      })),
      [
        {
          generation: 2,
          pending: true,
          remoteVersion: null,
          scope: "printing",
          state: "reveal",
          targetId: "preview-printing",
        },
        {
          generation: 2,
          pending: true,
          remoteVersion: null,
          scope: "release",
          state: "protect",
          targetId: "preview-release",
        },
      ],
    );
    assert.equal(target.readSpoilerSyncState().global.resetGeneration, 2);
    assert.equal(target.readSpoilerSyncState().global.pending, true);
    assert.deepEqual(JSON.parse(target.createBackup()), JSON.parse(backup));
    target.close();
  } finally {
    await Promise.all([
      rm(sourceDirectory, { force: true, recursive: true }),
      rm(targetDirectory, { force: true, recursive: true }),
    ]);
  }
});

void test("version 1 workspace backups import with spoiler protection enabled", () => {
  const backup = parseWorkspaceBackup(
    JSON.stringify({
      cardLists: [{ id: cardList.id, value: cardList }],
      collectionLots: [{ id: collectionLot.id, value: collectionLot }],
      decks: [{ id: deck.id, value: deck }],
      format: "mooligan-workspace",
      preferences: { motion: "reduced" },
      version: 1,
    }),
  );

  assert.equal(backup.version, 2);
  assert.deepEqual(backup.preferences, { motion: "reduced", spoilerPolicy: "protect" });
  assert.deepEqual(backup.spoilerDecisions, []);
  assert.deepEqual(backup.collectionLots, [{ id: collectionLot.id, value: collectionLot }]);
  assert.deepEqual(backup.decks, [{ id: deck.id, value: deck }]);
  assert.deepEqual(backup.cardLists, [{ id: cardList.id, value: cardList }]);
});

void test("remote resets supersede imported reveal consent", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "mooligan-backup-spoiler-source-"));
  const targetDirectory = await mkdtemp(join(tmpdir(), "mooligan-backup-spoiler-target-"));

  try {
    const source = new WorkspaceStore(join(sourceDirectory, "workspace.sqlite"));
    source.setSpoilerPolicy("show");
    source.revealSpoilerPrinting("preview-printing");
    const backup = source.createBackup();
    source.close();

    const scenarios = [
      { expectedGeneration: 2, expectedPolicy: "protect", name: "equal", remoteGeneration: 1 },
      { expectedGeneration: 11, expectedPolicy: "protect", name: "higher", remoteGeneration: 10 },
    ] as const;

    for (const scenario of scenarios) {
      const target = new WorkspaceStore(join(targetDirectory, `${scenario.name}.sqlite`));
      target.importBackup(parseWorkspaceBackup(backup));
      target.applyRemoteSpoilerState({
        policy: scenario.expectedPolicy,
        resetGeneration: scenario.remoteGeneration,
        updatedAt: "2026-08-04T10:00:00.000Z",
        version: 1,
      });

      const sync = target.readSpoilerSyncState();
      assert.equal(sync.global.policy, scenario.expectedPolicy);
      assert.equal(sync.global.resetGeneration, scenario.expectedGeneration);
      assert.equal(sync.global.pending, true);
      assert.deepEqual(target.readSpoilerState().activePrintingIds, []);
      assert.deepEqual(sync.decisions, []);

      assert.equal(
        target.markSpoilerStateSynced(sync.global, {
          policy: scenario.expectedPolicy,
          resetGeneration: scenario.expectedGeneration,
          updatedAt: "2026-08-04T10:01:00.000Z",
          version: 2,
        }),
        true,
      );
      assert.equal(target.readSpoilerSyncState().global.pending, false);
      target.close();
    }
  } finally {
    await Promise.all([
      rm(sourceDirectory, { force: true, recursive: true }),
      rm(targetDirectory, { force: true, recursive: true }),
    ]);
  }
});

void test("invalid backups are fully rejected before any workspace data changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-backup-invalid-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.bind("bound-user", "remote-workspace");
    store.updatePreferences({ motion: "full" });
    putCollectionLotThroughBackup(store, { ...collectionLot, id: "existing-lot" });
    store.putDeck({ ...deck, id: "existing-deck" });
    store.putCardList({ ...cardList, id: "existing-list" });
    const before = store.createBackup();
    const workspaceId = store.workspaceId;

    const replacement = parseWorkspaceBackup(
      JSON.stringify({
        cardLists: [{ id: cardList.id, value: cardList }],
        collectionLots: [{ id: collectionLot.id, value: collectionLot }],
        decks: [{ id: deck.id, value: deck }],
        format: "mooligan-workspace",
        preferences: { motion: "reduced", spoilerPolicy: "protect" },
        spoilerDecisions: [],
        version: 2,
      }),
    );

    replacement.decks[0].id = "does-not-match-payload";
    assert.throws(() => parseWorkspaceBackup(JSON.stringify(replacement)), /deck IDs are invalid/);
    assert.equal(store.createBackup(), before);

    replacement.decks[0].id = deck.id;
    replacement.decks[0].value.entries[0].quantity = 0;
    assert.throws(() => parseWorkspaceBackup(JSON.stringify(replacement)), /deck is invalid/);
    assert.equal(store.createBackup(), before);

    replacement.decks[0].value.entries[0].quantity = 1;
    Object.assign(replacement.decks[0].value.entries[0], { unexpected: true });
    assert.throws(() => parseWorkspaceBackup(JSON.stringify(replacement)), /invalid fields/);

    const unattributed: Omit<CollectionLot, "id"> = {
      condition: "near-mint",
      finish: "foil",
      language: "en",
      printingId: "printing-duplicate",
      quantity: 1,
    };
    assert.throws(
      () =>
        parseWorkspaceBackup(
          JSON.stringify({
            ...replacement,
            collectionLots: [
              { id: "duplicate-a", value: { ...unattributed, id: "duplicate-a" } },
              { id: "duplicate-b", value: { ...unattributed, id: "duplicate-b" } },
            ],
            decks: [],
          }),
        ),
      /workspace backup is invalid/,
    );

    assert.equal(store.createBackup(), before);
    assert.equal(store.workspaceId, workspaceId);
    assert.equal(store.boundUserId, "bound-user");
    assert.equal(store.remoteWorkspaceId, "remote-workspace");
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

function putCollectionLotThroughBackup(
  workspace: Pick<WorkspaceStore, "createBackup" | "importBackup">,
  lot: CollectionLot,
) {
  const backup = parseWorkspaceBackup(workspace.createBackup());
  backup.collectionLots.push({ id: lot.id, value: lot });
  workspace.importBackup(backup);
}
