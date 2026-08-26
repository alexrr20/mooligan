import {
  SpoilerProjectionDeltaSchema,
  SpoilerProjectionSnapshotSchema,
} from "@mooligan/domain/spoilers";
import { ipcMain } from "electron";
import * as z from "zod";

import { assertTrustedSender } from "../ipc-security";
import type { SpoilerProjection } from "./projection";

export function registerSpoilerProjectionIpc(projection: SpoilerProjection) {
  ipcMain.handle("workspace-projection:spoilers-connect", (event, value) => {
    assertTrustedSender(event);
    return projection.connect(event.sender.id, z.uuidv4().parse(value));
  });
  ipcMain.handle("workspace-projection:spoilers-replace", (event, value) => {
    assertTrustedSender(event);
    try {
      return projection.replace(event.sender.id, SpoilerProjectionSnapshotSchema.parse(value));
    } catch (error) {
      projection.rejectInvalidUpdate(event.sender.id);
      throw error;
    }
  });
  ipcMain.handle("workspace-projection:spoilers-apply", (event, value) => {
    assertTrustedSender(event);
    try {
      return projection.apply(event.sender.id, SpoilerProjectionDeltaSchema.parse(value));
    } catch (error) {
      projection.rejectInvalidUpdate(event.sender.id);
      throw error;
    }
  });
}
