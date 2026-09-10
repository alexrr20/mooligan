import { queryOptions } from "@tanstack/react-query";

import { listCollection } from "../catalog/catalog-request.ts";
import { waitForSearchInput } from "./global-search-query.ts";

export class CollectionSearchNotReadyError extends Error {
  constructor() {
    super("The Collection is not ready. Try searching again.");
  }
}

export function globalSearchCollectionQueryOptions(
  list: typeof listCollection,
  query: string,
  workspaceId: string,
  visibilityKey: string,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: ["collection", "global-search", workspaceId, visibilityKey, query],
    queryFn: async ({ signal }) => {
      await waitForSearchInput(signal);
      const result = await list({ query, limit: 4 }, signal);
      if (result.status === "not-ready") throw new CollectionSearchNotReadyError();
      return result.page;
    },
    enabled,
    retry: (failureCount, error) =>
      error instanceof CollectionSearchNotReadyError && failureCount < 2,
    retryDelay: 250,
  });
}
