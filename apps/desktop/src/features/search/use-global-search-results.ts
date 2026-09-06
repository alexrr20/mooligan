import { useQuery } from "@tanstack/react-query";

import { useDecks } from "../decks/use-decks";
import { spoilerCatalogCacheKey, useSpoilerState } from "../spoilers/use-spoilers";
import {
  CollectionSearchNotReadyError,
  globalSearchCollectionQueryOptions,
} from "./global-search-collection-query";
import {
  cardSearchResults,
  collectionSearchResults,
  deckSearchResults,
  type GlobalSearchGroup,
} from "./global-search-results";

export function useGlobalSearchResults(query: string, open: boolean, workspaceId: string) {
  const decks = useDecks();
  const spoilers = useSpoilerState();
  const visibilityKey = spoilerCatalogCacheKey(spoilers.state);
  const enabled = open && Boolean(query) && !spoilers.loading;
  const catalog = useQuery({
    queryKey: ["catalog", "global-search", workspaceId, visibilityKey, query],
    queryFn: () => window.catalog.list({ query, uniqueCards: true, limit: 6 }),
    enabled,
    retry: false,
  });
  const collection = useQuery(
    globalSearchCollectionQueryOptions(
      window.collection.list,
      query,
      workspaceId,
      visibilityKey,
      enabled,
    ),
  );
  const groups: GlobalSearchGroup[] = [
    { label: "Cards", items: cardSearchResults(catalog.data?.cards ?? []) },
    { label: "Decks", items: deckSearchResults(decks, query) },
    {
      label: "Collection",
      items: collectionSearchResults(collection.data?.holdings ?? []),
    },
  ].filter((group) => group.items.length > 0);
  const errors = [
    catalog.isError ? "The local card index could not be read." : catalog.data?.queryError,
    collection.isError
      ? collection.error instanceof CollectionSearchNotReadyError
        ? collection.error.message
        : "The Collection could not be read."
      : undefined,
  ].filter(Boolean);

  return {
    groups,
    error: errors.join(" "),
    loading: enabled && (catalog.isFetching || collection.isFetching),
    retry: () => {
      void catalog.refetch();
      void collection.refetch();
    },
  };
}
