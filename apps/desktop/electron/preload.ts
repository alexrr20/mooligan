import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type {
  CatalogPrintingResult,
  CatalogReleaseSummary,
  SpoilerPolicy,
  SpoilerRevealSummaries,
  SpoilerState,
} from "@mooligan/domain/spoilers";
import type {
  AddCollectionHoldingRequest,
  CollectionListPage,
  CollectionListRequest,
  CollectionMutationResult,
  RemoveCollectionHoldingRequest,
  UpdateCollectionHoldingRequest,
} from "@mooligan/domain/collection";

import type { AuthSnapshot } from "./auth/service";
import type { CatalogProgress, CatalogStatus } from "./catalog/ipc";
import type {
  CatalogListPage,
  CatalogListRequest,
  CatalogUpcomingPrintingPage,
  CatalogUpcomingPrintingRequest,
} from "./catalog/query";
import type { PreferenceSyncSnapshot } from "./workspace/preference-sync";
import type { Preferences, PreferencesUpdate } from "./workspace/preferences";

function subscribe<Value>(channel: string, callback: (value: Value) => void) {
  const listener = (_event: IpcRendererEvent, value: Value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

export const desktopApi = {
  collection: {
    add: (request: AddCollectionHoldingRequest): Promise<CollectionMutationResult> =>
      ipcRenderer.invoke("collection:add", request),
    list: (request?: CollectionListRequest): Promise<CollectionListPage> =>
      ipcRenderer.invoke("collection:list", request),
    onChanged: (callback: () => void) => subscribe<void>("collection:changed", callback),
    remove: (request: RemoveCollectionHoldingRequest): Promise<void> =>
      ipcRenderer.invoke("collection:remove", request),
    update: (request: UpdateCollectionHoldingRequest): Promise<CollectionMutationResult> =>
      ipcRenderer.invoke("collection:update", request),
  },

  catalog: {
    detail: (printingId: string): Promise<CatalogPrintingResult | null> =>
      ipcRenderer.invoke("catalog:detail", printingId),
    download: (): Promise<CatalogStatus> => ipcRenderer.invoke("catalog:download"),
    list: (request?: CatalogListRequest): Promise<CatalogListPage> =>
      ipcRenderer.invoke("catalog:list", request),
    onProgress: (callback: (progress: CatalogProgress) => void) =>
      subscribe("catalog:progress", callback),
    spoilerRevealSummaries: (): Promise<SpoilerRevealSummaries> =>
      ipcRenderer.invoke("catalog:spoiler-reveals"),
    status: (): Promise<CatalogStatus> => ipcRenderer.invoke("catalog:status"),
    upcoming: (): Promise<CatalogReleaseSummary[]> => ipcRenderer.invoke("catalog:upcoming"),
    upcomingPrintings: (
      request?: CatalogUpcomingPrintingRequest,
    ): Promise<CatalogUpcomingPrintingPage> =>
      ipcRenderer.invoke("catalog:upcoming-printings", request),
  },

  spoilers: {
    onChanged: (callback: (state: SpoilerState) => void) => subscribe("spoilers:changed", callback),
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
  },

  preferences: {
    onChanged: (callback: (preferences: Preferences) => void) =>
      subscribe("preferences:changed", callback),
    read: (): Promise<Preferences> => ipcRenderer.invoke("preferences:read"),
    update: (update: PreferencesUpdate): Promise<Preferences> =>
      ipcRenderer.invoke("preferences:update", update),
  },

  preferenceSync: {
    onChanged: (callback: (snapshot: PreferenceSyncSnapshot) => void) =>
      subscribe("sync:changed", callback),
    read: (): Promise<PreferenceSyncSnapshot> => ipcRenderer.invoke("sync:read"),
    retry: (): Promise<PreferenceSyncSnapshot> => ipcRenderer.invoke("sync:retry"),
  },

  workspace: {
    exportBackup: (): Promise<"cancelled" | "exported"> => ipcRenderer.invoke("workspace:export"),
    importBackup: (): Promise<"cancelled" | "imported"> => ipcRenderer.invoke("workspace:import"),
  },

  auth: {
    onChanged: (callback: (snapshot: AuthSnapshot) => void) => subscribe("auth:changed", callback),
    onError: (callback: (message: string) => void) => subscribe("auth:error", callback),
    read: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:read"),
    refresh: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:refresh"),
    signIn: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:sign-in"),
    signOut: (): Promise<AuthSnapshot> => ipcRenderer.invoke("auth:sign-out"),
  },
};

export type DesktopApi = typeof desktopApi;

contextBridge.exposeInMainWorld("catalog", desktopApi.catalog);
contextBridge.exposeInMainWorld("collection", desktopApi.collection);
contextBridge.exposeInMainWorld("spoilers", desktopApi.spoilers);
contextBridge.exposeInMainWorld("preferences", desktopApi.preferences);
contextBridge.exposeInMainWorld("preferenceSync", desktopApi.preferenceSync);
contextBridge.exposeInMainWorld("workspace", desktopApi.workspace);
contextBridge.exposeInMainWorld("auth", desktopApi.auth);
