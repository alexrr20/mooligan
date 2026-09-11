import { useQuery } from "@tanstack/react-query";

import { listCatalog, listCollection } from "../catalog/catalog-request";
import { globalSearchCatalogQueryOptions } from "./global-search-query";
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

export function useGlobalSearchResults(input: string, open: boolean, workspaceId: string) {
  const query = open ? input : "";
  const decks = useDecks();
  const spoilers = useSpoilerState();
  const visibilityKey = spoilerCatalogCacheKey(spoilers.state);
  const enabled = open && Boolean(query) && !spoilers.loading;
  const catalog = useQuery(
    globalSearchCatalogQueryOptions(listCatalog, query, workspaceId, visibilityKey, enabled),
  );
  const collection = useQuery(
    globalSearchCollectionQueryOptions(listCollection, query, workspaceId, visibilityKey, enabled),
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
