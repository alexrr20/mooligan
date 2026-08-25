import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { AuthSnapshot, CatalogProgress, DesktopApi, Preferences } from "../shared/desktop-api";

function subscribe<Value>(channel: string, callback: (value: Value) => void) {
  const listener = (_event: IpcRendererEvent, value: Value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

export const desktopApi = {
  collection: {
    add: (request) => ipcRenderer.invoke("collection:add", request),
    list: (request) => ipcRenderer.invoke("collection:list", request),
    onChanged: (callback: () => void) => subscribe<void>("collection:changed", callback),
    remove: (request) => ipcRenderer.invoke("collection:remove", request),
    update: (request) => ipcRenderer.invoke("collection:update", request),
  },

  catalog: {
    detail: (printingId) => ipcRenderer.invoke("catalog:detail", printingId),
    download: () => ipcRenderer.invoke("catalog:download"),
    list: (request) => ipcRenderer.invoke("catalog:list", request),
    onProgress: (callback: (progress: CatalogProgress) => void) =>
      subscribe("catalog:progress", callback),
    spoilerRevealSummaries: () => ipcRenderer.invoke("catalog:spoiler-reveals"),
    status: () => ipcRenderer.invoke("catalog:status"),
    upcoming: () => ipcRenderer.invoke("catalog:upcoming"),
    upcomingPrintings: (request) => ipcRenderer.invoke("catalog:upcoming-printings", request),
  },

  spoilers: {
    onChanged: (callback) => subscribe("spoilers:changed", callback),
    protectAll: () => ipcRenderer.invoke("spoilers:protect-all"),
    protectPrinting: (printingId) => ipcRenderer.invoke("spoilers:protect-printing", printingId),
    protectRelease: (setId) => ipcRenderer.invoke("spoilers:protect-release", setId),
    read: () => ipcRenderer.invoke("spoilers:read"),
    revealPrinting: (printingId) => ipcRenderer.invoke("spoilers:reveal-printing", printingId),
    revealRelease: (setId) => ipcRenderer.invoke("spoilers:reveal-release", setId),
    setPolicy: (policy) => ipcRenderer.invoke("spoilers:set-policy", policy),
  },

  preferences: {
    onChanged: (callback: (preferences: Preferences) => void) =>
      subscribe("preferences:changed", callback),
    read: () => ipcRenderer.invoke("preferences:read"),
    update: (update) => ipcRenderer.invoke("preferences:update", update),
  },

  workspace: {
    exportBackup: () => ipcRenderer.invoke("workspace:export"),
    importBackup: () => ipcRenderer.invoke("workspace:import"),
  },

  auth: {
    onChanged: (callback: (snapshot: AuthSnapshot) => void) => subscribe("auth:changed", callback),
    onError: (callback: (message: string) => void) => subscribe("auth:error", callback),
    read: () => ipcRenderer.invoke("auth:read"),
    refresh: () => ipcRenderer.invoke("auth:refresh"),
    signIn: () => ipcRenderer.invoke("auth:sign-in"),
    signOut: () => ipcRenderer.invoke("auth:sign-out"),
  },
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("catalog", desktopApi.catalog);
contextBridge.exposeInMainWorld("collection", desktopApi.collection);
contextBridge.exposeInMainWorld("spoilers", desktopApi.spoilers);
contextBridge.exposeInMainWorld("preferences", desktopApi.preferences);
contextBridge.exposeInMainWorld("workspace", desktopApi.workspace);
contextBridge.exposeInMainWorld("auth", desktopApi.auth);
