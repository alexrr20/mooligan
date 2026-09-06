import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck } from "@mooligan/domain/decks";

import {
  collectionSearchResults,
  deckSearchResults,
} from "../src/features/search/global-search-results.ts";
import {
  addRecentSearch,
  readRecentSearches,
  writeRecentSearches,
} from "../src/features/search/recent-searches.ts";

void test("recent searches record submitted queries once, newest first, with a bounded history", () => {
  assert.deepEqual(addRecentSearch(["Lightning Bolt", "Rin"], "  rin  "), [
    "rin",
    "Lightning Bolt",
  ]);
  assert.deepEqual(addRecentSearch(["Rin"], "  "), ["Rin"]);
  assert.deepEqual(
    addRecentSearch(
      Array.from({ length: 8 }, (_, index) => String(index)),
      "new",
    ),
    ["new", "0", "1", "2", "3", "4", "5", "6"],
  );
});

void test("recent searches remain isolated between Workspaces and survive a new read", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  writeRecentSearches(storage, "first", ["Rin"]);
  writeRecentSearches(storage, "second", ["Lightning Bolt"]);
  assert.deepEqual(readRecentSearches(storage, "first"), ["Rin"]);
  assert.deepEqual(readRecentSearches(storage, "second"), ["Lightning Bolt"]);
  writeRecentSearches(storage, "first", []);
  assert.deepEqual(readRecentSearches(storage, "first"), []);
  assert.deepEqual(readRecentSearches(storage, "second"), ["Lightning Bolt"]);
});

void test("malformed or unavailable search history does not prevent searching", () => {
  for (const value of ["{", "null", "{}", "[42]", '[""]', JSON.stringify(["x".repeat(501)])]) {
    assert.deepEqual(readRecentSearches({ getItem: () => value }, "workspace"), []);
  }
  assert.deepEqual(
    readRecentSearches(
      {
        getItem: () => {
          throw new Error("unavailable");
        },
      },
      "workspace",
    ),
    [],
  );
  assert.doesNotThrow(() =>
    writeRecentSearches(
      {
        setItem: () => {
          throw new Error("full");
        },
      },
      "workspace",
      ["Rin"],
    ),
  );
});

void test("deck suggestions search names, tags and notes, prioritizing exact and active matches", () => {
  const base: Deck = {
    id: "exact",
    name: "Cats",
    tags: [],
    notes: "",
    formatId: "commander",
    archived: false,
    entries: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
  const decks = [
    { ...base, id: "archived", name: "Retired cats", archived: true },
    { ...base, id: "tagged", name: "Tokens", tags: ["cats"] },
    { ...base, id: "notes", name: "Rin and Seri", notes: "Cats and dogs" },
    { ...base, id: "unrelated", name: "Dragons" },
    base,
  ];
  assert.deepEqual(
    deckSearchResults(decks, " CATS ").map(({ id }) => id),
    ["exact", "notes", "tagged"],
  );
  assert.deepEqual(deckSearchResults(decks, " "), []);
  assert.equal(decks[0]?.id, "archived");
});

void test("Collection suggestions exclude protected and unavailable printings", () => {
  const common = {
    printingId: "visible",
    quantity: 2,
    editableLotId: null,
    finish: "nonfoil",
    language: "en",
    condition: "near-mint",
  } as const;
  const results = collectionSearchResults([
    {
      ...common,
      status: "visible",
      availableFinishes: ["nonfoil"],
      cardId: "card",
      collectorNumber: "278",
      image: null,
      gridImage: null,
      name: "Rin and Seri, Inseparable",
      setCode: "m21",
      setName: "Core Set 2021",
    },
    { status: "protected", routePrintingId: "hidden", label: "Protected preview", quantity: 1 },
    { ...common, printingId: "missing", status: "unavailable", label: "Unavailable printing" },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.label, "Rin and Seri, Inseparable");
  assert.match(results[0]?.description ?? "", /^2 copies/);
});
