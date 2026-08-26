import type { CatalogListPage } from "@mooligan/domain/catalog-search";
import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";

import type { UniverseFilter } from "./search-state.ts";

type CatalogSearchQueryKey = readonly [
  "catalog",
  "cards",
  string,
  {
    includeAdCards: boolean;
    includeArtSeries: boolean;
    includeDigital: boolean;
    includeTokens: boolean;
    query: string;
    uniqueCards: boolean;
    universe: UniverseFilter | undefined;
  },
];

export function catalogSearchQueryOptions(
  list: Window["catalog"]["list"],
  query: string,
  uniqueCards: boolean,
  includeAdCards: boolean,
  includeArtSeries: boolean,
  includeDigital: boolean,
  includeTokens: boolean,
  universe: UniverseFilter | undefined,
  visibilityKey: string,
  enabled = true,
) {
  return infiniteQueryOptions<
    CatalogListPage,
    Error,
    InfiniteData<CatalogListPage, number>,
    CatalogSearchQueryKey,
    number
  >({
    queryKey: [
      "catalog",
      "cards",
      visibilityKey,
      {
        includeAdCards,
        includeArtSeries,
        includeDigital,
        includeTokens,
        query,
        uniqueCards,
        universe,
      },
    ],
    enabled,
    placeholderData: (
      previousData: InfiniteData<CatalogListPage, number> | undefined,
      previousQuery,
    ) => (previousQuery?.queryKey[2] === visibilityKey ? previousData : undefined),
    queryFn: ({ pageParam }) =>
      list({
        includeAdCards,
        includeArtSeries,
        includeDigital,
        includeTokens,
        limit: 100,
        offset: pageParam,
        query,
        uniqueCards,
        universe,
      }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.reduce((count, page) => count + page.cards.length, 0) : undefined,
    initialPageParam: 0,
    retry: false,
    staleTime: Infinity,
  });
}
