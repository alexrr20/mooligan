import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { DesktopApi } from "../shared/desktop-api.ts";
import type { JsonValue } from "@mooligan/domain/schema";
import { fileURLToPath } from "node:url";

import { build } from "vite-plugin-electron";

for (const mode of ["development", "production"]) {
  void test(`the ${mode} preload only imports APIs available in Electron's sandbox`, async () => {
    const result = await build({
      vite: {
        root: fileURLToPath(new URL("../", import.meta.url)),
        mode,
        logLevel: "silent",
        build: {
          write: false,
          minify: mode === "production",
          rolldownOptions: {
            input: "electron/preload.ts",
            output: { format: "cjs", codeSplitting: false },
          },
        },
      },
    });

    const bundles = Array.isArray(result) ? result : [result];
    assert.equal(bundles.length, 1);
    const bundle = bundles[0]!;
    assert.ok("output" in bundle);
    const chunks = bundle.output.filter((output) => output.type === "chunk");
    assert.equal(chunks.length, 1);
    // Bundler import metadata also lists imports removed by tree shaking.
    const requires = Array.from(
      chunks[0]!.code.matchAll(/\brequire\((["'`])([^"'`]+)\1\)/gu),
      (match) => match[2],
    );
    assert.deepEqual(requires, ["electron"]);
    assert.deepEqual(chunks[0]!.dynamicImports, []);

    let catalog: DesktopApi["catalog"] | undefined;
    let response: JsonValue = { malformed: true };
    runInNewContext(chunks[0]!.code, {
      exports: {},
      URL,
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
      require(name: string) {
        assert.equal(name, "electron");
        return {
          contextBridge: {
            exposeInMainWorld(key: string, api: DesktopApi["catalog"]) {
              if (key === "catalog") catalog = api;
            },
          },
          ipcRenderer: { invoke: async () => response },
        };
      },
    });
    assert.ok(catalog);
    await assert.rejects(catalog.detail("printing"));
    await assert.rejects(catalog.colors(["printing"]));
    await assert.rejects(catalog.upcoming());
    await assert.rejects(catalog.upcomingPrintings());
    await assert.rejects(catalog.status());
    response = null;
    assert.equal(await catalog.detail("printing"), null);
    assert.equal(await catalog.colors(["printing"]), null);
    response = [];
    assert.equal((await catalog.upcoming()).length, 0);
  });
}
