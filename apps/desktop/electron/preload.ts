import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { SpoilerTargetIdSchema } from "@mooligan/domain/spoilers";
import { CatalogListPageSchema } from "@mooligan/domain/catalog-search";
import {
  ExchangeRatesSchema,
  PriceStatusSchema,
  PrintingPricesSchema,
} from "@mooligan/domain/market";
import * as z from "zod";

import {
  validateCollectionListResult,
  validateCollectionPrintingRequest,
  validateCollectionProjectionConnection,
  validateCollectionProjectionDelta,
  validateCollectionProjectionResult,
  validateCollectionProjectionSnapshot,
  validateSpoilerProjectionConnection,
  validateSpoilerProjectionDelta,
  validateSpoilerProjectionResult,
  validateSpoilerProjectionSnapshot,
  validateWorkspaceBootstrap,
  validateWorkspaceRuntime,
  type AuthSnapshot,
  type CatalogProgress,
  type DesktopApi,
} from "../shared/desktop-api";
import { validateWorkspaceBackup } from "./workspace/backup";
import { unwrapCatalogRequest } from "../shared/catalog-request";

function subscribe<Value>(channel: string, callback: (value: Value) => void) {
  const listener = (_event: IpcRendererEvent, value: Value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

export const desktopApi = {
  prices: {
    exchangeRates: async () =>
      ExchangeRatesSchema.nullable().parse(await ipcRenderer.invoke("prices:exchange-rates")),
    status: async () => PriceStatusSchema.parse(await ipcRenderer.invoke("prices:status")),
    refresh: async () => PriceStatusSchema.parse(await ipcRenderer.invoke("prices:refresh")),
    printing: async (printingId) =>
      PrintingPricesSchema.parse(
        await ipcRenderer.invoke("prices:printing", z.uuid().parse(printingId)),
      ),
    onUpdated: (callback) => subscribe("prices:updated", callback),
  },
  collection: {
    list: async (request, requestId) =>
      validateCollectionListResult(
        unwrapCatalogRequest(await ipcRenderer.invoke("collection:list", request, requestId)),
      ),
  },

  catalog: {
    cancelQuery: (requestId) =>
      ipcRenderer.invoke("catalog:cancel-query", z.uuid().parse(requestId)),
    detail: (printingId) => ipcRenderer.invoke("catalog:detail", printingId),
    download: () => ipcRenderer.invoke("catalog:download"),
    list: async (request, requestId) =>
      CatalogListPageSchema.parse(
        unwrapCatalogRequest(await ipcRenderer.invoke("catalog:list", request, requestId)),
      ),
    onProgress: (callback: (progress: CatalogProgress) => void) =>
      subscribe("catalog:progress", callback),
    resolveRootSetId: (targetId) =>
      ipcRenderer.invoke("catalog:root-set", SpoilerTargetIdSchema.parse(targetId)),
    spoilerRevealSummaries: () => ipcRenderer.invoke("catalog:spoiler-reveals"),
    status: () => ipcRenderer.invoke("catalog:status"),
    upcoming: () => ipcRenderer.invoke("catalog:upcoming"),
    upcomingPrintings: (request) => ipcRenderer.invoke("catalog:upcoming-printings", request),
    validateCollectionPrinting: (request) =>
      ipcRenderer.invoke(
        "catalog:validate-collection-printing",
        validateCollectionPrintingRequest(request),
      ),
  },

  workspaceProjection: {
    applyCollectionDelta: async (delta) =>
      validateCollectionProjectionResult(
        await ipcRenderer.invoke(
          "workspace-projection:collection-apply",
          validateCollectionProjectionDelta(delta),
        ),
      ),
    applySpoilerDelta: async (delta) =>
      validateSpoilerProjectionResult(
        await ipcRenderer.invoke(
          "workspace-projection:spoilers-apply",
          validateSpoilerProjectionDelta(delta),
        ),
      ),
    connectSpoilers: async (workspaceId) =>
      validateSpoilerProjectionConnection(
        await ipcRenderer.invoke(
          "workspace-projection:spoilers-connect",
          z.uuid().parse(workspaceId),
        ),
      ),
    connectCollection: async (workspaceId) =>
      validateCollectionProjectionConnection(
        await ipcRenderer.invoke(
          "workspace-projection:collection-connect",
          z.uuid().parse(workspaceId),
        ),
      ),
    onCollectionResyncRequired: (callback) =>
      subscribe("workspace-projection:collection-resync-required", callback),
    onSpoilersChanged: (callback) => subscribe("workspace-projection:spoilers-changed", callback),
    replaceCollection: async (snapshot) =>
      validateCollectionProjectionResult(
        await ipcRenderer.invoke(
          "workspace-projection:collection-replace",
          validateCollectionProjectionSnapshot(snapshot),
        ),
      ),
    replaceSpoilers: async (snapshot) =>
      validateSpoilerProjectionResult(
        await ipcRenderer.invoke(
          "workspace-projection:spoilers-replace",
          validateSpoilerProjectionSnapshot(snapshot),
        ),
      ),
  },

  workspace: {
    activateRestore: (workspaceId) =>
      ipcRenderer.invoke("workspace:activate-restore", z.uuid().parse(workspaceId)),
    beginRestore: async () =>
      validateWorkspaceBootstrap(await ipcRenderer.invoke("workspace:begin-restore")),
    bootstrap: async () =>
      validateWorkspaceBootstrap(await ipcRenderer.invoke("workspace:bootstrap")),
    cancelRestore: (workspaceId) =>
      ipcRenderer.invoke("workspace:cancel-restore", z.uuid().parse(workspaceId)),
    exportBackup: (backup) =>
      ipcRenderer.invoke("workspace:export", validateWorkspaceBackup(backup)),
    onChanged: (callback) => subscribe("workspace:changed", callback),
    refreshSync: async () =>
      validateWorkspaceRuntime(await ipcRenderer.invoke("workspace:refresh-sync")),
    runtime: async () => validateWorkspaceRuntime(await ipcRenderer.invoke("workspace:runtime")),
    select: (workspaceId) => ipcRenderer.invoke("workspace:select", z.uuid().parse(workspaceId)),
    selectBackup: async () => {
      const value = await ipcRenderer.invoke("workspace:select-backup");
      return value === null ? null : validateWorkspaceBackup(value);
    },
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
contextBridge.exposeInMainWorld("prices", desktopApi.prices);
contextBridge.exposeInMainWorld("collection", desktopApi.collection);
contextBridge.exposeInMainWorld("workspaceProjection", desktopApi.workspaceProjection);
contextBridge.exposeInMainWorld("workspace", desktopApi.workspace);
contextBridge.exposeInMainWorld("auth", desktopApi.auth);
