export type UniverseFilter = "beyond" | "within";

export type CatalogSearchState = {
  artSeries?: false;
  digital?: false;
  grid?: true;
  query?: string;
  uniqueCards?: true;
  universe?: UniverseFilter;
};

export function validateCatalogSearch(search: Record<string, unknown>): CatalogSearchState {
  const query = typeof search.query === "string" ? search.query.trim().slice(0, 100) : "";

  return {
    ...(search.artSeries === false && { artSeries: false as const }),
    ...(search.digital === false && { digital: false as const }),
    ...(search.grid === true && { grid: true as const }),
    ...(query && { query }),
    ...(search.uniqueCards === true && { uniqueCards: true as const }),
    ...((search.universe === "beyond" || search.universe === "within") && {
      universe: search.universe,
    }),
  };
}
