import { infiniteQueryOptions, type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";

import type { CatalogListPage } from "../../../electron/catalog/query";
import { spoilerCatalogCacheKey, useSpoilerState } from "../spoilers/use-spoilers.ts";
import type { UniverseFilter } from "./search-state";

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

export function useCatalogSearch(
  query: string,
  uniqueCards: boolean,
  includeAdCards: boolean,
  includeArtSeries: boolean,
  includeDigital: boolean,
  includeTokens: boolean,
  universe: UniverseFilter | undefined,
  enabled = true,
) {
  const spoilers = useSpoilerState();
  const visibilityKey = spoilerCatalogCacheKey(spoilers.state);
  const result = useInfiniteQuery(
    catalogSearchQueryOptions(
      window.catalog.list,
      query,
      uniqueCards,
      includeAdCards,
      includeArtSeries,
      includeDigital,
      includeTokens,
      universe,
      visibilityKey,
      enabled && !spoilers.loading,
    ),
  );
  const pages = result.data?.pages ?? [];
  const cards = pages.flatMap((page) => page.cards);
  const lastPage = pages.at(-1);

  const loadMore = () => {
    if (result.hasNextPage && !result.isFetching) {
      void result.fetchNextPage();
    }
  };

  return {
    cards,
    error: result.isError || spoilers.error ? "The local card index could not be read." : "",
    hasMore: !result.isPlaceholderData && Boolean(result.hasNextPage),
    imagesReady: !result.isError && !result.isPlaceholderData,
    loading: result.isFetching,
    loadMore,
    total: result.isPlaceholderData ? null : (lastPage?.total ?? null),
  };
}

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
