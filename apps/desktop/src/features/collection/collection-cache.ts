import type { QueryClient } from "@tanstack/react-query";

type CollectionEvents = Pick<Window["collection"], "onChanged">;

export function subscribeToCollectionChanges(
  queryClient: QueryClient,
  events: CollectionEvents = window.collection,
) {
  return events.onChanged(() => {
    void queryClient.invalidateQueries({ queryKey: ["collection"] });
  });
}
