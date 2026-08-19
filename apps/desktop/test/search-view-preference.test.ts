import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readSearchViewPreference,
  writeSearchViewPreference,
} from "../src/features/search/use-search-view-preference.ts";

void test("the search view defaults to list and only restores a valid grid preference", () => {
  assert.equal(readSearchViewPreference({ getItem: () => null }), "list");
  assert.equal(readSearchViewPreference({ getItem: () => "list" }), "list");
  assert.equal(readSearchViewPreference({ getItem: () => "invalid" }), "list");
  assert.equal(readSearchViewPreference({ getItem: () => "grid" }), "grid");
});

void test("the search view preference tolerates unavailable local storage", () => {
  assert.equal(
    readSearchViewPreference({
      getItem: () => {
        throw new Error("unavailable");
      },
    }),
    "list",
  );
  assert.doesNotThrow(() =>
    writeSearchViewPreference(
      {
        setItem: () => {
          throw new Error("unavailable");
        },
      },
      "grid",
    ),
  );
});

void test("the search view preference stores the selected mode", () => {
  let stored: [string, string] | null = null;

  writeSearchViewPreference(
    {
      setItem: (key, value) => {
        stored = [key, value];
      },
    },
    "grid",
  );

  assert.deepEqual(stored, ["mooligan.search.view", "grid"]);
});
