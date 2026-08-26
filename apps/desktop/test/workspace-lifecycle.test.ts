import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

void test("a Workspace registry commits before its store can suspend", async () => {
  const startupSource = await readFile(
    new URL("../src/features/workspace/workspace-startup.tsx", import.meta.url),
    "utf8",
  );
  const storeSource = await readFile(
    new URL("../src/features/workspace/workspace-store.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    startupSource,
    /<StoreRegistryProvider storeRegistry=\{session\.registry\}>\s*<Suspense/u,
  );
  assert.doesNotMatch(startupSource, /initialStoreRegistry|onStoreRegistryChanged/u);
  assert.doesNotMatch(storeSource, /unusedCacheTime/u);
});
