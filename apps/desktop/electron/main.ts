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
import { SpoilerPolicySchema, SpoilerTargetIdSchema } from "@mooligan/domain/spoilers";
import * as z from "zod";
import type { JSONType } from "zod";

import { type AuthSnapshot, DesktopAuth, resolveAuthOrigin } from "./auth/service";
import { registerAuthColdStart } from "./auth/startup";
import { createCatalogImageCache } from "./catalog/image-cache";
import {
  resolveCatalogImageCacheDirectory,
  resolveCatalogSetSymbolCacheDirectory,
} from "./catalog/image-cache-directory";
import { registerCatalogImageProtocol } from "./catalog/image-protocol";
import {
  queryCatalogImageSource,
  queryCatalogSetSymbolSource,
  registerCatalogIpc,
  resolveCatalogRootSetId,
} from "./catalog/ipc";
import { createCatalogSetSymbolCache } from "./catalog/set-symbol-cache";
import { registerCatalogSetSymbolProtocol } from "./catalog/set-symbol-protocol";
import { assertTrustedSender, developmentRendererUrl } from "./ipc-security";
import { registerDesktopSchemes } from "./protocols";
import {
  protectSpoilerState,
  protectSpoilerVisibility,
  releaseProtectionTarget,
  SpoilerService,
} from "./spoilers/service";
import {
  PreferenceSyncCoordinator,
  type PreferenceSyncSnapshot,
} from "./workspace/preference-sync";
import { validatePreferencesUpdate } from "./workspace/preferences";
import { parseWorkspaceBackup, type WorkspaceBackup } from "./workspace/backup";
import {
  assertSelectedWorkspace,
  canUseCurrentWorkspace,
  runForSelectedWorkspace,
  runForUnchangedRevision,
  WorkspaceMutationQueue,
} from "./workspace/selection";
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
      const spoilers = new SpoilerService(workspace);
      const spoilerMutations = new WorkspaceMutationQueue(workspace);
      let spoilerWorkspaceReady = false;

      function readSpoilerStateForRenderer(state = spoilers.snapshot()) {
        return spoilerWorkspaceReady ? state : protectSpoilerState(state);
      }

      function readSpoilerVisibility() {
        const visibility = spoilers.visibilitySnapshot();
        return spoilerWorkspaceReady ? visibility : protectSpoilerVisibility(visibility);
      }

      function readPreferencesForRenderer() {
        const preferences = workspace.readPreferences();
        return spoilerWorkspaceReady ? preferences : { ...preferences, spoilerPolicy: "protect" };
      }

      function requireSpoilerWorkspace() {
        if (!spoilerWorkspaceReady) {
          throw new Error("The local account workspace is not ready.");
        }
      }

      function runSpoilerMutation<Result>(operation: () => Result | PromiseLike<Result>) {
        requireSpoilerWorkspace();
        return spoilerMutations.run(() => {
          requireSpoilerWorkspace();
          return operation();
        });
      }

      registerCatalogIpc({
        getVisibilitySnapshot: readSpoilerVisibility,
      });
      const imageCache = createCatalogImageCache({
        cacheDirectory: resolveCatalogImageCacheDirectory(app.getPath("home")),
      });
      const setSymbolCache = createCatalogSetSymbolCache({
        cacheDirectory: resolveCatalogSetSymbolCacheDirectory(app.getPath("home")),
      });
      await Promise.all([
        imageCache.initialize().catch(() => undefined),
        setSymbolCache.initialize().catch(() => undefined),
      ]);
      registerCatalogImageProtocol(session.defaultSession, imageCache, queryCatalogImageSource);
      registerCatalogSetSymbolProtocol(
        session.defaultSession,
        setSymbolCache,
        queryCatalogSetSymbolSource,
      );
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
      const unsubscribeSpoilers = spoilers.subscribe((state) => {
        publish("spoilers:changed", readSpoilerStateForRenderer(state));
      });
      const preferenceSync = new PreferenceSyncCoordinator(auth, workspace, {
        onSpoilersApplied() {
          spoilers.refresh();
        },
        onWorkspaceSelected() {
          spoilerWorkspaceReady = true;
          publish("preferences:changed", readPreferencesForRenderer());
          spoilers.refresh();
        },
      });

      let lastAuthError: string | null = null;

      async function applyAuthSnapshot(snapshot: AuthSnapshot) {
        lastAuthError = null;
        spoilerWorkspaceReady = false;
        publish("preferences:changed", readPreferencesForRenderer());
        publish("spoilers:changed", readSpoilerStateForRenderer());
        publish("auth:changed", snapshot);
        let syncSnapshot: PreferenceSyncSnapshot;

        if (snapshot.status === "signed-in" && snapshot.user) {
          syncSnapshot = await preferenceSync.connect(snapshot.user.id);
        } else if (snapshot.status === "sync-paused") {
          syncSnapshot = await preferenceSync.pause(snapshot.user?.id ?? null);
        } else {
          syncSnapshot = await preferenceSync.disconnect();
        }

        if (canUseCurrentWorkspace(snapshot)) {
          spoilerWorkspaceReady = true;
        }

        spoilers.refresh();
        publish("preferences:changed", readPreferencesForRenderer());

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

      function queueWorkspaceSync() {
        const operation = preferenceSync.workspaceChanged();
        publish("sync:changed", preferenceSync.snapshot());
        void operation
          .then((snapshot) => {
            publish("preferences:changed", readPreferencesForRenderer());
            spoilers.refresh();
            publish("auth:changed", auth.snapshot());
            publish("sync:changed", snapshot);
          })
          .catch(() => {
            process.stderr.write("Workspace synchronization failed.\n");
          });
      }

      await applyAuthSnapshot(await auth.restore());

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
        publish("preferences:changed", readPreferencesForRenderer());
        spoilers.refresh();
        publish("auth:changed", auth.snapshot());
        publish("sync:changed", snapshot);
        return snapshot;
      });

      ipcMain.handle("preferences:read", (event) => {
        assertTrustedSender(event);
        return readPreferencesForRenderer();
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
          const publicPreferences = readPreferencesForRenderer();
          publish("preferences:changed", publicPreferences);
          queueWorkspaceSync();
          return publicPreferences;
        };

        return validated.spoilerPolicy === undefined
          ? applyUpdate()
          : runSpoilerMutation(applyUpdate);
      });

      ipcMain.handle("spoilers:read", (event) => {
        assertTrustedSender(event);
        return readSpoilerStateForRenderer();
      });
      ipcMain.handle("spoilers:set-policy", (event, value) => {
        assertTrustedSender(event);
        const policy = SpoilerPolicySchema.parse(value);
        return runSpoilerMutation(() => {
          const state = spoilers.setPolicy(policy);
          publish("preferences:changed", readPreferencesForRenderer());
          queueWorkspaceSync();
          return state;
        });
      });
      ipcMain.handle("spoilers:reveal-printing", (event, value) => {
        assertTrustedSender(event);
        const printingId = validateSpoilerTarget(value);
        return runSpoilerMutation(async () => {
          const rootSetId = await runForSelectedWorkspace(workspace, () =>
            runForUnchangedRevision(
              () => workspace.readSpoilerState().revision,
              () => resolveCatalogRootSetId(printingId),
            ),
          );

          if (!rootSetId) {
            throw new Error("This printing is not present in the installed catalog.");
          }

          const state = spoilers.revealPrinting(printingId);
          queueWorkspaceSync();
          return state;
        });
      });
      ipcMain.handle("spoilers:protect-printing", (event, value) => {
        assertTrustedSender(event);
        const printingId = validateSpoilerTarget(value);
        return runSpoilerMutation(async () => {
          const rootSetId = await runForSelectedWorkspace(workspace, () =>
            resolveOptionalCatalogRootSetId(printingId),
          );
          const current = workspace.readSpoilerState();
          const active = current.activePrintingIds.includes(printingId);

          if (current.policy === "show") {
            throw new Error('Turn off "Always show previews" before protecting one printing.');
          }

          if (!active && !rootSetId) {
            throw new Error("This printing is not present in the installed catalog.");
          }
          if (rootSetId && current.activeRootSetIds.includes(rootSetId)) {
            throw new Error("Protect this release before protecting one printing from it.");
          }

          const state = spoilers.protectPrinting(printingId);
          queueWorkspaceSync();
          return state;
        });
      });
      ipcMain.handle("spoilers:reveal-release", (event, value) => {
        assertTrustedSender(event);
        const targetId = validateSpoilerTarget(value);
        return runSpoilerMutation(async () => {
          const rootSetId = await runForSelectedWorkspace(workspace, () =>
            runForUnchangedRevision(
              () => workspace.readSpoilerState().revision,
              () => requireCatalogRootSetId(targetId),
            ),
          );
          const state = spoilers.revealRelease(rootSetId);
          queueWorkspaceSync();
          return state;
        });
      });
      ipcMain.handle("spoilers:protect-release", (event, value) => {
        assertTrustedSender(event);
        const targetId = validateSpoilerTarget(value);
        return runSpoilerMutation(async () => {
          const rootSetId = await runForSelectedWorkspace(workspace, () =>
            resolveOptionalCatalogRootSetId(targetId),
          );
          const current = workspace.readSpoilerState();

          if (current.policy === "show") {
            throw new Error('Turn off "Always show previews" before protecting one release.');
          }

          const protectionTarget = releaseProtectionTarget(current, targetId, rootSetId);
          if (!protectionTarget) {
            throw new Error("This release is not present in the installed catalog.");
          }

          const state = spoilers.protectRelease(protectionTarget);
          queueWorkspaceSync();
          return state;
        });
      });
      ipcMain.handle("spoilers:protect-all", (event) => {
        assertTrustedSender(event);
        return runSpoilerMutation(() => {
          const state = spoilers.protectAll();
          publish("preferences:changed", readPreferencesForRenderer());
          queueWorkspaceSync();
          return state;
        });
      });

      ipcMain.handle("workspace:export", async (event) => {
        assertTrustedSender(event);
        requireSpoilerWorkspace();
        const workspaceId = workspace.workspaceId;
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

        assertSelectedWorkspace(workspace, workspaceId);
        const backup = workspace.createBackup();
        try {
          await writeFile(result.filePath, backup, "utf8");
          return "exported" as const;
        } catch {
          throw new Error("The workspace backup could not be exported.");
        }
      });

      ipcMain.handle("workspace:import", async (event) => {
        assertTrustedSender(event);
        requireSpoilerWorkspace();
        const workspaceId = workspace.workspaceId;
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

        return spoilerMutations.runFor(workspaceId, () => {
          requireSpoilerWorkspace();
          workspace.importBackup(backup);
          publish("preferences:changed", readPreferencesForRenderer());
          spoilers.refresh();
          queueWorkspaceSync();
          return "imported" as const;
        });
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

      app.once("will-quit", () => {
        unsubscribeSpoilers();
        spoilers.close();
        workspace.close();
      });

      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });

      await createWindow();
      publish("auth:changed", auth.snapshot());
      publish("preferences:changed", readPreferencesForRenderer());
      publish("spoilers:changed", readSpoilerStateForRenderer());
      publish("sync:changed", preferenceSync.snapshot());
      if (lastAuthError) {
        publish("auth:error", lastAuthError);
      }

      void auth
        .refresh()
        .then(applyAuthSnapshot)
        .catch(async (cause: unknown) => {
          const authError = publicAuthError(cause);
          await applyAuthSnapshot(auth.snapshot()).catch(() => {
            spoilerWorkspaceReady = false;
            publish("preferences:changed", readPreferencesForRenderer());
            publish("spoilers:changed", readSpoilerStateForRenderer());
            publish("auth:changed", auth.snapshot());
          });
          lastAuthError = authError;
          publish("auth:error", lastAuthError);
        });

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

function validateSpoilerTarget(value: JSONType) {
  return SpoilerTargetIdSchema.parse(value);
}

async function requireCatalogRootSetId(targetId: string) {
  const rootSetId = await resolveCatalogRootSetId(targetId);

  if (!rootSetId) {
    throw new Error("This release is not present in the installed catalog.");
  }

  return rootSetId;
}

async function resolveOptionalCatalogRootSetId(targetId: string) {
  try {
    return await resolveCatalogRootSetId(targetId);
  } catch {
    return null;
  }
}
