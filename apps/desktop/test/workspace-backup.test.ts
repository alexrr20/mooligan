import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { CollectionLot } from "@mooligan/domain/collection";
import type { Deck } from "@mooligan/domain/decks";
import type { CardList } from "@mooligan/domain/lists";

import type { WorkspaceBackup, WorkspaceLegacyBackupSnapshot } from "../shared/desktop-api.ts";
import { parseWorkspaceBackup, serializeWorkspaceBackup } from "../electron/workspace/backup.ts";
import { WorkspaceRegistry } from "../electron/workspace/registry.ts";
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
  entries: [],
  formatId: "commander",
  id: "deck-stable-id",
  name: "Library test",
  tags: ["paper"],
  updatedAt: "2026-08-03T10:00:00.000Z",
};
const cardList: CardList = {
  createdAt: "2026-08-02T11:00:00.000Z",
  entries: [],
  id: "list-stable-id",
  name: "Trade targets",
  updatedAt: "2026-08-03T11:00:00.000Z",
};
const legacySnapshot: WorkspaceLegacyBackupSnapshot = {
  cardLists: [{ id: cardList.id, value: cardList }],
  decks: [{ id: deck.id, value: deck }],
  motion: "reduced",
};
const fullBackup: WorkspaceBackup = {
  cardLists: legacySnapshot.cardLists,
  collectionLots: [{ id: collectionLot.id, value: collectionLot }],
  decks: legacySnapshot.decks,
  format: "mooligan-workspace",
  preferences: { motion: "reduced", spoilerPolicy: "show" },
  spoilerDecisions: [
    { scope: "printing", state: "reveal", targetId: "preview-printing" },
    { scope: "release", state: "protect", targetId: "preview-release" },
  ],
  version: 2,
};

void test("version 2 backups retain LiveStore spoiler state without workspace metadata", () => {
  const parsed = parseWorkspaceBackup(serializeWorkspaceBackup(fullBackup));

  assert.deepEqual(parsed, fullBackup);
  assert.equal(Object.hasOwn(parsed, "workspaceId"), false);
  assert.deepEqual(parsed.spoilerDecisions, fullBackup.spoilerDecisions);
});

void test("version 1 backups still enter the staged restore with protection enabled", () => {
  const backup = parseWorkspaceBackup(
    JSON.stringify({
      cardLists: legacySnapshot.cardLists,
      collectionLots: fullBackup.collectionLots,
      decks: legacySnapshot.decks,
      format: "mooligan-workspace",
      preferences: { motion: "reduced" },
      version: 1,
    }),
  );

  assert.equal(backup.version, 2);
  assert.deepEqual(backup.preferences, { motion: "reduced", spoilerPolicy: "protect" });
  assert.deepEqual(backup.spoilerDecisions, []);
});

void test("staged restore creates and verifies a new workspace before activation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-backup-restore-"));

  try {
    const registry = new WorkspaceRegistry(directory);
    const manager = new WorkspaceManager(registry);
    const originalWorkspaceId = manager.workspaceId;
    manager.importLegacyBackupSnapshot({
      cardLists: [],
      decks: [],
      motion: "full",
    });

    const pending = manager.beginRestore(legacySnapshot);
    assert.notEqual(pending.workspaceId, originalWorkspaceId);
    assert.equal(manager.workspaceId, originalWorkspaceId);
    assert.deepEqual(manager.createLegacyBackupSnapshot().cardLists, []);

    manager.cancelRestore(pending.workspaceId);
    const restored = manager.beginRestore(legacySnapshot);
    manager.activateRestore(restored.workspaceId);
    assert.equal(manager.workspaceId, restored.workspaceId);
    assert.deepEqual(manager.createLegacyBackupSnapshot(), legacySnapshot);
    manager.close();

    registry.activateWorkspace(originalWorkspaceId);
    const original = new WorkspaceManager(registry);
    assert.equal(original.workspaceId, originalWorkspaceId);
    assert.deepEqual(original.readPreferences(), { motion: "full" });
    original.close();
    registry.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("invalid backups are rejected before staged SQL data changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-backup-invalid-"));
  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.importLegacyBackupSnapshot(legacySnapshot);
    const before = store.createLegacyBackupSnapshot();
    const invalid = structuredClone(fullBackup);
    invalid.decks[0]!.id = "mismatched-id";

    assert.throws(() => parseWorkspaceBackup(JSON.stringify(invalid)), /deck IDs are invalid/);
    assert.deepEqual(store.createLegacyBackupSnapshot(), before);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
