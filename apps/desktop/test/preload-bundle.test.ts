import assert from "node:assert/strict";
import { test } from "node:test";
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
  });
}
