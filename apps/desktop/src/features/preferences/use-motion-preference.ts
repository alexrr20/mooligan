import { useCallback, useSyncExternalStore } from "react";

export type MotionPreference = "system" | "reduced" | "full";

type MotionPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const MOTION_STORAGE_KEY = "mooligan.motion";
const listeners = new Set<() => void>();
let currentMotion: MotionPreference | undefined;

export function readMotionPreference(
  storage: Pick<MotionPreferenceStorage, "getItem">,
): MotionPreference {
  try {
    const stored = storage.getItem(MOTION_STORAGE_KEY);
    return stored === "full" || stored === "reduced" ? stored : "system";
  } catch {
    return "system";
  }
}

export function writeMotionPreference(
  storage: Pick<MotionPreferenceStorage, "setItem">,
  preference: MotionPreference,
) {
  try {
    storage.setItem(MOTION_STORAGE_KEY, preference);
  } catch {
    // The current renderer still keeps the selected preference.
  }
}

export function useMotionPreference() {
  const motion = useSyncExternalStore(subscribe, motionSnapshot, (): MotionPreference => "system");
  const setMotion = useCallback((preference: MotionPreference) => {
    writeMotionPreference(window.localStorage, preference);
    currentMotion = preference;
    for (const listener of listeners) listener();
  }, []);

  return { motion, setMotion };
}

function motionSnapshot(): MotionPreference {
  currentMotion ??= readMotionPreference(window.localStorage);
  return currentMotion;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
