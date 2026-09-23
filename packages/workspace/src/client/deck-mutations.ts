import type { Store } from "@livestore/livestore";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import { Schema } from "effect";

import {
  DeckEntrySchema,
  DeckMetadataSchema,
  NewDeckEntrySchema,
  deckSlotKey,
  type DeckEntry,
  type DeckMetadata,
  type NewDeckEntry,
} from "../deck-contract.ts";
import { deckEntriesQuery, decksQuery } from "../decks.ts";
import { events, workspaceSchema } from "../schema.ts";
import { materializeDecks } from "./deck-state.ts";
import { duplicateDeckTags } from "./tag-mutations.ts";

const decodeMetadata = Schema.decodeSync(DeckMetadataSchema);
const decodeMetadataChange = Schema.decodeSync(
  Schema.partialWith(DeckMetadataSchema, { exact: true }),
);
const decodeEntry = Schema.decodeSync(DeckEntrySchema);
const decodeNewEntry = Schema.decodeSync(NewDeckEntrySchema);
const decodeEntryChange = Schema.decodeSync(
  Schema.partialWith(NewDeckEntrySchema, { exact: true }),
);

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

  function create(metadata: DeckMetadata, entries: readonly NewDeckEntry[] = []) {
    const parsed = decodeMetadata(normalizeMetadata(metadata));
    const prepared = prepareEntries(entries);
    const id = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    store.commit(
      events.deckCreated({ deck: { ...parsed, id, createdAt: updatedAt, updatedAt } }),
      ...prepared.map((entry) => events.deckEntryAdded({ deckId: id, entry, updatedAt })),
    );
    return id;
  }

  function addEntries(deckId: string, entries: readonly NewDeckEntry[]) {
    const prepared = prepareEntries(entries);
    const deck = readDeck(deckId);
    for (const entry of prepared) {
      const existing = deck.entries.find((item) => deckSlotKey(item) === deckSlotKey(entry));
      decodeNewEntry({ ...entry, quantity: entry.quantity + (existing?.quantity ?? 0) });
    }
    const updatedAt = new Date().toISOString();
    store.commit(...prepared.map((entry) => events.deckEntryAdded({ deckId, entry, updatedAt })));
  }

  async function validatePrinting(entry: NewDeckEntry) {
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
      const parsed = decodeMetadataChange(normalizeMetadata(change));
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
    async add(deckId: string, entry: NewDeckEntry) {
      const parsed = decodeNewEntry(entry);
      await validatePrinting(parsed);
      addEntries(deckId, [parsed]);
    },
    async updateEntry(deckId: string, entryId: string, change: Partial<NewDeckEntry>) {
      const parsed = decodeEntryChange(change);
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
      decodeEntry({ ...next, quantity: next.quantity + (target?.quantity ?? 0) });
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

function prepareEntries(entries: readonly NewDeckEntry[]) {
  if (entries.length > 10_000) throw new Error("Import at most 10,000 deck cards at once.");
  const slots = new Map<string, DeckEntry>();
  for (const entry of entries) {
    const parsed = decodeEntry({ ...entry, id: crypto.randomUUID() });
    const key = deckSlotKey(parsed);
    const existing = slots.get(key);
    slots.set(
      key,
      decodeEntry({ ...parsed, quantity: parsed.quantity + (existing?.quantity ?? 0) }),
    );
  }
  return [...slots.values()];
}

/** Deck text is trimmed once here, so stored names, formats, and labels are canonical. */
function normalizeMetadata<Change extends Partial<DeckMetadata>>(change: Change): Change {
  return {
    ...change,
    ...(change.name !== undefined && { name: change.name.trim() }),
    ...(change.formatId !== undefined && { formatId: change.formatId.trim() }),
    ...(change.tags !== undefined && { tags: change.tags.map((tag) => tag.trim()) }),
  };
}
