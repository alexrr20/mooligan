import { deckEntriesQuery, decksQuery } from "@mooligan/workspace/decks";

import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import { createDeckMutations } from "@mooligan/workspace/client/deck-mutations";
import { materializeDecks } from "@mooligan/workspace/client/deck-state";

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
