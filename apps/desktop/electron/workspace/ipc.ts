import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";

import { validateWorkspaceBootstrap } from "../../shared/desktop-api.ts";
import { assertTrustedSender } from "../ipc-security";
import type { SpoilerService } from "../spoilers/service";
import { publishRendererEvent } from "../windows";
import { parseWorkspaceBackup, type WorkspaceBackup } from "./backup";
import type { MutationQueue } from "./mutations";
import { validatePreferencesUpdate } from "./preferences";
import type { WorkspaceRegistry } from "./registry";
import type { WorkspaceManager } from "./store";

const MAX_WORKSPACE_BACKUP_BYTES = 50 * 1024 * 1024;

export function registerWorkspaceIpc(
  registry: WorkspaceRegistry,
  workspace: WorkspaceManager,
  spoilers: SpoilerService,
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
    const validated = validatePreferencesUpdate(update);
    const applyUpdate = () => {
      if (validated.spoilerPolicy !== undefined) {
        spoilers.setPolicy(validated.spoilerPolicy);
      }
      workspace.updatePreferences(
        validated.motion === undefined ? {} : { motion: validated.motion },
      );
      const preferences = workspace.readPreferences();
      publishRendererEvent("preferences:changed", preferences);
      return preferences;
    };

    return validated.spoilerPolicy === undefined ? applyUpdate() : mutations.run(applyUpdate);
  });

  ipcMain.handle("workspace:export", async (event) => {
    assertTrustedSender(event);
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
      await writeFile(result.filePath, workspace.createBackup(), "utf8");
      return "exported" as const;
    } catch {
      throw new Error("The workspace backup could not be exported.");
    }
  });

  ipcMain.handle("workspace:import", async (event) => {
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
      return "cancelled" as const;
    }

    let backup: WorkspaceBackup;
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
      buttons: ["Cancel", "Replace local workspace"],
      cancelId: 0,
      defaultId: 0,
      detail:
        "Preferences, spoiler choices, collection lots, decks, and lists in this workspace will be replaced. Your local workspace and account binding will stay the same.",
      message: "Import this backup?",
      noLink: true,
      type: "warning" as const,
    };
    const confirmation = owner
      ? await dialog.showMessageBox(owner, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions);

    if (confirmation.response !== 1) {
      return "cancelled" as const;
    }

    return mutations.run(() => {
      workspace.importBackup(backup);
      publishRendererEvent("collection:changed", undefined);
      publishRendererEvent("preferences:changed", workspace.readPreferences());
      spoilers.refresh();
      return "imported" as const;
    });
  });

  return () => publishRendererEvent("preferences:changed", workspace.readPreferences());
}
