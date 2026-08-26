import { useInfiniteQuery } from "@tanstack/react-query";

import { spoilerCatalogCacheKey, useSpoilerState } from "../spoilers/use-spoilers.ts";
import { catalogSearchQueryOptions } from "./catalog-search-query-options";
import type { UniverseFilter } from "./search-state";

export { catalogSearchQueryOptions } from "./catalog-search-query-options";

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
    queryError: result.isPlaceholderData ? "" : (lastPage?.queryError ?? ""),
    total: result.isPlaceholderData ? null : (lastPage?.total ?? null),
  };
}
