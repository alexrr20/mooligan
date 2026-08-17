import type { HistoryState } from "@tanstack/react-router";
import * as z from "zod";
import type { JSONType } from "zod";

import {
  CatalogSearchStateSchema,
  type CatalogSearchState,
  validateCatalogSearch,
} from "../search/search-state.ts";

export const PRINTING_GALLERY_BATCH_SIZE = 24;
export const CATALOG_SEARCH_ORIGIN_STATE_KEY = "catalogSearchOrigin";

export type CatalogSearchOrigin = Readonly<{
  search: CatalogSearchState;
}>;

export type CatalogSearchHistoryState = HistoryState &
  Readonly<{
    catalogSearchOrigin?: CatalogSearchOrigin;
  }>;

type CatalogSearchHistoryInput = HistoryState | Readonly<Record<string, JSONType>>;
export type CatalogSearchHistoryStateUpdater = (
  current: CatalogSearchHistoryInput,
) => CatalogSearchHistoryState;

const CatalogSearchOriginSchema = z.strictObject({ search: CatalogSearchStateSchema });
const CatalogSearchHistoryEnvelopeSchema = z.object({
  catalogSearchOrigin: z.json().optional(),
});

export function createCatalogSearchOrigin(search: CatalogSearchState): CatalogSearchOrigin {
  return { search: validateCatalogSearch({ ...search }) };
}

export function validateCatalogSearchOrigin(
  value: CatalogSearchOrigin | JSONType,
): CatalogSearchOrigin | null {
  const origin = CatalogSearchOriginSchema.safeParse(value);
  return origin.success ? origin.data : null;
}

export function withCatalogSearchOrigin(
  origin: CatalogSearchOrigin | null | undefined,
): CatalogSearchHistoryStateUpdater {
  const validated = origin ? validateCatalogSearchOrigin(origin) : null;

  return (current) => {
    const state = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== CATALOG_SEARCH_ORIGIN_STATE_KEY),
    );
    return validated ? { ...state, catalogSearchOrigin: validated } : state;
  };
}

export function readCatalogSearchOrigin(
  state: HistoryState | JSONType,
): CatalogSearchOrigin | null {
  const envelope = CatalogSearchHistoryEnvelopeSchema.safeParse(state);
  return envelope.success && envelope.data.catalogSearchOrigin !== undefined
    ? validateCatalogSearchOrigin(envelope.data.catalogSearchOrigin)
    : null;
}

export function getInitialGalleryVisibleCount(itemCount: number, selectedIndex: number): number {
  const minimum = Math.min(PRINTING_GALLERY_BATCH_SIZE, itemCount);
  if (selectedIndex < 0 || selectedIndex >= itemCount) {
    return minimum;
  }

  const selectedBatchEnd =
    Math.ceil((selectedIndex + 1) / PRINTING_GALLERY_BATCH_SIZE) * PRINTING_GALLERY_BATCH_SIZE;
  return Math.min(itemCount, Math.max(minimum, selectedBatchEnd));
}

export function getNextGalleryVisibleCount(itemCount: number, visibleCount: number): number {
  return Math.min(itemCount, visibleCount + PRINTING_GALLERY_BATCH_SIZE);
}
