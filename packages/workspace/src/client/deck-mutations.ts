import type { Store } from "@livestore/livestore";
import {
  DeckEntrySchema,
  DeckMetadataSchema,
  type DeckEntry,
  type DeckMetadata,
} from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import { deckEntriesQuery, decksQuery, events, workspaceSchema } from "@mooligan/workspace/schema";

import { deckSlotKey, materializeDecks } from "@mooligan/workspace/client/deck-state";

import { duplicateDeckTags } from "./tag-mutations.ts";

type NewEntry = Omit<DeckEntry, "id">;
type EntryChange = Partial<NewEntry>;

export function createDeckMutations(
  store: Store<typeof workspaceSchema>,
  readPrinting: (printingId: string) => Promise<CatalogPrintingResult | null>,
) {
  function readDeck(deckId: string) {
    const deck = materializeDecks(store.query(decksQuery), store.query(deckEntriesQuery)).find(
      ({ id }) => id === deckId,
    );
    if (!deck) throw new Error("This deck has been deleted or is no longer available.");
    return deck;
  }

  function create(metadata: DeckMetadata, entries: readonly NewEntry[] = []) {
    const parsed = DeckMetadataSchema.parse(metadata);
    const prepared = prepareEntries(entries);
    const id = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    store.commit(
      events.deckCreated({ deck: { ...parsed, id, createdAt: updatedAt, updatedAt } }),
      ...prepared.map((entry) => events.deckEntryAdded({ deckId: id, entry, updatedAt })),
    );
    return id;
  }

  function addEntries(deckId: string, entries: readonly NewEntry[]) {
    const prepared = prepareEntries(entries);
    const deck = readDeck(deckId);
    for (const entry of prepared) {
      const existing = deck.entries.find((item) => deckSlotKey(item) === deckSlotKey(entry));
      DeckEntrySchema.parse({ ...entry, quantity: entry.quantity + (existing?.quantity ?? 0) });
    }
    const updatedAt = new Date().toISOString();
    store.commit(...prepared.map((entry) => events.deckEntryAdded({ deckId, entry, updatedAt })));
  }

  async function validatePrinting(entry: NewEntry) {
    const result = await readPrinting(entry.printingId);
    if (!result || result.status !== "visible")
      throw new Error("Choose a visible printing from the local catalog.");
    if (!result.detail.selectedPrinting.finishes?.includes(entry.finish))
      throw new Error("This printing does not support the selected finish.");
  }

  return {
    create,
    addEntries,
    update(deckId: string, change: Partial<DeckMetadata>) {
      readDeck(deckId);
      const parsed = DeckMetadataSchema.partial().parse(change);
      store.commit(events.deckChanged({ ...parsed, deckId, updatedAt: new Date().toISOString() }));
    },
    duplicate(deckId: string) {
      const deck = readDeck(deckId);
      const duplicateId = create(
        {
          name: `${deck.name.slice(0, 193)} (copy)`,
          formatId: deck.formatId,
          notes: deck.notes,
          tags: deck.tags,
          archived: false,
        },
        deck.entries,
      );
      duplicateDeckTags(store, deckId, duplicateId);
      return duplicateId;
    },
    remove(deckId: string) {
      readDeck(deckId);
      store.commit(events.deckDeleted({ deckId, updatedAt: new Date().toISOString() }));
    },
    async add(deckId: string, entry: NewEntry) {
      const parsed = DeckEntrySchema.omit({ id: true }).parse(entry);
      await validatePrinting(parsed);
      addEntries(deckId, [parsed]);
    },
    async updateEntry(deckId: string, entryId: string, change: EntryChange) {
      const parsed = DeckEntrySchema.omit({ id: true }).partial().parse(change);
      let entry = readDeck(deckId).entries.find(({ id }) => id === entryId);
      if (!entry) throw new Error("This deck card has been removed.");
      if (parsed.finish !== undefined || parsed.printingId !== undefined)
        await validatePrinting({ ...entry, ...parsed });
      const deck = readDeck(deckId);
      entry = deck.entries.find(({ id }) => id === entryId);
      if (!entry) throw new Error("This deck card has been removed.");
      const next = { ...entry, ...parsed };
      const target = deck.entries.find(
        (item) => item.id !== entryId && deckSlotKey(item) === deckSlotKey(next),
      );
      DeckEntrySchema.parse({ ...next, quantity: next.quantity + (target?.quantity ?? 0) });
      store.commit(
        events.deckEntryChanged({
          ...parsed,
          deckId,
          entryId,
          updatedAt: new Date().toISOString(),
        }),
      );
    },
    removeEntry(deckId: string, entryId: string) {
      readDeck(deckId);
      store.commit(
        events.deckEntryRemoved({ deckId, entryId, updatedAt: new Date().toISOString() }),
      );
    },
  };
}

function prepareEntries(entries: readonly NewEntry[]) {
  if (entries.length > 10_000) throw new Error("Import at most 10,000 deck cards at once.");
  const slots = new Map<string, DeckEntry>();
  for (const entry of entries) {
    const parsed = DeckEntrySchema.parse({ ...entry, id: crypto.randomUUID() });
    const key = deckSlotKey(parsed);
    const existing = slots.get(key);
    slots.set(
      key,
      DeckEntrySchema.parse({ ...parsed, quantity: parsed.quantity + (existing?.quantity ?? 0) }),
    );
  }
  return [...slots.values()];
}
