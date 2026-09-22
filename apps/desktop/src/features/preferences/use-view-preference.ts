import { useCallback, useState } from "react";

export type CardView = "grid" | "list" | "stack";

export function readViewPreference(key: string, storage?: Pick<Storage, "getItem">): CardView {
  try {
    const view = (storage ?? window.localStorage).getItem(key);
    return view === "grid" || view === "stack" ? view : "list";
  } catch {
    return "list";
  }
}

export function writeViewPreference(
  key: string,
  view: CardView,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? window.localStorage).setItem(key, view);
  } catch {
    // The current window still keeps the selected view.
  }
}

export function useViewPreference(storageKey: string, initialOverride?: CardView) {
  const [view, setViewState] = useState<CardView>(
    () => initialOverride ?? readViewPreference(storageKey),
  );
  const setView = useCallback(
    (next: CardView) => {
      setViewState(next);
      writeViewPreference(storageKey, next);
    },
    [storageKey],
  );

  return { setView, view };
}
