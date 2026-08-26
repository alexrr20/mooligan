import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import * as z from "zod";

import { validateWorkspaceBootstrap } from "../../shared/desktop-api.ts";
import { assertTrustedSender } from "../ipc-security";
import { publishRendererEvent } from "../windows";
import {
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  validateWorkspaceBackup,
  validateWorkspaceLegacyBackupSnapshot,
} from "./backup";
import type { MutationQueue } from "./mutations";
import { validatePreferencesUpdate } from "./preferences";
import type { WorkspaceRegistry } from "./registry";
import type { WorkspaceManager } from "./store";

const MAX_WORKSPACE_BACKUP_BYTES = 50 * 1024 * 1024;

export function registerWorkspaceIpc(
  registry: WorkspaceRegistry,
  workspace: WorkspaceManager,
  mutations: MutationQueue,
  documentsPath: string,
) {
  ipcMain.handle("workspace:bootstrap", (event) => {
    assertTrustedSender(event);
    return validateWorkspaceBootstrap(registry.bootstrap());
  });
  ipcMain.handle("preferences:read", (event) => {
    assertTrustedSender(event);
    return workspace.readPreferences();
  });
  ipcMain.handle("preferences:update", (event, update) => {
    assertTrustedSender(event);
    const preferences = workspace.updatePreferences(validatePreferencesUpdate(update));
    publishRendererEvent("preferences:changed", preferences);
    return preferences;
  });
  ipcMain.handle("workspace:backup-snapshot", (event) => {
    assertTrustedSender(event);
    return workspace.createLegacyBackupSnapshot();
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
      const info = await stat(result.filePaths[0]);
      if (!info.isFile() || info.size > MAX_WORKSPACE_BACKUP_BYTES) {
        throw new Error("invalid backup");
      }
      backup = parseWorkspaceBackup(await readFile(result.filePaths[0], "utf8"));
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
  ipcMain.handle("workspace:begin-restore", (event, value) => {
    assertTrustedSender(event);
    const backup = validateWorkspaceLegacyBackupSnapshot(value);
    return mutations.run(() => workspace.beginRestore(backup));
  });
  ipcMain.handle("workspace:activate-restore", (event, value) => {
    assertTrustedSender(event);
    const workspaceId = z.uuidv4().parse(value);
    return mutations.run(() => workspace.activateRestore(workspaceId));
  });
  ipcMain.handle("workspace:cancel-restore", (event, value) => {
    assertTrustedSender(event);
    const workspaceId = z.uuidv4().parse(value);
    return mutations.run(() => workspace.cancelRestore(workspaceId));
  });

  return () => publishRendererEvent("preferences:changed", workspace.readPreferences());
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
