import type { HistoryState } from "@tanstack/react-router";
import type { JSONType } from "zod";

import { validateCollectionSearch, type CollectionSearchState } from "./collection-state";

export const COLLECTION_ORIGIN_STATE_KEY = "collectionOrigin";

export type CollectionOrigin = Readonly<{ search: CollectionSearchState }>;
export type CollectionHistoryState = HistoryState &
  Readonly<{
    collectionOrigin?: CollectionOrigin;
  }>;

export function createCollectionOrigin(search: CollectionSearchState): CollectionOrigin {
  return { search: validateCollectionSearch(search) };
}

export function readCollectionOrigin(state: HistoryState | JSONType): CollectionOrigin | null {
  if (!isJsonObject(state) || !isJsonObject(state.collectionOrigin)) return null;
  const origin = state.collectionOrigin;
  const keys = Object.keys(origin);

  if (keys.length !== 1 || keys[0] !== "search") return null;
  return { search: validateCollectionSearch(origin.search) };
}

export function withCollectionOrigin(origin: CollectionOrigin) {
  const validated = createCollectionOrigin(origin.search);

  return (current: HistoryState): CollectionHistoryState => ({
    ...current,
    collectionOrigin: validated,
  });
}

function isJsonObject(value: HistoryState | JSONType): value is Readonly<Record<string, JSONType>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
