import { ColorSchema } from "@mooligan/domain/catalog";
import { AuthSnapshotSchema } from "@mooligan/account/runtime";
import {
  CollectionListResultSchema,
  CollectionPrintingValidationRequestSchema,
  CollectionProjectionConnectionSchema,
  CollectionProjectionResultSchema,
} from "@mooligan/domain/collection";
import {
  CollectionProjectionDeltaSchema,
  CollectionProjectionSnapshotSchema,
} from "@mooligan/workspace/transport";
import {
  SpoilerProjectionConnectionSchema,
  SpoilerProjectionDeltaSchema,
  SpoilerProjectionResultSchema,
  SpoilerProjectionSnapshotSchema,
} from "@mooligan/domain/spoilers";
import { UuidSchema } from "@mooligan/domain/schema";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  SpoilerTargetIdSchema,
  CatalogPrintingResultSchema,
  CatalogReleaseSummarySchema,
  SpoilerRevealSummariesSchema,
} from "@mooligan/domain/spoilers";
import {
  CatalogListPageSchema,
  CatalogUpcomingPrintingPageSchema,
} from "@mooligan/domain/catalog-search";
import { DeckCostSchema } from "@mooligan/domain/deck-cost";
import {
  ExchangeRatesSchema,
  PriceStatusSchema,
  PrintingPricesSchema,
} from "@mooligan/domain/market";
import { Schema } from "effect";

import type { AuthSnapshot } from "@mooligan/account/runtime";
import {
  CatalogProgressSchema,
  CatalogStatusSchema,
  validateWorkspaceBootstrap,
  validateWorkspaceRuntime,
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
      Schema.decodeUnknownSync(CollectionListResultSchema)(
        unwrapCatalogRequest(await ipcRenderer.invoke("collection:list", request, requestId)),
      ),
  },

  catalog: {
    deckCost: async (request) =>
      Schema.decodeUnknownSync(DeckCostSchema)(
        await ipcRenderer.invoke("catalog:deck-cost", request),
      ),
    colors: async (printingIds) =>
      Schema.decodeUnknownSync(Schema.NullOr(Schema.mutable(Schema.Array(ColorSchema))))(
        await ipcRenderer.invoke("catalog:colors", printingIds),
      ),
    cancelQuery: (requestId) => ipcRenderer.invoke("catalog:cancel-query", decodeUuid(requestId)),
    detail: async (printingId) =>
      Schema.decodeUnknownSync(Schema.NullOr(CatalogPrintingResultSchema))(
        await ipcRenderer.invoke("catalog:detail", printingId),
      ),
    download: async () =>
      Schema.decodeUnknownSync(CatalogStatusSchema)(await ipcRenderer.invoke("catalog:download")),
    list: async (request, requestId) =>
      Schema.decodeUnknownSync(CatalogListPageSchema)(
        unwrapCatalogRequest(await ipcRenderer.invoke("catalog:list", request, requestId)),
      ),
    onProgress: (callback: (progress: CatalogProgress) => void) =>
      subscribe("catalog:progress", (value) =>
        callback(Schema.decodeUnknownSync(CatalogProgressSchema)(value)),
      ),
    resolveRootSetId: async (targetId) =>
      Schema.decodeUnknownSync(Schema.NullOr(SpoilerTargetIdSchema))(
        await ipcRenderer.invoke(
          "catalog:root-set",
          Schema.decodeUnknownSync(SpoilerTargetIdSchema)(targetId),
        ),
      ),
    spoilerRevealSummaries: async () =>
      Schema.decodeUnknownSync(SpoilerRevealSummariesSchema)(
        await ipcRenderer.invoke("catalog:spoiler-reveals"),
      ),
    status: async () =>
      Schema.decodeUnknownSync(CatalogStatusSchema)(await ipcRenderer.invoke("catalog:status")),
    upcoming: async () =>
      Schema.decodeUnknownSync(Schema.mutable(Schema.Array(CatalogReleaseSummarySchema)))(
        await ipcRenderer.invoke("catalog:upcoming"),
      ),
    upcomingPrintings: async (request) =>
      Schema.decodeUnknownSync(CatalogUpcomingPrintingPageSchema)(
        await ipcRenderer.invoke("catalog:upcoming-printings", request),
      ),
    validateCollectionPrinting: (request) =>
      ipcRenderer.invoke(
        "catalog:validate-collection-printing",
        Schema.decodeUnknownSync(CollectionPrintingValidationRequestSchema)(request),
      ),
  },

  workspaceProjection: {
    applyCollectionDelta: async (delta) =>
      Schema.decodeUnknownSync(CollectionProjectionResultSchema)(
        await ipcRenderer.invoke(
          "workspace-projection:collection-apply",
          Schema.decodeUnknownSync(CollectionProjectionDeltaSchema)(delta),
        ),
      ),
    applySpoilerDelta: async (delta) =>
      Schema.decodeUnknownSync(SpoilerProjectionResultSchema)(
        await ipcRenderer.invoke(
          "workspace-projection:spoilers-apply",
          Schema.decodeUnknownSync(SpoilerProjectionDeltaSchema)(delta),
        ),
      ),
    connectSpoilers: async (workspaceId) =>
      Schema.decodeUnknownSync(SpoilerProjectionConnectionSchema)(
        await ipcRenderer.invoke("workspace-projection:spoilers-connect", decodeUuid(workspaceId)),
      ),
    connectCollection: async (workspaceId) =>
      Schema.decodeUnknownSync(CollectionProjectionConnectionSchema)(
        await ipcRenderer.invoke(
          "workspace-projection:collection-connect",
          decodeUuid(workspaceId),
        ),
      ),
    onCollectionResyncRequired: (callback) =>
      subscribe("workspace-projection:collection-resync-required", callback),
    onSpoilersChanged: (callback) => subscribe("workspace-projection:spoilers-changed", callback),
    replaceCollection: async (snapshot) =>
      Schema.decodeUnknownSync(CollectionProjectionResultSchema)(
        await ipcRenderer.invoke(
          "workspace-projection:collection-replace",
          Schema.decodeUnknownSync(CollectionProjectionSnapshotSchema)(snapshot),
        ),
      ),
    replaceSpoilers: async (snapshot) =>
      Schema.decodeUnknownSync(SpoilerProjectionResultSchema)(
        await ipcRenderer.invoke(
          "workspace-projection:spoilers-replace",
          Schema.decodeUnknownSync(SpoilerProjectionSnapshotSchema)(snapshot),
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
    exportBackup: async (backup) =>
      Schema.decodeUnknownSync(Schema.Literal("cancelled", "exported"))(
        await ipcRenderer.invoke("workspace:export", validateWorkspaceBackup(backup)),
      ),
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
    onChanged: (callback: (snapshot: AuthSnapshot) => void) =>
      subscribe("auth:changed", (value) =>
        callback(Schema.decodeUnknownSync(AuthSnapshotSchema)(value)),
      ),
    onError: (callback: (message: string) => void) =>
      subscribe("auth:error", (value) => callback(Schema.decodeUnknownSync(Schema.String)(value))),
    read: async () =>
      Schema.decodeUnknownSync(AuthSnapshotSchema)(await ipcRenderer.invoke("auth:read")),
    refresh: async () =>
      Schema.decodeUnknownSync(AuthSnapshotSchema)(await ipcRenderer.invoke("auth:refresh")),
    signIn: async () =>
      Schema.decodeUnknownSync(AuthSnapshotSchema)(await ipcRenderer.invoke("auth:sign-in")),
    signOut: async () =>
      Schema.decodeUnknownSync(AuthSnapshotSchema)(await ipcRenderer.invoke("auth:sign-out")),
  },
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("catalog", desktopApi.catalog);
contextBridge.exposeInMainWorld("prices", desktopApi.prices);
contextBridge.exposeInMainWorld("collection", desktopApi.collection);
contextBridge.exposeInMainWorld("workspaceProjection", desktopApi.workspaceProjection);
contextBridge.exposeInMainWorld("workspace", desktopApi.workspace);
contextBridge.exposeInMainWorld("auth", desktopApi.auth);
