import type { HistoryState } from "@tanstack/react-router";
import type { JSONType } from "zod";

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
  | Readonly<{ kind: "collection"; value: CollectionOrigin }>
  | Readonly<{ kind: "search"; value: CatalogSearchOrigin }>;

export function readCardDetailOrigin(state: HistoryState | JSONType): CardDetailOrigin | null {
  const collection = readCollectionOrigin(state);
  if (collection) return { kind: "collection", value: collection };

  const search = readCatalogSearchOrigin(state);
  return search ? { kind: "search", value: search } : null;
}

export function withCardDetailOrigin(origin: CardDetailOrigin | null) {
  return (current: HistoryState): HistoryState =>
    origin?.kind === "collection"
      ? withCollectionOrigin(origin.value)(current)
      : withCatalogSearchOrigin(origin?.value)(current);
}
