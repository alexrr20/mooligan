import { UuidSchema } from "@mooligan/domain/schema";
import {
  CollectionProjectionDeltaSchema,
  CollectionProjectionSnapshotSchema,
} from "@mooligan/workspace/transport";
import { ipcMain } from "electron";
import { Schema } from "effect";

import { assertTrustedSender } from "../ipc-security";
import type { CollectionProjection } from "./projection";

export function registerCollectionProjectionIpc(projection: CollectionProjection) {
  ipcMain.handle("workspace-projection:collection-connect", (event, value) => {
    assertTrustedSender(event);
    return projection.connect(event.sender.id, Schema.decodeUnknownSync(UuidSchema)(value));
  });
  ipcMain.handle("workspace-projection:collection-replace", async (event, value) => {
    assertTrustedSender(event);
    try {
      return await projection.replace(
        event.sender.id,
        Schema.decodeUnknownSync(CollectionProjectionSnapshotSchema)(value),
      );
    } catch (error) {
      projection.rejectInvalidUpdate(event.sender.id);
      throw error;
    }
  });
  ipcMain.handle("workspace-projection:collection-apply", async (event, value) => {
    assertTrustedSender(event);
    try {
      return await projection.apply(
        event.sender.id,
        Schema.decodeUnknownSync(CollectionProjectionDeltaSchema)(value),
      );
    } catch (error) {
      projection.rejectInvalidUpdate(event.sender.id);
      throw error;
    }
  });
}
