import { useCallback, useState } from "react";

type DeckView = "list" | "grid";

const STORAGE_KEY = "mooligan.deck.view";

export function useDeckViewPreference() {
  const [view, setViewState] = useState<DeckView>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const setView = useCallback((next: DeckView) => {
    setViewState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The current window still keeps the selected view.
    }
  }, []);

  return { setView, view };
}
