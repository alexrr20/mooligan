import { deckEntriesQuery, decksQuery } from "@mooligan/workspace/schema";

import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import { createDeckMutations } from "./deck-mutations";
import { materializeDecks } from "./deck-state";

export function useDecks() {
  const store = useWorkspaceLiveStore();
  const decks = store.useQuery(decksQuery);
  const entries = store.useQuery(deckEntriesQuery);
  return materializeDecks(decks, entries);
}

export function useDeckMutations() {
  const store = useWorkspaceLiveStore();
  return createDeckMutations(store, window.catalog.detail);
}
