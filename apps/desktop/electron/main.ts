import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, protocol, safeStorage, session, shell } from "electron";
import { JsonValueSchema } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";

import { registerAuthIpc } from "./auth/ipc";
import { DesktopAuth, resolveAuthOrigin } from "./auth/service";
import { registerAuthColdStart } from "./auth/startup";
import { createCatalogImageCache } from "./catalog/image-cache";
import {
  resolveCatalogImageCacheDirectory,
  resolveCatalogSetSymbolCacheDirectory,
} from "./catalog/image-cache-directory";
import { registerCatalogImageProtocol } from "./catalog/image-protocol";
import { registerCatalogIpc } from "./catalog/ipc";
import { createCatalogService } from "./catalog/service";
import { createCatalogInstaller } from "./catalog/installer";
import { createCatalogSetSymbolCache } from "./catalog/set-symbol-cache";
import { registerCatalogSetSymbolProtocol } from "./catalog/set-symbol-protocol";
import { registerCollectionProjectionIpc } from "./collection/projection-ipc";
import { CollectionProjection } from "./collection/projection";
import { developmentRendererUrl } from "./ipc-security";
import { registerDesktopSchemes } from "./protocols";
import { registerSpoilerProjectionIpc } from "./spoilers/projection-ipc";
import { SpoilerProjection } from "./spoilers/projection";
import { focusFirstWindow, publishRendererEvent } from "./windows";
import { AccountWorkspace } from "@mooligan/account/workspace";
import { registerWorkspaceIpc } from "./workspace/ipc";
import { WorkspaceRegistry } from "./workspace/registry";
import { PriceService } from "./prices/service";
import { registerPriceIpc } from "./prices/ipc";

app.enableSandbox();
registerDesktopSchemes(protocol);

// Do not keep a development window alive after its Vite launcher exits.
if (developmentRendererUrl() && process.connected) {
  process.once("disconnect", () => app.quit());
}

const authStartup = registerAuthColdStart({
  onOpenUrl(listener) {
    app.on("open-url", listener);
  },
  onSecondInstance(listener) {
    app.on("second-instance", (event, commandLine, workingDirectory, additionalData) => {
      const data = Schema.decodeUnknownOption(JsonValueSchema)(additionalData);
      listener(event, commandLine, workingDirectory, Option.getOrNull(data));
    });
  },
  requestSingleInstanceLock: (additionalData) => app.requestSingleInstanceLock(additionalData),
  setAsDefaultProtocolClient: (scheme, path, args) =>
    app.setAsDefaultProtocolClient(scheme, path, args),
});

async function createWindow(
  collectionProjection: CollectionProjection,
  spoilerProjection: SpoilerProjection,
) {
  const window = new BrowserWindow({
    width: 1480,
    height: 840,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "Mooligan",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 21 },
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
  window.webContents.on("did-start-navigation", (event) => {
    if (!event.isMainFrame || event.isSameDocument) return;
    collectionProjection.rendererReplaced(window.webContents.id);
    spoilerProjection.rendererReplaced(window.webContents.id);
  });
  window.once("ready-to-show", () => window.show());

  const developmentUrl = developmentRendererUrl();
  if (developmentUrl) {
    await window.loadURL(developmentUrl.href);
    await window.webContents.setVisualZoomLevelLimits(1, 3);
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
      const pricePath = join(app.getPath("userData"), "prices.sqlite");
      const prices = new PriceService(pricePath, () =>
        publishRendererEvent("prices:updated", undefined),
      );
      const activeWorkspaceId = () => workspaceRegistry.bootstrap().workspaceId;
      const spoilers = new SpoilerProjection(activeWorkspaceId, {
        onChanged: () => publishRendererEvent("workspace-projection:spoilers-changed", undefined),
      });
      const collection = new CollectionProjection(activeWorkspaceId, {
        applyDelta: (delta) => catalog.applyCollection(delta),
        onResyncRequired: () =>
          publishRendererEvent("workspace-projection:collection-resync-required", undefined),
        replace: (lots) => catalog.replaceCollection(lots),
      });

      const catalogPath = join(app.getPath("userData"), "catalog", "cards.sqlite");
      const catalog = createCatalogService({
        catalogPath,
        pricePath,
        workerUrl: new URL(/* @vite-ignore */ "./catalog-query-worker.js", import.meta.url),
        collection,
        readVisibility: () => spoilers.visibilitySnapshot(),
      });
      registerCatalogIpc(catalog, createCatalogInstaller(catalogPath, catalog.replace));
      registerPriceIpc(prices, catalog.printingDetail);
      registerCollectionProjectionIpc(collection);
      registerSpoilerProjectionIpc(spoilers);

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
      registerCatalogImageProtocol(session.defaultSession, imageCache, catalog.imageSource);
      registerCatalogSetSymbolProtocol(
        session.defaultSession,
        setSymbolCache,
        catalog.setSymbolSource,
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
      const accountWorkspace = new AccountWorkspace(
        auth,
        workspaceRegistry,
        async (workspaceChanged) => {
          if (workspaceChanged) {
            await collection.workspaceChanged();
            spoilers.workspaceChanged();
          }
          publishRendererEvent("workspace:changed", undefined);
        },
        Date.now,
        app.getVersion(),
      );
      registerWorkspaceIpc(workspaceRegistry, accountWorkspace, app.getPath("documents"));
      const publishAuthStateAndRefresh = await registerAuthIpc(auth, authStartup, (snapshot) =>
        accountWorkspace.authChanged(snapshot),
      );

      const priceRefreshTimer = setInterval(() => {
        void prices.refresh();
      }, 3_600_000);
      priceRefreshTimer.unref();
      app.once("will-quit", () => {
        clearInterval(priceRefreshTimer);
        void prices.close();
        spoilers.close();
        workspaceRegistry.close();
      });

      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });

      await createWindow(collection, spoilers);
      void prices.refresh();
      publishAuthStateAndRefresh();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow(collection, spoilers);
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
