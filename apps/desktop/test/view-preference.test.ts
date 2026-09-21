import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readViewPreference,
  writeViewPreference,
} from "../src/features/preferences/use-view-preference.ts";

void test("the view defaults to list and only restores a valid grid preference", () => {
  assert.equal(readViewPreference("mooligan.search.view", { getItem: () => null }), "list");
  assert.equal(readViewPreference("mooligan.search.view", { getItem: () => "list" }), "list");
  assert.equal(readViewPreference("mooligan.search.view", { getItem: () => "invalid" }), "list");
  assert.equal(readViewPreference("mooligan.search.view", { getItem: () => "grid" }), "grid");
});

void test("the view preference tolerates unavailable local storage", () => {
  assert.equal(
    readViewPreference("mooligan.search.view", {
      getItem: () => {
        throw new Error("unavailable");
      },
    }),
    "list",
  );
  assert.doesNotThrow(() =>
    writeViewPreference("mooligan.search.view", "grid", {
      setItem: () => {
        throw new Error("unavailable");
      },
    }),
  );
});

void test("search, collection, and deck views persist independently", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  writeViewPreference("mooligan.search.view", "grid", storage);
  writeViewPreference("mooligan.collection.view", "list", storage);
  writeViewPreference("mooligan.deck.view", "grid", storage);

  assert.equal(readViewPreference("mooligan.search.view", storage), "grid");
  assert.equal(readViewPreference("mooligan.collection.view", storage), "list");
  assert.equal(readViewPreference("mooligan.deck.view", storage), "grid");
});
