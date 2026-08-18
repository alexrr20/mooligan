import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCatalogSearchOrigin,
  getInitialGalleryVisibleCount,
  getNextGalleryVisibleCount,
  PRINTING_GALLERY_BATCH_SIZE,
  readCatalogSearchOrigin,
  validateCatalogSearchOrigin,
  withCatalogSearchOrigin,
} from "../src/features/cards/card-navigation.ts";

void test("a validated search origin round-trips through history state", () => {
  const origin = createCatalogSearchOrigin({
    adCards: true,
    artSeries: true,
    digital: true,
    grid: true,
    query: "  black lotus  ",
    tokens: true,
    uniqueCards: true,
    universe: "within",
  });

  assert.deepEqual(origin, {
    search: {
      adCards: true,
      artSeries: true,
      digital: true,
      grid: true,
      query: "black lotus",
      tokens: true,
      uniqueCards: true,
      universe: "within",
    },
  });
  assert.deepEqual(
    readCatalogSearchOrigin(withCatalogSearchOrigin(origin)({ __TSR_index: 0 })),
    origin,
  );
});

void test("history state cannot substitute an arbitrary href for typed search values", () => {
  assert.equal(readCatalogSearchOrigin({ href: "https://example.com" }), null);
  assert.equal(
    readCatalogSearchOrigin({
      catalogSearchOrigin: { href: "https://example.com", search: { query: "bolt" } },
    }),
    null,
  );
  assert.equal(validateCatalogSearchOrigin({ search: { query: 7 } }), null);
  assert.equal(validateCatalogSearchOrigin({ search: { query: " bolt " } }), null);
  assert.equal(validateCatalogSearchOrigin({ search: { digital: false } }), null);
  assert.equal(validateCatalogSearchOrigin({ search: { unknown: true } }), null);
  assert.deepEqual(withCatalogSearchOrigin(null)({ catalogSearchOrigin: "invalid" }), {});
});

void test("unrelated router history fields do not invalidate a typed origin", () => {
  const state = {
    __TSR_key: "router-key",
    catalogSearchOrigin: { search: { grid: true, query: "mox" } },
  };

  assert.deepEqual(readCatalogSearchOrigin(state), {
    search: { grid: true, query: "mox" },
  });
});

void test("the initial gallery batch always contains the selected printing", () => {
  assert.equal(PRINTING_GALLERY_BATCH_SIZE, 24);
  assert.equal(getInitialGalleryVisibleCount(0, 0), 0);
  assert.equal(getInitialGalleryVisibleCount(12, 11), 12);
  assert.equal(getInitialGalleryVisibleCount(100, 0), 24);
  assert.equal(getInitialGalleryVisibleCount(100, 23), 24);
  assert.equal(getInitialGalleryVisibleCount(100, 24), 48);
  assert.equal(getInitialGalleryVisibleCount(100, 47), 48);
  assert.equal(getInitialGalleryVisibleCount(100, 48), 72);
  assert.equal(getInitialGalleryVisibleCount(100, 99), 100);
});

void test("missing selections use one batch and show-more reveals 24 at a time", () => {
  assert.equal(getInitialGalleryVisibleCount(100, -1), 24);
  assert.equal(getInitialGalleryVisibleCount(100, 100), 24);
  assert.equal(getNextGalleryVisibleCount(100, 24), 48);
  assert.equal(getNextGalleryVisibleCount(100, 96), 100);
  assert.equal(getNextGalleryVisibleCount(10, 10), 10);
});
