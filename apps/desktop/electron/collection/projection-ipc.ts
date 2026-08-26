import {
  CollectionProjectionDeltaSchema,
  CollectionProjectionSnapshotSchema,
} from "@mooligan/domain/collection";
import { ipcMain } from "electron";
import * as z from "zod";

import { assertTrustedSender } from "../ipc-security";
import type { CollectionProjection } from "./projection";

export function registerCollectionProjectionIpc(projection: CollectionProjection) {
  ipcMain.handle("workspace-projection:collection-connect", (event, value) => {
    assertTrustedSender(event);
    return projection.connect(event.sender.id, z.uuid().parse(value));
  });
  ipcMain.handle("workspace-projection:collection-replace", async (event, value) => {
    assertTrustedSender(event);
    try {
      return await projection.replace(
        event.sender.id,
        CollectionProjectionSnapshotSchema.parse(value),
      );
    } catch (error) {
      projection.rejectInvalidUpdate(event.sender.id);
      throw error;
    }
  });
  ipcMain.handle("workspace-projection:collection-apply", async (event, value) => {
    assertTrustedSender(event);
    try {
      return await projection.apply(event.sender.id, CollectionProjectionDeltaSchema.parse(value));
    } catch (error) {
      projection.rejectInvalidUpdate(event.sender.id);
      throw error;
    }
  });
}
