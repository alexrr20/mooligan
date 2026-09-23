import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { Schema } from "effect";
import { UuidSchema, type JsonValue } from "@mooligan/domain/schema";
import { DeckCostRequestSchema } from "@mooligan/workspace/transport";
import { CollectionPrintingValidationRequestSchema } from "@mooligan/domain/collection";
import { assertPrintingCanUseFinish } from "@mooligan/domain/collection";
import {
  CatalogColorPrintingIdsSchema,
  validateCatalogListRequest,
  validateCatalogUpcomingPrintingRequest,
} from "@mooligan/catalog/query";
import { validateCollectionListRequest } from "@mooligan/catalog/collection-query";
import type { CatalogProgress } from "../../shared/desktop-api.ts";
import { settleCatalogRequest } from "../../shared/catalog-request.ts";
import { assertTrustedSender } from "../ipc-security";
import type { CatalogService } from "./service.ts";
import type { CatalogInstaller } from "./installer.ts";

export function registerCatalogIpc(catalog: CatalogService, installer: CatalogInstaller) {
  const catalogRequestControllers = new Map<string, AbortController>();
  ipcMain.handle("catalog:status", (event) => {
    assertTrustedSender(event);
    return installer.status();
  });
  ipcMain.handle("catalog:cancel-query", (event, requestId) => {
    assertTrustedSender(event);
    const key = `${event.sender.id}:${Schema.decodeUnknownSync(UuidSchema)(requestId)}`;
    catalogRequestControllers.get(key)?.abort();
  });
  ipcMain.handle("catalog:list", (event, request, requestId) => {
    assertTrustedSender(event);
    const validRequest = validateCatalogListRequest(request);
    return withCatalogRequest(event, requestId, (signal) =>
      catalog.read((visibility) => catalog.query("list", [validRequest, visibility], signal)),
    );
  });
  ipcMain.handle("catalog:colors", async (event, printingIds) => {
    assertTrustedSender(event);
    const ids = Schema.decodeUnknownSync(CatalogColorPrintingIdsSchema)(printingIds);
    return catalog.read((visibility) => catalog.query("colors", [ids, visibility]));
  });
  ipcMain.handle("catalog:detail", async (event, printingId) => {
    assertTrustedSender(event);
    return catalog.printingDetail(printingId);
  });
  ipcMain.handle("catalog:deck-cost", async (event, value) => {
    assertTrustedSender(event);
    const request = Schema.decodeUnknownSync(DeckCostRequestSchema)(value);
    return catalog.read((visibility) => catalog.query("deck-cost", [request, visibility]));
  });
  ipcMain.handle("catalog:validate-collection-printing", async (event, value) => {
    assertTrustedSender(event);
    const request = Schema.decodeUnknownSync(CollectionPrintingValidationRequestSchema)(value);
    const result = await catalog.printingDetail(request.printingId);
    assertPrintingCanUseFinish(result, request);
  });
  ipcMain.handle("catalog:root-set", async (event, targetId) => {
    assertTrustedSender(event);
    return catalog.rootSetId(targetId);
  });
  ipcMain.handle("collection:list", (event, request, requestId) => {
    assertTrustedSender(event);
    const validRequest = validateCollectionListRequest(request);
    return withCatalogRequest(event, requestId, (signal) =>
      catalog.listCollection(validRequest, signal),
    );
  });
  ipcMain.handle("catalog:upcoming", async (event) => {
    assertTrustedSender(event);
    return catalog.read((visibility) => catalog.query("upcoming", [visibility]));
  });
  ipcMain.handle("catalog:upcoming-printings", async (event, request) => {
    assertTrustedSender(event);
    const validRequest = validateCatalogUpcomingPrintingRequest(request);
    return catalog.read((visibility) =>
      catalog.query("upcoming-printings", [validRequest, visibility]),
    );
  });
  ipcMain.handle("catalog:spoiler-reveals", async (event) => {
    assertTrustedSender(event);
    return catalog.read((visibility) =>
      catalog.query("spoiler-reveals", [
        visibility.revealedPrintingIds,
        visibility.revealedRootSetIds,
      ]),
    );
  });
  ipcMain.handle("catalog:download", (event) => {
    assertTrustedSender(event);
    return installer.download((progress) => sendProgress(event, progress));
  });

  async function withCatalogRequest<Result>(
    event: IpcMainInvokeEvent,
    requestId: JsonValue | undefined,
    read: (signal?: AbortSignal) => Promise<Result>,
  ) {
    if (requestId === undefined) return settleCatalogRequest(() => read());
    const key = `${event.sender.id}:${Schema.decodeUnknownSync(UuidSchema)(requestId)}`;
    if (catalogRequestControllers.has(key)) throw new Error("Duplicate catalog request.");
    const controller = new AbortController();
    catalogRequestControllers.set(key, controller);
    try {
      return await settleCatalogRequest(() => read(controller.signal), controller.signal);
    } finally {
      catalogRequestControllers.delete(key);
    }
  }
}

function sendProgress(event: IpcMainInvokeEvent, progress: CatalogProgress) {
  if (!event.sender.isDestroyed()) {
    event.sender.send("catalog:progress", progress);
  }
}
