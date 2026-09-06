import { queryOptions } from "@tanstack/react-query";

export class CollectionSearchNotReadyError extends Error {
  constructor() {
    super("The Collection is not ready. Try searching again.");
  }
}

export function globalSearchCollectionQueryOptions(
  list: Window["collection"]["list"],
  query: string,
  workspaceId: string,
  visibilityKey: string,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: ["collection", "global-search", workspaceId, visibilityKey, query],
    queryFn: async () => {
      const result = await list({ query, limit: 4 });
      if (result.status === "not-ready") throw new CollectionSearchNotReadyError();
      return result.page;
    },
    enabled,
    retry: (failureCount, error) =>
      error instanceof CollectionSearchNotReadyError && failureCount < 2,
    retryDelay: 250,
  });
}
