import { useCallback, useState } from "react";

type View = "grid" | "list";

export function readViewPreference(key: string, storage?: Pick<Storage, "getItem">): View {
  try {
    return (storage ?? window.localStorage).getItem(key) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function writeViewPreference(key: string, view: View, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? window.localStorage).setItem(key, view);
  } catch {
    // The current window still keeps the selected view.
  }
}

export function useViewPreference(storageKey: string, initialOverride?: View) {
  const [view, setViewState] = useState<View>(
    () => initialOverride ?? readViewPreference(storageKey),
  );
  const setView = useCallback(
    (next: View) => {
      setViewState(next);
      writeViewPreference(storageKey, next);
    },
    [storageKey],
  );

  return { setView, view };
}
