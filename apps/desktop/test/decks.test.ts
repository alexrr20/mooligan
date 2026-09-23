import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise, type Store } from "@livestore/livestore";
import { deckEntriesQuery, decksQuery } from "@mooligan/workspace/decks";
import { events, tables, workspaceSchema } from "@mooligan/workspace/schema";
import { Schema } from "effect";
import { workspaceBackupSchema } from "@mooligan/workspace/backup";

import { createDeckMutations } from "@mooligan/workspace/client/deck-mutations";
import { materializeDecks } from "@mooligan/workspace/client/deck-state";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";

const time = "2026-09-04T10:00:00.000Z";
const metadata = {
  name: "Test deck",
  formatId: "commander",
  notes: "Planned cards",
  tags: ["test"],
  archived: false,
};
type WorkspaceStore = Store<typeof workspaceSchema>;

void test("creating a deck saves its commander and rejects invalid entries before creating it", async () => {
  const store = await openStore("deck-create-commander");
  try {
    const mutations = createDeckMutations(store, async () => null);
    const commander = {
      printingId: "commander-printing",
      finish: "nonfoil" as const,
      quantity: 1,
      section: "commander" as const,
    };
    const id = mutations.create(metadata, [commander]);
    const deck = readDecks(store).find((deck) => deck.id === id)!;
    assert.equal(deck.entries.length, 1);
    assert.deepEqual(deck.entries[0], { ...commander, id: deck.entries[0]!.id });
    assert.equal(store.query(tables.collectionLots).length, 0);
    assert.throws(() => mutations.create(metadata, [{ ...commander, quantity: 0 }]));
    assert.equal(readDecks(store).length, 1);
  } finally {
    await waitForPersistence(store);
    await store.shutdownPromise();
  }
});

void test("decks work without a catalog or account and survive backup/restore", async () => {
  const source = await openStore("deck-source");
  const target = await openStore("deck-restored");
  try {
    const mutations = createDeckMutations(source, async () => null);
    const id = mutations.create(metadata);
    mutations.addEntries(id, [
      { printingId: "missing-printing", finish: "foil", quantity: 3, section: "mainboard" },
      { printingId: "missing-printing", finish: "nonfoil", quantity: 1, section: "commander" },
    ]);
    const entry = source.query(deckEntriesQuery)[0]!;
    await mutations.updateEntry(id, entry.id, { quantity: 5, section: "sideboard" });
    mutations.update(id, { archived: true, notes: "Updated offline" });
    const duplicateId = mutations.duplicate(id);
    const duplicate = readDecks(source).find((deck) => deck.id === duplicateId)!;
    assert.equal(duplicate.archived, false);
    assert.equal(duplicate.entries.length, 2);
    assert.ok(duplicate.entries.every((item) => item.id !== entry.id));
    const backup = Schema.decodeUnknownSync(workspaceBackupSchema)(
      JSON.parse(JSON.stringify(createWorkspaceBackup(source))),
    );
    await restoreWorkspaceBackup(target, backup);
    assert.deepEqual(createWorkspaceBackup(target), createWorkspaceBackup(source));
    assert.equal(target.query(tables.collectionLots).length, 0);
    mutations.remove(id);
    assert.equal(readDecks(source).length, 1);
  } finally {
    await Promise.all([source.shutdownPromise(), target.shutdownPromise()]);
  }
});

void test("additions merge and offline edits keep addressing merged card IDs", async () => {
  const store = await openStore("deck-merge");
  try {
    create(store);
    add(store, "first", 2);
    add(store, "second", 3);
    assert.equal(store.query(deckEntriesQuery)[0]?.quantity, 5);
    store.commit(
      events.deckEntryChanged({
        deckId: "deck",
        entryId: "second",
        section: "sideboard",
        updatedAt: time,
      }),
    );
    assert.equal(store.query(deckEntriesQuery)[0]?.section, "sideboard");
    add(store, "third", 4);
    store.commit(
      events.deckEntryChanged({
        deckId: "deck",
        entryId: "second",
        section: "mainboard",
        updatedAt: time,
      }),
    );
    assert.deepEqual(
      store.query(deckEntriesQuery).map(({ id, quantity }) => ({ id, quantity })),
      [{ id: "third", quantity: 9 }],
    );
    store.commit(
      events.deckEntryChanged({ deckId: "deck", entryId: "first", quantity: 6, updatedAt: time }),
    );
    assert.equal(store.query(deckEntriesQuery)[0]?.quantity, 6);
    store.commit(events.deckEntryRemoved({ deckId: "deck", entryId: "second", updatedAt: time }));
    assert.deepEqual(store.query(deckEntriesQuery), []);
    add(store, "readded", 1);
    store.commit(
      events.deckEntryChanged({ deckId: "deck", entryId: "first", quantity: 9, updatedAt: time }),
    );
    assert.equal(store.query(deckEntriesQuery)[0]?.quantity, 1);
  } finally {
    await waitForPersistence(store);
    await store.shutdownPromise();
  }
});

void test("metadata edits preserve other fields and deletions reject stale deck events", async () => {
  const store = await openStore("deck-delete");
  try {
    create(store);
    store.commit(events.deckChanged({ deckId: "deck", name: "Renamed", updatedAt: time }));
    store.commit(events.deckChanged({ deckId: "deck", notes: "Other device", updatedAt: time }));
    assert.equal(store.query(decksQuery)[0]?.name, "Renamed");
    assert.equal(store.query(decksQuery)[0]?.notes, "Other device");
    add(store, "first", 1);
    store.commit(events.deckDeleted({ deckId: "deck", updatedAt: time }));
    store.commit(events.deckChanged({ deckId: "deck", name: "Stale", updatedAt: time }));
    store.commit(
      events.deckEntryChanged({ deckId: "deck", entryId: "first", quantity: 8, updatedAt: time }),
    );
    add(store, "late-addition", 2);
    create(store);
    assert.deepEqual(store.query(decksQuery), []);
    assert.deepEqual(store.query(deckEntriesQuery), []);
  } finally {
    await waitForPersistence(store);
    await store.shutdownPromise();
  }
});

void test("slot moves preserve quantities, reject overflow, and cannot edit another deck", async () => {
  const store = await openStore("deck-limits");
  try {
    create(store);
    add(store, "full", 1_000_000);
    store.commit(
      events.deckEntryAdded({
        deckId: "deck",
        entry: {
          id: "side",
          printingId: "printing",
          finish: "foil",
          quantity: 2,
          section: "sideboard",
        },
        updatedAt: time,
      }),
    );
    store.commit(
      events.deckEntryChanged({
        deckId: "deck",
        entryId: "side",
        section: "mainboard",
        updatedAt: time,
      }),
    );
    assert.equal(store.query(deckEntriesQuery).length, 2);
    assert.equal(store.query(deckEntriesQuery).find(({ id }) => id === "side")?.quantity, 2);
    store.commit(
      events.deckEntryChanged({
        deckId: "another-deck",
        entryId: "full",
        quantity: 1,
        updatedAt: time,
      }),
    );
    assert.equal(
      store.query(deckEntriesQuery).find(({ id }) => id === "full")?.quantity,
      1_000_000,
    );
    const mutations = createDeckMutations(store, async () => null);
    assert.throws(() =>
      mutations.addEntries("deck", [
        { printingId: "printing", finish: "foil", quantity: 1, section: "mainboard" },
      ]),
    );
    await assert.rejects(
      mutations.add("deck", {
        printingId: "printing",
        finish: "foil",
        quantity: 1,
        section: "mainboard",
      }),
      /visible printing/u,
    );
    assert.throws(() => mutations.create({ ...metadata, name: " " }));
  } finally {
    await waitForPersistence(store);
    await store.shutdownPromise();
  }
});

function create(store: WorkspaceStore) {
  store.commit(
    events.deckCreated({ deck: { ...metadata, id: "deck", createdAt: time, updatedAt: time } }),
  );
}
function add(store: WorkspaceStore, id: string, quantity: number) {
  store.commit(
    events.deckEntryAdded({
      deckId: "deck",
      entry: { id, printingId: "printing", finish: "foil", quantity, section: "mainboard" },
      updatedAt: time,
    }),
  );
}
function readDecks(store: WorkspaceStore) {
  return materializeDecks(store.query(decksQuery), store.query(deckEntriesQuery));
}
function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}

async function waitForPersistence(store: WorkspaceStore) {
  const deadline = Date.now() + 5000;
  while (!store.syncStatus().isSynced) {
    if (Date.now() > deadline) throw new Error("Deck events were not persisted locally.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
