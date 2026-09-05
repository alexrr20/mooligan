import { DeckMetadataSchema, type Deck, type DeckEntry } from "@mooligan/domain/decks";
import type { tables } from "@mooligan/workspace/schema";

export function materializeDecks(
  rows: readonly (typeof tables.decks.Type)[],
  entries: readonly (typeof tables.deckEntries.Type)[],
): Deck[] {
  const byDeck = new Map<string, DeckEntry[]>();
  for (const { deckId, ...entry } of entries) {
    const list = byDeck.get(deckId) ?? [];
    list.push(entry);
    byDeck.set(deckId, list);
  }
  return rows.map(({ deleted: _deleted, tags, ...deck }) => ({
    ...deck,
    tags: DeckMetadataSchema.pick({ tags: true }).parse({ tags: JSON.parse(tags) }).tags,
    entries: byDeck.get(deck.id) ?? [],
  }));
}

export function deckSlotKey(entry: Pick<DeckEntry, "printingId" | "finish" | "section">) {
  return [entry.printingId, entry.finish, entry.section].join("\0");
}
