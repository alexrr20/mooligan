export type UniverseFilter = "beyond" | "within";

export type CatalogSearchState = {
  adCards?: true;
  artSeries?: true;
  digital?: true;
  grid?: true;
  mode?: "upcoming";
  query?: string;
  tokens?: true;
  uniqueCards?: true;
  universe?: UniverseFilter;
};

type CatalogSearchInput = CatalogSearchState | JSONType;
type JsonObject = Readonly<Record<string, JSONType>>;

export function reconcileCatalogSearchDraft(
  draft: string,
  previousActiveQuery: string,
  activeQuery: string,
) {
  return draft.trim() === previousActiveQuery ? activeQuery : draft;
}

export function validateCatalogSearch(search: CatalogSearchInput): CatalogSearchState {
  const input = isJsonObject(search) ? search : {};
  const query = isString(input.query) ? input.query.trim().slice(0, 500) : "";

  return {
    ...(input.adCards === true && { adCards: true as const }),
    ...(input.artSeries === true && { artSeries: true as const }),
    ...(input.digital === true && { digital: true as const }),
    ...(input.grid === true && { grid: true as const }),
    ...(input.mode === "upcoming" && { mode: "upcoming" as const }),
    ...(query && { query }),
    ...(input.tokens === true && { tokens: true as const }),
    ...(input.uniqueCards === true && { uniqueCards: true as const }),
    ...((input.universe === "beyond" || input.universe === "within") && {
      universe: input.universe,
    }),
  };
}

export function isCatalogSearchState(value: CatalogSearchInput): value is CatalogSearchState {
  if (!isJsonObject(value)) return false;

  const search = validateCatalogSearch(value);
  const entries = Object.entries(value);
  return (
    entries.length === Object.keys(search).length &&
    Object.entries(search).every(([key, entry]) =>
      entries.some(([candidateKey, candidate]) => candidateKey === key && candidate === entry),
    )
  );
}

function isJsonObject(value: CatalogSearchInput): value is CatalogSearchInput & JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: JSONType | undefined): value is string {
  return typeof value === "string";
}

import type { JSONType } from "zod";
