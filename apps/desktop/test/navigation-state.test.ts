import assert from "node:assert/strict";
import { test } from "node:test";

import { validateCollectionSearch } from "../src/features/collection/collection-state.ts";
import { readDeckOrigin, withDeckOrigin } from "../src/features/decks/deck-origin.ts";

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

void test("deck navigation validates its origin while preserving unrelated history", () => {
  const origin = { deckId: "deck-1" };
  const history = {
    __TSR_index: 2,
    __hashScrollIntoViewOptions: true,
    collectionOrigin: { search: {} },
    catalogSearchOrigin: { search: {} },
  };
  const state = withDeckOrigin(origin)(history);
  assert.deepEqual(state, {
    __TSR_index: 2,
    __hashScrollIntoViewOptions: true,
    deckOrigin: origin,
  });
  assert.deepEqual(readDeckOrigin(state), origin);
  assert.equal(readDeckOrigin({ deckOrigin: { ...origin, href: "/settings" } }), null);
  assert.equal(readDeckOrigin({ deckOrigin: { deckId: "" } }), null);
  assert.equal(readDeckOrigin(null), null);
  assert.throws(() => withDeckOrigin({ deckId: "" }));
});
