import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";

export function useCatalogUpcomingPrintings(enabled = true) {
  const result = useInfiniteQuery(
    catalogUpcomingPrintingsQueryOptions(window.catalog.upcomingPrintings, enabled),
  );
  const pages = result.data?.pages ?? [];
  const printings = pages.flatMap((page) => page.printings);
  const lastPage = pages.at(-1);

  const loadMore = () => {
    if (result.hasNextPage && !result.isFetching) {
      void result.fetchNextPage();
    }
  };

  return {
    error: result.isError ? "Upcoming cards could not be read from the local catalog." : "",
    hasMore: Boolean(result.hasNextPage),
    imagesReady: !result.isError,
    loading: result.isFetching,
    loadMore,
    printings,
    total: lastPage?.total ?? null,
  };
}

export function catalogUpcomingPrintingsQueryOptions(
  upcomingPrintings: Window["catalog"]["upcomingPrintings"],
  enabled = true,
) {
  return infiniteQueryOptions({
    queryKey: ["catalog", "upcoming-printings"],
    queryFn: ({ pageParam }) => upcomingPrintings({ limit: 100, offset: pageParam }),
    enabled,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore
        ? pages.reduce((count, page) => count + page.printings.length, 0)
        : undefined,
    initialPageParam: 0,
    retry: false,
    staleTime: Infinity,
  });
}
