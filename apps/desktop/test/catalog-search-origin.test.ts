import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCatalogSearchOrigin,
  readCatalogSearchOrigin,
  validateCatalogSearchOrigin,
  withCatalogSearchOrigin,
} from "../src/features/search/catalog-search-origin.ts";

void test("a validated search origin round-trips through history state", () => {
  const origin = createCatalogSearchOrigin({
    adCards: true,
    artSeries: true,
    digital: true,
    grid: true,
    mode: "upcoming",
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
      mode: "upcoming",
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
