import type { HistoryState } from "@tanstack/react-router";
import type { JsonValue } from "@mooligan/domain/schema";
import { readDeckOrigin, withDeckOrigin, type DeckOrigin } from "../decks/deck-origin";

import {
  readCatalogSearchOrigin,
  withCatalogSearchOrigin,
  type CatalogSearchOrigin,
} from "../search/catalog-search-origin";
import {
  readCollectionOrigin,
  withCollectionOrigin,
  type CollectionOrigin,
} from "../collection/collection-origin";

export type CardDetailOrigin =
  | Readonly<{ kind: "deck"; value: DeckOrigin }>
  | Readonly<{ kind: "collection"; value: CollectionOrigin }>
  | Readonly<{ kind: "search"; value: CatalogSearchOrigin }>;

export function readCardDetailOrigin(state: HistoryState | JsonValue): CardDetailOrigin | null {
  const collection = readCollectionOrigin(state);
  if (collection) return { kind: "collection", value: collection };

  const search = readCatalogSearchOrigin(state);
  if (search) return { kind: "search", value: search };
  const deck = readDeckOrigin(state);
  return deck ? { kind: "deck", value: deck } : null;
}

export function withCardDetailOrigin(origin: CardDetailOrigin | null) {
  return (current: HistoryState): HistoryState =>
    origin?.kind === "deck"
      ? withDeckOrigin(origin.value)(current)
      : origin?.kind === "collection"
        ? withCollectionOrigin(origin.value)(current)
        : withCatalogSearchOrigin(origin?.value)(current);
}
