import { infiniteQueryOptions, type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";

import type { CollectionListPage, CollectionListRequest } from "@mooligan/domain/collection";

import { spoilerCatalogCacheKey, useSpoilerState } from "../spoilers/use-spoilers";
import type { CollectionSearchState } from "./collection-state";

export function useCollection(search: CollectionSearchState) {
  const spoilers = useSpoilerState();
  const visibilityKey = spoilerCatalogCacheKey(spoilers.state);
  const request = toCollectionRequest(search);
  const result = useInfiniteQuery(
    collectionQueryOptions(window.collection.list, request, visibilityKey, !spoilers.loading),
  );

  const pages = result.data?.pages ?? [];
  const lastPage = pages.at(-1);

  return {
    error: result.isError || spoilers.error ? "The local Collection could not be read." : "",
    filtered: lastPage?.filtered ?? { cards: 0, copies: 0, holdings: 0 },
    hasMore: Boolean(result.hasNextPage),
    holdings: pages.flatMap((page) => page.holdings),
    loading: result.isFetching,
    loadMore() {
      if (result.hasNextPage && !result.isFetching) void result.fetchNextPage();
    },
    protectedCopies: lastPage?.protectedCopies ?? 0,
    retry: result.refetch,
    sets: lastPage?.sets ?? [],
    total: lastPage?.total ?? { cards: 0, copies: 0, holdings: 0 },
  };
}

function collectionQueryOptions(
  list: Window["collection"]["list"],
  request: CollectionListRequest,
  visibilityKey: string,
  enabled: boolean,
) {
  return infiniteQueryOptions<
    CollectionListPage,
    Error,
    InfiniteData<CollectionListPage, number>,
    readonly ["collection", string, CollectionListRequest],
    number
  >({
    enabled,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.reduce((count, page) => count + page.holdings.length, 0) : undefined,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => list({ ...request, limit: 100, offset: pageParam }),
    queryKey: ["collection", visibilityKey, request],
    retry: false,
    staleTime: Infinity,
  });
}

function toCollectionRequest(search: CollectionSearchState): CollectionListRequest {
  return {
    condition: search.condition,
    finish: search.finish,
    language: search.language,
    query: search.query,
    setCode: search.set,
    sort: search.sort ?? "name",
  };
}
