import type { HistoryState } from "@tanstack/react-router";
import type { JSONType } from "zod";

import {
  isCatalogSearchState,
  type CatalogSearchState,
  validateCatalogSearch,
} from "./search-state.ts";

export const CATALOG_SEARCH_ORIGIN_STATE_KEY = "catalogSearchOrigin";

export type CatalogSearchOrigin = Readonly<{
  search: CatalogSearchState;
}>;

export type CatalogSearchHistoryState = HistoryState &
  Readonly<{
    catalogSearchOrigin?: CatalogSearchOrigin;
  }>;

type CatalogSearchHistoryInput = HistoryState | Readonly<Record<string, JSONType>>;
type CatalogSearchNavigationValue = CatalogSearchHistoryInput | CatalogSearchOrigin | JSONType;
export type CatalogSearchHistoryStateUpdater = (
  current: CatalogSearchHistoryInput,
) => CatalogSearchHistoryState;

export function createCatalogSearchOrigin(search: CatalogSearchState): CatalogSearchOrigin {
  return { search: validateCatalogSearch({ ...search }) };
}

export function validateCatalogSearchOrigin(
  value: CatalogSearchOrigin | JSONType,
): CatalogSearchOrigin | null {
  if (!isJsonObject(value)) return null;

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "search" || !isCatalogSearchState(value.search)) {
    return null;
  }
  return { search: value.search };
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
  if (!isJsonObject(state) || state.catalogSearchOrigin === undefined) return null;
  return validateCatalogSearchOrigin(state.catalogSearchOrigin);
}

function isJsonObject(
  value: CatalogSearchNavigationValue,
): value is Readonly<Record<string, JSONType>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
