import stylex from "@stylexjs/unplugin/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import electron from "vite-plugin-electron/simple";

import {
  defaultPackagedServiceOrigin,
  defaultPackagedSyncUrl,
  developmentContentSecurityPolicy,
  packagedContentSecurityPolicy,
} from "./content-security-policy";

export default defineConfig(({ command }) => {
  const syncUrl = desktopSyncUrl(command);

  return {
    base: "./",
    define: desktopRendererDefinitions(syncUrl),
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
    plugins: [
      tanstackRouter({
        target: "react",
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
        quoteStyle: "double",
        semicolons: true,
      }),
      stylex(),
      react(),
      electron({
        main: {
          entry: {
            "catalog-import-worker": "electron/catalog/import-worker.ts",
            "catalog-query-worker": "electron/catalog/query-worker.ts",
            main: "electron/main.ts",
          },
          vite: { define: desktopServiceDefinitions(command) },
          async onstart({ startup }) {
            await startup(["."]);
          },
        },
        preload: {
          input: "electron/preload.ts",
        },
      }),
      {
        name: "desktop-content-security-policy",
        transformIndexHtml(html: string) {
          const contentSecurityPolicy =
            command === "serve"
              ? developmentContentSecurityPolicy
              : packagedContentSecurityPolicy(syncUrl);
          return html.replace("__CONTENT_SECURITY_POLICY__", contentSecurityPolicy);
        },
      },
    ],
  };
});

function desktopSyncUrl(command: "build" | "serve") {
  const defaultSyncUrl =
    command === "build" ? defaultPackagedSyncUrl : "ws://127.0.0.1:3000/api/sync";
  return process.env.MOOLIGAN_SYNC_URL ?? defaultSyncUrl;
}

function desktopRendererDefinitions(syncUrl: string) {
  return {
    "import.meta.env.MOOLIGAN_SYNC_URL": JSON.stringify(syncUrl),
  };
}

function desktopServiceDefinitions(command: "build" | "serve") {
  const defaultOrigin = command === "build" ? defaultPackagedServiceOrigin : undefined;
  const apiUrl = process.env.MOOLIGAN_API_URL ?? defaultOrigin;
  const authOrigin = process.env.MOOLIGAN_AUTH_ORIGIN ?? defaultOrigin;
  const definitions: Record<string, string> = {};

  if (apiUrl) {
    definitions["process.env.MOOLIGAN_API_URL"] = JSON.stringify(apiUrl);
  }
  if (authOrigin) {
    definitions["process.env.MOOLIGAN_AUTH_ORIGIN"] = JSON.stringify(authOrigin);
  }

  return definitions;
}
