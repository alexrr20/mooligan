import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, protocol, safeStorage, session, shell } from "electron";
import * as z from "zod";

import { registerAuthIpc } from "./auth/ipc";
import { DesktopAuth, resolveAuthOrigin } from "./auth/service";
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
} from "./catalog/ipc";
import { createCatalogSetSymbolCache } from "./catalog/set-symbol-cache";
import { registerCatalogSetSymbolProtocol } from "./catalog/set-symbol-protocol";
import { registerCollectionIpc } from "./collection/ipc";
import { developmentRendererUrl } from "./ipc-security";
import { registerDesktopSchemes } from "./protocols";
import { registerSpoilerProjectionIpc } from "./spoilers/projection-ipc";
import { SpoilerProjection } from "./spoilers/projection";
import { focusFirstWindow, publishRendererEvent } from "./windows";
import { registerWorkspaceIpc } from "./workspace/ipc";
import { MutationQueue } from "./workspace/mutations";
import { WorkspaceRegistry } from "./workspace/registry";
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

async function createWindow(spoilerProjection: SpoilerProjection) {
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
  window.webContents.on("did-start-loading", () => {
    spoilerProjection.rendererReplaced(window.webContents.id);
  });
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
      const workspaceRegistry = new WorkspaceRegistry(app.getPath("userData"));
      const workspace = new WorkspaceManager(workspaceRegistry);
      const spoilers = new SpoilerProjection(() => workspace.workspaceId, {
        onChanged: () => publishRendererEvent("workspace-projection:spoilers-changed", undefined),
      });
      const workspaceMutations = new MutationQueue();

      registerCatalogIpc({
        getVisibilitySnapshot: () => spoilers.visibilitySnapshot(),
        getWorkspacePath: () => workspace.databasePath,
      });
      registerCollectionIpc(
        workspace,
        workspaceMutations,
        () => spoilers.visibilitySnapshot().revision,
      );
      registerSpoilerProjectionIpc(spoilers);
      const publishPreferences = registerWorkspaceIpc(
        workspaceRegistry,
        workspace,
        workspaceMutations,
        app.getPath("documents"),
      );

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
      const publishAuthStateAndRefresh = await registerAuthIpc(auth, authStartup);

      app.once("will-quit", () => {
        spoilers.close();
        workspace.close();
        workspaceRegistry.close();
      });

      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });

      await createWindow(spoilers);
      publishAuthStateAndRefresh();
      publishPreferences();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow(spoilers);
        }
      });
      app.on("second-instance", focusFirstWindow);
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
