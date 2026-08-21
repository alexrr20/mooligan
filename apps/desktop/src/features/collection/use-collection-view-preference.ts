import { useCallback, useState } from "react";

export type CollectionView = "grid" | "list";

const STORAGE_KEY = "mooligan.collection.view";

export function useCollectionViewPreference() {
  const [view, setViewState] = useState<CollectionView>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const setView = useCallback((next: CollectionView) => {
    setViewState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The current window still keeps the selected view.
    }
  }, []);

  return { setView, view };
}
