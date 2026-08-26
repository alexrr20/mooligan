import {
  AddCollectionHoldingRequestSchema,
  RemoveCollectionHoldingRequestSchema,
  UpdateCollectionHoldingRequestSchema,
  type AddCollectionHoldingRequest,
} from "@mooligan/domain/collection";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import { ipcMain } from "electron";

import { queryCatalogPrintingDetail } from "../catalog/ipc";
import { assertTrustedSender } from "../ipc-security";
import { publishRendererEvent } from "../windows";
import { runForUnchangedRevision, type MutationQueue } from "../workspace/mutations";
import type { WorkspaceManager } from "../workspace/store";

export function registerCollectionIpc(
  workspace: WorkspaceManager,
  mutations: MutationQueue,
  readSpoilerRevision: () => number,
) {
  ipcMain.handle("collection:add", (event, value) => {
    assertTrustedSender(event);
    const request = AddCollectionHoldingRequestSchema.parse(value);

    return mutations.run(async () => {
      const detail = await readPrintingForMutation(readSpoilerRevision, request.printingId);
      assertPrintingCanUseFinish(detail, request);
      const result = workspace.addCollectionHolding(request);
      publishRendererEvent("collection:changed", undefined);
      return result;
    });
  });

  ipcMain.handle("collection:update", (event, value) => {
    assertTrustedSender(event);
    const request = UpdateCollectionHoldingRequestSchema.parse(value);

    return mutations.run(async () => {
      const lot = workspace.readCollectionLot(request.lotId);

      if (!lot) {
        throw new Error("This Collection holding no longer exists.");
      }

      const detail = await readPrintingForMutation(readSpoilerRevision, lot.printingId);

      if (detail === null) {
        if (request.finish !== lot.finish) {
          throw new Error("The finish cannot change while this printing is unavailable.");
        }
      } else {
        assertPrintingCanUseFinish(detail, { ...request, printingId: lot.printingId });
      }

      const result = workspace.updateCollectionHolding(request);
      publishRendererEvent("collection:changed", undefined);
      return result;
    });
  });

  ipcMain.handle("collection:remove", (event, value) => {
    assertTrustedSender(event);
    const request = RemoveCollectionHoldingRequestSchema.parse(value);

    return mutations.run(() => {
      workspace.removeCollectionHolding(request.lotId);
      publishRendererEvent("collection:changed", undefined);
    });
  });
}

function readPrintingForMutation(readSpoilerRevision: () => number, printingId: string) {
  return runForUnchangedRevision(readSpoilerRevision, () => queryCatalogPrintingDetail(printingId));
}

function assertPrintingCanUseFinish(
  result: CatalogPrintingResult | null,
  request: Pick<AddCollectionHoldingRequest, "finish" | "printingId">,
) {
  if (!result) {
    throw new Error("This printing is not present in the installed catalog.");
  }
  if (result.status === "protected") {
    throw new Error("Reveal this printing before adding it to the Collection.");
  }
  if (result.detail.selectedPrinting.isDigital) {
    throw new Error("Digital printings cannot be added to the Collection.");
  }
  if (!result.detail.selectedPrinting.finishes?.includes(request.finish)) {
    throw new Error("This finish is not available for the selected printing.");
  }
}
