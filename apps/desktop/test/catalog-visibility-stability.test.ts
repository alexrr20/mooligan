import assert from "node:assert/strict";
import { test } from "node:test";

import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";

import {
  CatalogVisibilityChangedError,
  readWithStableCatalogVisibility,
} from "../electron/catalog/stable-visibility.ts";

const protectedVisibility: SpoilerVisibilitySnapshot = {
  currentDate: "2026-08-19",
  policy: "protect",
  revealedPrintingIds: [],
  revealedRootSetIds: [],
  revision: 2,
};
const visibleVisibility: SpoilerVisibilitySnapshot = {
  ...protectedVisibility,
  policy: "show",
  revision: 1,
};

void test("a catalog read discards a result when visibility changes in flight", async () => {
  const snapshots = [
    visibleVisibility,
    protectedVisibility,
    protectedVisibility,
    protectedVisibility,
  ];
  let reads = 0;
  const stable = await readWithStableCatalogVisibility(
    () => snapshots.shift() ?? protectedVisibility,
    async ({ policy }) => {
      reads += 1;
      return policy === "show" ? "visible card details" : "protected preview";
    },
  );

  assert.equal(stable.result, "protected preview");
  assert.equal(stable.visibility.policy, "protect");
  assert.equal(reads, 2);
});

void test("a catalog read fails closed when visibility never stabilizes", async () => {
  let revision = 0;

  await assert.rejects(
    readWithStableCatalogVisibility(
      () => ({ ...protectedVisibility, revision: revision++ }),
      async () => "visible card details",
    ),
    CatalogVisibilityChangedError,
  );
});
