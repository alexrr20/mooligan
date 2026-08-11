import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import type { UniverseFilter } from "./search-state";

export function useCatalogSearch(
  query: string,
  uniqueCards: boolean,
  includeArtSeries: boolean,
  includeDigital: boolean,
  universe: UniverseFilter | undefined,
) {
  const catalog = window.catalog;
  const result = useInfiniteQuery({
    queryKey: [
      "catalog",
      "cards",
      { includeArtSeries, includeDigital, query, uniqueCards, universe },
    ],
    queryFn: ({ pageParam }) => {
      if (!catalog) {
        throw new Error("Catalog browsing is available in the desktop app.");
      }

      return catalog.list({
        includeArtSeries,
        includeDigital,
        limit: 100,
        offset: pageParam,
        query,
        uniqueCards,
        universe,
      });
    },
    enabled: Boolean(catalog),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.reduce((count, page) => count + page.cards.length, 0) : undefined,
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: Infinity,
  });
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
    error: !catalog
      ? "Catalog browsing is available in the desktop app."
      : result.isError
        ? "The local card index could not be read."
        : "",
    hasMore: !result.isPlaceholderData && Boolean(result.hasNextPage),
    loading: result.isFetching,
    loadMore,
    total: result.isPlaceholderData ? null : (lastPage?.total ?? null),
  };
}
