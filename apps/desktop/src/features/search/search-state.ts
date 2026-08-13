export type UniverseFilter = "beyond" | "within";

export type CatalogSearchState = {
  artSeries?: true;
  digital?: true;
  grid?: true;
  query?: string;
  uniqueCards?: true;
  universe?: UniverseFilter;
};

export function reconcileCatalogSearchDraft(
  draft: string,
  previousActiveQuery: string,
  activeQuery: string,
) {
  return draft.trim() === previousActiveQuery ? activeQuery : draft;
}

export function validateCatalogSearch(search: Record<string, unknown>): CatalogSearchState {
  const query = typeof search.query === "string" ? search.query.trim().slice(0, 100) : "";

  return {
    ...(search.artSeries === true && { artSeries: true as const }),
    ...(search.digital === true && { digital: true as const }),
    ...(search.grid === true && { grid: true as const }),
    ...(query && { query }),
    ...(search.uniqueCards === true && { uniqueCards: true as const }),
    ...((search.universe === "beyond" || search.universe === "within") && {
      universe: search.universe,
    }),
  };
}
