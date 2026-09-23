import { Schema } from "effect";

import { DeckMetadataSchema, type Deck, type DeckEntry } from "../deck-contract.ts";
import type { deckTables } from "../decks.ts";

const decodeDeckLabels = Schema.decodeSync(Schema.parseJson(DeckMetadataSchema.fields.tags));

export function materializeDecks(
  rows: readonly (typeof deckTables.decks.Type)[],
  entries: readonly (typeof deckTables.deckEntries.Type)[],
): Deck[] {
  const byDeck = new Map<string, DeckEntry[]>();
  for (const { deckId, ...entry } of entries) {
    const list = byDeck.get(deckId) ?? [];
    list.push(entry);
    byDeck.set(deckId, list);
  }
  return rows.map(({ deleted: _deleted, tags, ...deck }) => ({
    ...deck,
    tags: decodeDeckLabels(tags),
    entries: byDeck.get(deck.id) ?? [],
  }));
}
