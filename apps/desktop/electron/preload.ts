import { UuidSchema } from "@mooligan/domain/schema";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { SpoilerTargetIdSchema } from "@mooligan/domain/spoilers";
import { CatalogListPageSchema } from "@mooligan/domain/catalog-search";
import { DeckCostSchema } from "@mooligan/domain/deck-cost";
import {
  ExchangeRatesSchema,
  PriceStatusSchema,
  PrintingPricesSchema,
} from "@mooligan/domain/market";
import { Schema } from "effect";

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

const decodeUuid = Schema.decodeUnknownSync(UuidSchema);

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
      Schema.decodeUnknownSync(Schema.NullOr(ExchangeRatesSchema))(
        await ipcRenderer.invoke("prices:exchange-rates"),
      ),
    status: async () =>
      Schema.decodeUnknownSync(PriceStatusSchema)(await ipcRenderer.invoke("prices:status")),
    refresh: async () =>
      Schema.decodeUnknownSync(PriceStatusSchema)(await ipcRenderer.invoke("prices:refresh")),
    printing: async (printingId) =>
      Schema.decodeUnknownSync(PrintingPricesSchema)(
        await ipcRenderer.invoke("prices:printing", decodeUuid(printingId)),
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
    deckCost: async (request) =>
      Schema.decodeUnknownSync(DeckCostSchema)(
        await ipcRenderer.invoke("catalog:deck-cost", request),
      ),
    colors: (printingIds) => ipcRenderer.invoke("catalog:colors", printingIds),
    cancelQuery: (requestId) => ipcRenderer.invoke("catalog:cancel-query", decodeUuid(requestId)),
    detail: (printingId) => ipcRenderer.invoke("catalog:detail", printingId),
    download: () => ipcRenderer.invoke("catalog:download"),
    list: async (request, requestId) =>
      Schema.decodeUnknownSync(CatalogListPageSchema)(
        unwrapCatalogRequest(await ipcRenderer.invoke("catalog:list", request, requestId)),
      ),
    onProgress: (callback: (progress: CatalogProgress) => void) =>
      subscribe("catalog:progress", callback),
    resolveRootSetId: (targetId) =>
      ipcRenderer.invoke(
        "catalog:root-set",
        Schema.decodeUnknownSync(SpoilerTargetIdSchema)(targetId),
      ),
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
        await ipcRenderer.invoke("workspace-projection:spoilers-connect", decodeUuid(workspaceId)),
      ),
    connectCollection: async (workspaceId) =>
      validateCollectionProjectionConnection(
        await ipcRenderer.invoke(
          "workspace-projection:collection-connect",
          decodeUuid(workspaceId),
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
      ipcRenderer.invoke("workspace:activate-restore", decodeUuid(workspaceId)),
    beginRestore: async () =>
      validateWorkspaceBootstrap(await ipcRenderer.invoke("workspace:begin-restore")),
    bootstrap: async () =>
      validateWorkspaceBootstrap(await ipcRenderer.invoke("workspace:bootstrap")),
    cancelRestore: (workspaceId) =>
      ipcRenderer.invoke("workspace:cancel-restore", decodeUuid(workspaceId)),
    exportBackup: (backup) =>
      ipcRenderer.invoke("workspace:export", validateWorkspaceBackup(backup)),
    onChanged: (callback) => subscribe("workspace:changed", callback),
    refreshSync: async () =>
      validateWorkspaceRuntime(await ipcRenderer.invoke("workspace:refresh-sync")),
    runtime: async () => validateWorkspaceRuntime(await ipcRenderer.invoke("workspace:runtime")),
    select: (workspaceId) => ipcRenderer.invoke("workspace:select", decodeUuid(workspaceId)),
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
