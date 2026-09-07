import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import * as z from "zod";

import { validateWorkspaceBootstrap } from "../../shared/desktop-api.ts";
import { assertTrustedSender } from "../ipc-security";
import {
  parseWorkspaceBackup,
  readUtf8FileWithinLimit,
  serializeWorkspaceBackup,
  validateWorkspaceBackup,
} from "./backup";
import type { AccountWorkspace } from "@mooligan/account/workspace";
import type { WorkspaceRegistry } from "./registry";

export function registerWorkspaceIpc(
  registry: WorkspaceRegistry,
  accountWorkspace: AccountWorkspace,
  documentsPath: string,
) {
  ipcMain.handle("workspace:bootstrap", (event) => {
    assertTrustedSender(event);
    return validateWorkspaceBootstrap(registry.bootstrap());
  });
  ipcMain.handle("workspace:export", async (event, value) => {
    assertTrustedSender(event);
    const backup = validateWorkspaceBackup(value);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      defaultPath: join(
        documentsPath,
        `mooligan-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      ),
      filters: [{ extensions: ["json"], name: "Mooligan workspace" }],
      title: "Export Mooligan workspace",
    };
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return "cancelled" as const;
    }

    try {
      await atomicWrite(result.filePath, serializeWorkspaceBackup(backup));
      return "exported" as const;
    } catch {
      throw new Error("The workspace backup could not be exported.");
    }
  });
  ipcMain.handle("workspace:select-backup", async (event) => {
    assertTrustedSender(event);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      filters: [{ extensions: ["json"], name: "Mooligan workspace" }],
      properties: ["openFile"],
      title: "Import Mooligan workspace",
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    let backup;
    try {
      backup = parseWorkspaceBackup(await readUtf8FileWithinLimit(result.filePaths[0]));
    } catch {
      throw new Error("The selected file is not a valid Mooligan workspace backup.");
    }

    const confirmationOptions = {
      buttons: ["Cancel", "Restore as new workspace"],
      cancelId: 0,
      defaultId: 0,
      detail:
        "Mooligan will keep this workspace and restore the backup into a separate local workspace.",
      message: "Import this backup?",
      noLink: true,
      type: "warning" as const,
    };
    const confirmation = owner
      ? await dialog.showMessageBox(owner, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions);

    return confirmation.response === 1 ? backup : null;
  });
  ipcMain.handle("workspace:begin-restore", (event) => {
    assertTrustedSender(event);
    return registry.beginRestore();
  });
  ipcMain.handle("workspace:activate-restore", async (event, value) => {
    assertTrustedSender(event);
    registry.activateRestore(z.uuid().parse(value));
    await accountWorkspace.workspaceActivated();
  });
  ipcMain.handle("workspace:cancel-restore", (event, value) => {
    assertTrustedSender(event);
    registry.cancelRestore(z.uuid().parse(value));
  });
  ipcMain.handle("workspace:runtime", (event) => {
    assertTrustedSender(event);
    return accountWorkspace.runtime();
  });
  ipcMain.handle("workspace:refresh-sync", (event) => {
    assertTrustedSender(event);
    return accountWorkspace.refreshSync();
  });
  ipcMain.handle("workspace:select", async (event, value) => {
    assertTrustedSender(event);
    await accountWorkspace.selectWorkspace(z.uuid().parse(value));
  });
}

async function atomicWrite(path: string, contents: string) {
  const partial = `${path}.tmp-${randomUUID()}`;
  try {
    await writeFile(partial, contents, "utf8");
    await rename(partial, path);
  } finally {
    await rm(partial, { force: true });
  }
}
