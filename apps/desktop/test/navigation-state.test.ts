import assert from "node:assert/strict";
import { test } from "node:test";

import { validateCollectionSearch } from "../src/features/collection/collection-state.ts";
import {
  readCardDetailOrigin,
  withCardDetailOrigin,
  type CardDetailOrigin,
} from "../src/features/cards/card-detail-origin.ts";
import { validateCatalogSearch } from "../src/features/search/search-state.ts";
import type { JsonValue } from "@mooligan/domain/schema";

void test("collection search preserves valid filters and normalizes text", () => {
  assert.deepEqual(
    validateCollectionSearch({
      condition: "near-mint",
      finish: "foil",
      language: "pt",
      query: "  Lightning Bolt  ",
      set: " LEA ",
      sort: "quantity",
      unrelated: true,
    }),
    {
      condition: "near-mint",
      finish: "foil",
      language: "pt",
      query: "Lightning Bolt",
      set: "lea",
      sort: "quantity",
    },
  );
  assert.deepEqual(
    validateCollectionSearch({
      condition: "invalid",
      finish: "invalid",
      language: "xx",
      sort: "name",
    }),
    {},
  );
  assert.deepEqual(validateCollectionSearch(null), {});
});

void test("one origin round-trips and replaces every previous destination while preserving router state", () => {
  const origins: CardDetailOrigin[] = [
    { kind: "deck", deckId: "deck-1" },
    {
      kind: "collection",
      search: validateCollectionSearch({ query: " bolt ", set: " LEA ", finish: "foil" }),
    },
    {
      kind: "search",
      search: validateCatalogSearch({ query: " mox ", grid: true, universe: "within" }),
    },
  ];
  const history = { __TSR_index: 2, __hashScrollIntoViewOptions: true };
  for (const previous of origins) {
    for (const next of origins) {
      const state = withCardDetailOrigin(next)(withCardDetailOrigin(previous)(history));
      assert.deepEqual(state, { ...history, origin: next });
      assert.deepEqual(readCardDetailOrigin(state), next);
      assert.deepEqual(withCardDetailOrigin(null)(state), history);
    }
  }
  assert.deepEqual(withCardDetailOrigin(null)({ ...history, origin: "invalid" }), history);
});

void test("history accepts only normalized origin data, never arbitrary destinations", () => {
  const invalid: JsonValue[] = [
    null,
    {},
    { href: "https://example.com" },
    { kind: "deck", deckId: "" },
    { kind: "deck", deckId: "deck-1", href: "/settings" },
    { kind: "search", search: { query: 7 } },
    { kind: "search", search: { query: " bolt " } },
    { kind: "search", search: { digital: false } },
    { kind: "search", search: { unknown: true } },
    { kind: "collection", search: { finish: "invalid" } },
    { kind: "collection", search: { set: " LEA " } },
    { kind: "collection", search: { set: "x".repeat(17) } },
    { kind: "collection", search: { sort: "name" } },
  ];
  for (const origin of invalid)
    assert.equal(readCardDetailOrigin({ origin }), null, JSON.stringify(origin));
  assert.equal(readCardDetailOrigin(null), null);
  assert.equal(readCardDetailOrigin({ deckOrigin: { deckId: "old-key" } }), null);
  assert.throws(() => withCardDetailOrigin({ kind: "deck", deckId: "" }));
});

void test("URL validation drops invalid fields individually and bounds normalized text", () => {
  assert.deepEqual(
    validateCollectionSearch({ query: 7, finish: "foil", language: "invalid", set: " LEA " }),
    { finish: "foil", set: "lea" },
  );
  assert.deepEqual(
    validateCatalogSearch({
      query: null,
      grid: true,
      digital: false,
      universe: "within",
      unrelated: true,
    }),
    { grid: true, universe: "within" },
  );
  assert.equal(validateCatalogSearch({ query: "x".repeat(600) }).query?.length, 500);
  assert.equal(validateCollectionSearch({ set: "A".repeat(30) }).set, "a".repeat(16));
  for (const input of [null, [], true, 5, "query"]) {
    assert.deepEqual(validateCatalogSearch(input), {});
    assert.deepEqual(validateCollectionSearch(input), {});
  }
});
