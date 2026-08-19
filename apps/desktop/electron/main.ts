import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  session,
  shell,
  type OpenDialogOptions,
} from "electron";
import * as z from "zod";

import { type AuthSnapshot, DesktopAuth, resolveAuthOrigin } from "./auth/service";
import { registerAuthColdStart } from "./auth/startup";
import { createCatalogImageCache } from "./catalog/image-cache";
import { resolveCatalogImageCacheDirectory } from "./catalog/image-cache-directory";
import { registerCatalogImageProtocol } from "./catalog/image-protocol";
import { queryCatalogImageSource, registerCatalogIpc } from "./catalog/ipc";
import { assertTrustedSender, developmentRendererUrl } from "./ipc-security";
import { registerDesktopSchemes } from "./protocols";
import {
  PreferenceSyncCoordinator,
  type PreferenceSyncSnapshot,
} from "./workspace/preference-sync";
import { validatePreferencesUpdate } from "./workspace/preferences";
import { parseWorkspaceBackup } from "./workspace/backup";
import { WorkspaceManager } from "./workspace/store";

app.enableSandbox();
registerDesktopSchemes(protocol);
const authStartup = registerAuthColdStart({
  onOpenUrl(listener) {
    app.on("open-url", listener);
  },
  onSecondInstance(listener) {
    app.on("second-instance", (event, commandLine, workingDirectory, additionalData) => {
      const data = z.json().safeParse(additionalData);
      listener(event, commandLine, workingDirectory, data.success ? data.data : null);
    });
  },
  requestSingleInstanceLock: (additionalData) => app.requestSingleInstanceLock(additionalData),
  setAsDefaultProtocolClient: (scheme, path, args) =>
    app.setAsDefaultProtocolClient(scheme, path, args),
});
registerCatalogIpc();

const MAX_WORKSPACE_BACKUP_BYTES = 50 * 1024 * 1024;

async function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 840,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "Mooligan",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 19 },
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: fileURLToPath(new URL(/* @vite-ignore */ "./preload.mjs", import.meta.url)),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => {
    event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => window.show());

  const developmentUrl = developmentRendererUrl();
  if (developmentUrl) {
    await window.loadURL(developmentUrl.href);
  } else {
    await window.loadFile(join(app.getAppPath(), "dist/index.html"));
  }
}

if (!authStartup.isPrimary) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(async () => {
      const workspace = new WorkspaceManager(app.getPath("userData"));
      const imageCache = createCatalogImageCache({
        cacheDirectory: resolveCatalogImageCacheDirectory(app.getPath("home")),
      });
      await imageCache.initialize().catch(() => undefined);
      registerCatalogImageProtocol(session.defaultSession, imageCache, queryCatalogImageSource);
      const authOrigin = resolveAuthOrigin();

      const auth = new DesktopAuth({
        filePath: join(
          app.getPath("userData"),
          `auth-state-${createHash("sha256").update(authOrigin).digest("hex")}`,
        ),
        openExternal: (url) => shell.openExternal(url),
        origin: authOrigin,
        safeStorage,
      });
      const preferenceSync = new PreferenceSyncCoordinator(auth, workspace);

      let lastAuthError: string | null = null;

      async function applyAuthSnapshot(snapshot: AuthSnapshot) {
        lastAuthError = null;
        publish("auth:changed", snapshot);
        const previousPreferences = workspace.readPreferences();
        const previousWorkspaceId = workspace.workspaceId;
        let syncSnapshot: PreferenceSyncSnapshot;

        if (snapshot.status === "signed-in" && snapshot.user) {
          syncSnapshot = await preferenceSync.connect(snapshot.user.id);
        } else if (snapshot.status === "sync-paused") {
          syncSnapshot = preferenceSync.pause();
        } else {
          syncSnapshot = await preferenceSync.disconnect();
        }

        const currentPreferences = workspace.readPreferences();
        if (
          workspace.workspaceId !== previousWorkspaceId ||
          currentPreferences.motion !== previousPreferences.motion
        ) {
          publish("preferences:changed", currentPreferences);
        }

        const currentAuth = auth.snapshot();
        publish("auth:changed", currentAuth);
        publish("sync:changed", syncSnapshot);
        return currentAuth;
      }

      async function runAuth(operation: () => Promise<AuthSnapshot>) {
        try {
          return await applyAuthSnapshot(await operation());
        } catch (error) {
          await applyAuthSnapshot(auth.snapshot());
          throw new Error(publicAuthError(error));
        }
      }

      function queuePreferenceSync() {
        const operation = preferenceSync.preferenceChanged();
        publish("sync:changed", preferenceSync.snapshot());
        void operation
          .then((snapshot) => {
            publish("auth:changed", auth.snapshot());
            publish("sync:changed", snapshot);
          })
          .catch(() => {
            process.stderr.write("Preference synchronization failed.\n");
          });
      }

      void auth
        .initialize()
        .then(applyAuthSnapshot)
        .catch((cause: unknown) => {
          lastAuthError = publicAuthError(cause);
          publish("auth:error", lastAuthError);
        });

      ipcMain.handle("auth:read", (event) => {
        assertTrustedSender(event);
        return auth.snapshot();
      });
      ipcMain.handle("auth:sign-in", (event) => {
        assertTrustedSender(event);
        return runAuth(() => auth.beginSignIn());
      });
      ipcMain.handle("auth:refresh", (event) => {
        assertTrustedSender(event);
        return runAuth(() => auth.refresh());
      });
      ipcMain.handle("auth:sign-out", (event) => {
        assertTrustedSender(event);
        return runAuth(() => auth.signOut());
      });
      ipcMain.handle("sync:read", (event) => {
        assertTrustedSender(event);
        return preferenceSync.snapshot();
      });
      ipcMain.handle("sync:retry", async (event) => {
        assertTrustedSender(event);
        const snapshot = await preferenceSync.sync();
        publish("preferences:changed", workspace.readPreferences());
        publish("auth:changed", auth.snapshot());
        publish("sync:changed", snapshot);
        return snapshot;
      });

      ipcMain.handle("preferences:read", (event) => {
        assertTrustedSender(event);
        return workspace.readPreferences();
      });
      ipcMain.handle("preferences:update", (event, update) => {
        assertTrustedSender(event);
        const preferences = workspace.updatePreferences(validatePreferencesUpdate(update));
        publish("preferences:changed", preferences);
        queuePreferenceSync();
        return preferences;
      });

      ipcMain.handle("workspace:export", async (event) => {
        assertTrustedSender(event);
        const owner = BrowserWindow.fromWebContents(event.sender);
        const options = {
          defaultPath: join(
            app.getPath("documents"),
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

        let backup: string;
        try {
          const info = await stat(result.filePaths[0]);
          if (!info.isFile() || info.size > MAX_WORKSPACE_BACKUP_BYTES) {
            throw new Error("invalid backup");
          }
          backup = await readFile(result.filePaths[0], "utf8");
          parseWorkspaceBackup(backup);
        } catch {
          throw new Error("The selected file is not a valid Mooligan workspace backup.");
        }

        const confirmationOptions = {
          buttons: ["Cancel", "Replace local workspace"],
          cancelId: 0,
          defaultId: 0,
          detail:
            "Preferences, collection lots, decks, and lists in this workspace will be replaced. Your local workspace and account binding will stay the same.",
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

        workspace.importBackup(backup);
        publish("preferences:changed", workspace.readPreferences());
        queuePreferenceSync();
        return "imported" as const;
      });

      void authStartup.start(
        async (url) => {
          await runAuth(() => auth.handleCallback(url));
          focusWindow();
        },
        (error) => {
          lastAuthError = publicAuthError(error);
          publish("auth:error", lastAuthError);
        },
      );

      app.once("will-quit", () => workspace.close());

      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });

      await createWindow();
      publish("auth:changed", auth.snapshot());
      publish("sync:changed", preferenceSync.snapshot());
      if (lastAuthError) {
        publish("auth:error", lastAuthError);
      }

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow();
        }
      });
      app.on("second-instance", focusWindow);
    })
    .catch((cause: unknown) => {
      process.stderr.write(`Failed to create desktop window: ${String(cause)}\n`);
      app.quit();
    });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function publish<Value>(channel: string, value: Value) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, value);
    }
  }
}

function focusWindow() {
  const window = BrowserWindow.getAllWindows()[0];

  if (!window) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

function publicAuthError(cause: unknown) {
  if (
    cause instanceof Error &&
    ["AuthInputError", "AuthRequestError", "ProtectedStorageError"].includes(cause.name)
  ) {
    return cause.message;
  }

  return "Account sign-in could not be completed. Return to Settings and try again.";
}
