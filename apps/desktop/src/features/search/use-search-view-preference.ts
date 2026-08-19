import { useCallback, useState } from "react";

export type SearchView = "grid" | "list";

type SearchViewStorage = Pick<Storage, "getItem" | "setItem">;

const SEARCH_VIEW_STORAGE_KEY = "mooligan.search.view";

export function readSearchViewPreference(storage: Pick<SearchViewStorage, "getItem">): SearchView {
  try {
    return storage.getItem(SEARCH_VIEW_STORAGE_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function writeSearchViewPreference(
  storage: Pick<SearchViewStorage, "setItem">,
  view: SearchView,
) {
  try {
    storage.setItem(SEARCH_VIEW_STORAGE_KEY, view);
  } catch {
    // Persistence is a convenience; the in-memory selection should still work.
  }
}

export function useSearchViewPreference(gridFromRoute: boolean) {
  const [view, setViewState] = useState<SearchView>(() =>
    gridFromRoute ? "grid" : readSearchViewPreference(window.localStorage),
  );

  const setView = useCallback((nextView: SearchView) => {
    setViewState(nextView);
    writeSearchViewPreference(window.localStorage, nextView);
  }, []);

  return { setView, view };
}
