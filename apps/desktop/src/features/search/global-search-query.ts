import { queryOptions } from "@tanstack/react-query";

import { listCatalog } from "../catalog/catalog-request.ts";

export function globalSearchCatalogQueryOptions(
  list: typeof listCatalog,
  query: string,
  workspaceId: string,
  visibilityKey: string,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: ["catalog", "global-search", workspaceId, visibilityKey, query],
    queryFn: async ({ signal }) => {
      await waitForSearchInput(signal);
      return list({ query, uniqueCards: true, limit: 6 }, signal);
    },
    enabled,
    retry: false,
  });
}

export function waitForSearchInput(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Search cancelled.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 160);
    signal.addEventListener("abort", abort, { once: true });
  });
}
