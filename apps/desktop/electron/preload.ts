import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type {
  CatalogPrintingResult,
  CatalogReleaseSummary,
  SpoilerPolicy,
  SpoilerRevealSummaries,
  SpoilerState,
} from "@mooligan/domain/spoilers";

import type { AuthSnapshot } from "./auth/service";
import type { CatalogProgress, CatalogStatus } from "./catalog/ipc";
import type {
  CatalogListRequest,
  CatalogUpcomingPrintingPage,
  CatalogUpcomingPrintingRequest,
} from "./catalog/query";
import type { PreferenceSyncSnapshot } from "./workspace/preference-sync";
import type { Preferences, PreferencesUpdate } from "./workspace/preferences";

contextBridge.exposeInMainWorld("catalog", {
  detail: (printingId: string): Promise<CatalogPrintingResult | null> =>
    ipcRenderer.invoke("catalog:detail", printingId),
  download: (): Promise<CatalogStatus> => ipcRenderer.invoke("catalog:download"),
  list: (request?: CatalogListRequest) => ipcRenderer.invoke("catalog:list", request),
  onProgress: (callback: (progress: CatalogProgress) => void) => {
    const listener = (_event: IpcRendererEvent, progress: CatalogProgress) => callback(progress);

    ipcRenderer.on("catalog:progress", listener);
    return () => ipcRenderer.off("catalog:progress", listener);
  },
  spoilerRevealSummaries: (): Promise<SpoilerRevealSummaries> =>
    ipcRenderer.invoke("catalog:spoiler-reveals"),
  status: (): Promise<CatalogStatus> => ipcRenderer.invoke("catalog:status"),
  upcoming: (): Promise<CatalogReleaseSummary[]> => ipcRenderer.invoke("catalog:upcoming"),
  upcomingPrintings: (
    request?: CatalogUpcomingPrintingRequest,
  ): Promise<CatalogUpcomingPrintingPage> =>
    ipcRenderer.invoke("catalog:upcoming-printings", request),
});

contextBridge.exposeInMainWorld("spoilers", {
  onChanged: (callback: (state: SpoilerState) => void) => {
    const listener = (_event: IpcRendererEvent, state: SpoilerState) => callback(state);

    ipcRenderer.on("spoilers:changed", listener);
    return () => ipcRenderer.off("spoilers:changed", listener);
  },
  protectAll: (): Promise<SpoilerState> => ipcRenderer.invoke("spoilers:protect-all"),
  protectPrinting: (printingId: string): Promise<SpoilerState> =>
    ipcRenderer.invoke("spoilers:protect-printing", printingId),
  protectRelease: (setId: string): Promise<SpoilerState> =>
    ipcRenderer.invoke("spoilers:protect-release", setId),
  read: (): Promise<SpoilerState> => ipcRenderer.invoke("spoilers:read"),
  revealPrinting: (printingId: string): Promise<SpoilerState> =>
    ipcRenderer.invoke("spoilers:reveal-printing", printingId),
  revealRelease: (setId: string): Promise<SpoilerState> =>
    ipcRenderer.invoke("spoilers:reveal-release", setId),
  setPolicy: (policy: SpoilerPolicy): Promise<SpoilerState> =>
    ipcRenderer.invoke("spoilers:set-policy", policy),
});

contextBridge.exposeInMainWorld("preferences", {
  onChanged: (callback: (preferences: Preferences) => void) => {
    const listener = (_event: IpcRendererEvent, preferences: Preferences) => callback(preferences);

    ipcRenderer.on("preferences:changed", listener);
    return () => ipcRenderer.off("preferences:changed", listener);
  },
  read: (): Promise<Preferences> => ipcRenderer.invoke("preferences:read"),
  update: (update: PreferencesUpdate): Promise<Preferences> =>
    ipcRenderer.invoke("preferences:update", update),
});

contextBridge.exposeInMainWorld("preferenceSync", {
  onChanged: (callback: (snapshot: PreferenceSyncSnapshot) => void) => {
    const listener = (_event: IpcRendererEvent, snapshot: PreferenceSyncSnapshot) =>
      callback(snapshot);

    ipcRenderer.on("sync:changed", listener);
    return () => ipcRenderer.off("sync:changed", listener);
  },
  read: (): Promise<PreferenceSyncSnapshot> => ipcRenderer.invoke("sync:read"),
  retry: (): Promise<PreferenceSyncSnapshot> => ipcRenderer.invoke("sync:retry"),
});

contextBridge.exposeInMainWorld("workspace", {
  exportBackup: (): Promise<"cancelled" | "exported"> => ipcRenderer.invoke("workspace:export"),
  importBackup: (): Promise<"cancelled" | "imported"> => ipcRenderer.invoke("workspace:import"),
});

contextBridge.exposeInMainWorld("auth", {
  onChanged: (callback: (snapshot: AuthSnapshot) => void) => {
    const listener = (_event: IpcRendererEvent, snapshot: AuthSnapshot) => callback(snapshot);

    ipcRenderer.on("auth:changed", listener);
    return () => ipcRenderer.off("auth:changed", listener);
  },
  onError: (callback: (message: string) => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message);

    ipcRenderer.on("auth:error", listener);
    return () => ipcRenderer.off("auth:error", listener);
  },
  read: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:read"),
  refresh: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:refresh"),
  signIn: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:sign-in"),
  signOut: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:sign-out"),
});
