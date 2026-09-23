import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CollectionPage } from "../features/collection/collection-page";
import {
  type CollectionSearchState,
  validateCollectionSearch,
} from "../features/collection/collection-state";

export const Route = createFileRoute("/collection")({
  component: CollectionRoute,
  validateSearch: validateCollectionSearch,
});

function CollectionRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const update = useCallback(
    (update: CollectionSearchState) => {
      void navigate({ replace: true, search: (current) => ({ ...current, ...update }) });
    },
    [navigate],
  );
  const clearFilters = useCallback(() => {
    void navigate({ replace: true, search: {} });
  }, [navigate]);
  return <CollectionPage search={search} onSearchChange={update} onClearFilters={clearFilters} />;
}
