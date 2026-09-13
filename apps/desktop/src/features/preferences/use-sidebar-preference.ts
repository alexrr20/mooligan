import { useCallback, useState } from "react";

const STORAGE_KEY = "mooligan.sidebar.open";

// Device storage works in packaged Electron's file origin, where cookies do not.
export function useSidebarPreference() {
  const [open, setOpenState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* Keep the current window usable when device storage is unavailable. */
    }
  }, []);
  return { open, setOpen };
}
