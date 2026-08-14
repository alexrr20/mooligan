import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { AuthSnapshot } from "./auth/service";
import type { CatalogProgress, CatalogStatus } from "./catalog/ipc";
import type { CatalogListRequest } from "./catalog/query";
import type { PreferenceSyncSnapshot } from "./workspace/preference-sync";
import type { Preferences, PreferencesUpdate } from "./workspace/preferences";

contextBridge.exposeInMainWorld("catalog", {
  download: (): Promise<CatalogStatus> => ipcRenderer.invoke("catalog:download"),
  list: (request?: CatalogListRequest) => ipcRenderer.invoke("catalog:list", request),
  onProgress: (callback: (progress: CatalogProgress) => void) => {
    const listener = (_event: IpcRendererEvent, progress: CatalogProgress) => callback(progress);

    ipcRenderer.on("catalog:progress", listener);
    return () => ipcRenderer.off("catalog:progress", listener);
  },
  status: (): Promise<CatalogStatus> => ipcRenderer.invoke("catalog:status"),
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
