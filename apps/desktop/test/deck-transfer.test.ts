import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeckEntry } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";

import {
  exportDeckText,
  parseDeckText,
  resolveDeckText,
} from "@mooligan/workspace/client/deck-transfer";
import { summarizeDeck } from "@mooligan/workspace/client/deck-summary";

void test("deck text reads Arena, MTGO, foil markers and every deck section", () => {
  const parsed = parseDeckText(
    "Commander\n1 First Card\nDeck\n4 Lightning Bolt (M11) 146\n2x Fire // Ice\nSB: 1 Counterspell\nMaybeboard\n1 Island *F*\nCompanion\n1 Another Card\n",
  );
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.lines.map(({ section }) => section),
    ["commander", "mainboard", "mainboard", "sideboard", "maybeboard", "companion"],
  );
  assert.equal(parsed.lines[1]?.setCode, "M11");
  assert.equal(parsed.lines[2]?.name, "Fire // Ice");
  assert.equal(parsed.lines[4]?.finish, "foil");
  assert.equal(parseDeckText("0 Island\nbad line\n999999999999999999 Island").errors.length, 3);
});

void test("text export round trips missing printings offline without exposing protected names", async () => {
  const entries: DeckEntry[] = [
    { id: "one", printingId: "missing", finish: "etched", quantity: 4, section: "sideboard" },
    { id: "two", printingId: "protected", finish: "foil", quantity: 1, section: "commander" },
  ];
  const text = exportDeckText(entries, new Map());
  assert.ok(text.includes("[printing:missing] [finish:etched]"));
  const imported = await resolveDeckText(text, {
    detail: async () => {
      throw new Error("No catalog installed");
    },
    list: async () => {
      throw new Error("Exact IDs should not need a name lookup");
    },
  });
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.warnings.length, 2);
  assert.deepEqual(
    imported.entries,
    entries.map(({ id: _id, ...entry }) => entry),
  );
});

void test("unresolved names and unsupported finishes block import rather than dropping cards", async () => {
  const imported = await resolveDeckText(
    "1 Missing Card\n2 Known Card [printing:known] [finish:etched]",
    {
      list: async () => ({ cards: [], hasMore: false, total: 0 }),
      detail: async () => visible,
    },
  );
  assert.equal(imported.errors.length, 2);
  assert.deepEqual(imported.entries, []);
});

void test("name imports resolve an exact local printing and reuse repeated lookups", async () => {
  const searches: string[] = [];
  const imported = await resolveDeckText(
    "4 Known Card (TEST) 1\nSideboard\n1 Known Card (TEST) 1",
    {
      list: async (request) => {
        searches.push(request.query ?? "");
        return {
          cards: [
            {
              id: "known",
              name: "Known Card",
              collectorNumber: "1",
              gridImage: null,
              image: null,
              isDigital: false,
              rarity: "common",
              setCode: "test",
              setName: "Test",
              typeLine: "Instant",
            },
          ],
          hasMore: false,
          total: 1,
        };
      },
      detail: async () => visible,
    },
  );
  assert.deepEqual(imported.errors, []);
  assert.deepEqual(searches, ['!"Known Card" set:"TEST" cn:"1"']);
  assert.deepEqual(imported.entries, [
    { printingId: "known", finish: "nonfoil", quantity: 4, section: "mainboard" },
    { printingId: "known", finish: "nonfoil", quantity: 1, section: "sideboard" },
  ]);
});

void test("collection coverage allocates exact copies once across sections and ignores maybeboard", () => {
  const base = { printingId: "known", finish: "nonfoil", quantity: 4 } as const;
  const summary = summarizeDeck(
    [
      { ...base, id: "main", section: "mainboard" },
      { ...base, id: "side", section: "sideboard", quantity: 2 },
      { ...base, id: "maybe", section: "maybeboard", quantity: 20 },
    ],
    [
      { ...base, quantity: 5 },
      { ...base, quantity: 99, finish: "foil" },
    ],
    new Map([["known", visible]]),
  );
  assert.equal(summary.total, 6);
  assert.equal(summary.missing, 1);
  assert.equal(summary.spells, 4);
  assert.equal(summary.averageMana, 1);
});

void test("commanders belong to the main deck display and stats without counting copies twice", () => {
  const base = { printingId: "known", finish: "nonfoil", quantity: 1 } as const;
  const entries: DeckEntry[] = [
    { ...base, id: "main", section: "mainboard", quantity: 98 },
    { ...base, id: "commander", section: "commander" },
    { ...base, id: "partner", printingId: "unavailable", section: "commander" },
    { ...base, id: "side", section: "sideboard", quantity: 2 },
    { ...base, id: "companion", section: "companion" },
    { ...base, id: "maybe", section: "maybeboard", quantity: 7 },
  ];
  const summary = summarizeDeck(
    entries,
    [{ ...base, quantity: 99 }],
    new Map([["known", visible]]),
  );

  assert.deepEqual(
    summary.sections.map(({ value, quantity }) => [value, quantity]),
    [
      ["mainboard", 100],
      ["sideboard", 2],
      ["companion", 1],
      ["maybeboard", 7],
    ],
  );
  assert.deepEqual(
    summary.sections[0]?.entries.map(({ id }) => id),
    ["main", "commander", "partner"],
  );
  assert.equal(summary.spells, 99);
  assert.deepEqual(
    summary.mainboardGroups.map(({ type, quantity, entries }) => [
      type,
      quantity,
      entries.map(({ id }) => id),
    ]),
    [
      ["Commander", 2, ["commander", "partner"]],
      ["Instant", 98, ["main"]],
    ],
  );
  assert.deepEqual(
    summary.cardTypes.map(({ type, quantity }) => [type, quantity]),
    [
      ["Planeswalker", 0],
      ["Battle", 0],
      ["Creature", 0],
      ["Sorcery", 0],
      ["Instant", 99],
      ["Artifact", 0],
      ["Enchantment", 0],
      ["Land", 0],
    ],
  );
  assert.equal(summary.unknown, 1);
  assert.equal(summary.averageMana, 1);
  assert.equal(summary.total, 103);
  assert.equal(summary.missing, 4);
  assert.equal(entries.find(({ id }) => id === "commander")?.section, "commander");
});

void test("type counts include each front-face type and ignore back faces and subtypes", () => {
  const printing: CatalogPrintingResult = {
    ...visible,
    detail: {
      ...visible.detail,
      card: {
        ...visible.detail.card,
        faces: [
          { name: "Front", typeLine: "Artifact Creature — Land" },
          { name: "Back", typeLine: "Enchantment Land" },
        ],
      },
    },
  };
  const summary = summarizeDeck(
    [{ id: "main", printingId: "known", finish: "nonfoil", quantity: 3, section: "mainboard" }],
    [],
    new Map([["known", printing]]),
  );
  assert.deepEqual(
    summary.cardTypes.filter(({ quantity }) => quantity > 0),
    [
      { type: "Creature", quantity: 3 },
      { type: "Artifact", quantity: 3 },
    ],
  );
  assert.equal(summary.lands, 0);
  assert.deepEqual(
    summary.mainboardGroups.map(({ type }) => type),
    ["Creature"],
  );
});

void test("main deck type groups keep every entry once, including commanders and unavailable cards", () => {
  const printings = new Map<string, CatalogPrintingResult | null>();
  const entries: DeckEntry[] = [];
  for (const [id, typeLine] of [
    ["walker", "Legendary Planeswalker — Test"],
    ["battle", "Battle — Siege"],
    ["creature", "Artifact Creature — Land"],
    ["enchantment-creature", "Enchantment Creature — Nymph"],
    ["sorcery", "Sorcery"],
    ["instant", "Instant"],
    ["artifact", "Artifact — Equipment"],
    ["enchantment", "Enchantment"],
    ["land", "Artifact Land"],
    ["other", "Conspiracy"],
  ] as const) {
    printings.set(id, {
      ...visible,
      detail: {
        ...visible.detail,
        card: {
          ...visible.detail.card,
          faces: [
            { name: id, typeLine },
            { name: "Back", typeLine: "Land" },
          ],
        },
      },
    });
    entries.push({ id, printingId: id, section: "mainboard", quantity: 2, finish: "nonfoil" });
  }
  printings.set("protected", {
    status: "protected",
    printingId: "protected",
    releasedOn: "2099-01-01",
    release: {
      code: "future",
      name: "Future",
      nextReleaseOn: "2099-01-01",
      rootSetId: "future",
      symbol: { setId: "future" },
    },
  });
  entries.push(
    { id: "commander", printingId: "creature", section: "commander", quantity: 1, finish: "foil" },
    { id: "missing", printingId: "missing", section: "mainboard", quantity: 3, finish: "nonfoil" },
    {
      id: "protected",
      printingId: "protected",
      section: "mainboard",
      quantity: 1,
      finish: "nonfoil",
    },
    { id: "side", printingId: "instant", section: "sideboard", quantity: 4, finish: "nonfoil" },
  );
  const summary = summarizeDeck(entries, [], printings);
  assert.deepEqual(
    summary.mainboardGroups.map(({ type, quantity }) => [type, quantity]),
    [
      ["Commander", 1],
      ["Planeswalker", 2],
      ["Battle", 2],
      ["Creature", 4],
      ["Sorcery", 2],
      ["Instant", 2],
      ["Artifact", 2],
      ["Enchantment", 2],
      ["Land", 2],
      ["Other", 6],
    ],
  );
  assert.deepEqual(
    summary.mainboardGroups.flatMap(({ entries }) => entries.map(({ id }) => id)).sort(),
    entries
      .filter(({ section }) => section !== "sideboard")
      .map(({ id }) => id)
      .sort(),
  );
  assert.deepEqual(summarizeDeck([], [], printings).mainboardGroups, []);
});

const visible = {
  status: "visible",
  visibility: { reason: "released" },
  detail: {
    card: {
      id: "known",
      hasSharedIdentity: false,
      name: "Known Card",
      colorIdentity: ["R"],
      faces: [{ name: "Known Card", typeLine: "Instant" }],
      keywords: [],
      manaValue: 1,
    },
    selectedPrinting: {
      id: "known",
      collectorNumber: "1",
      finishes: ["nonfoil", "foil"],
      images: [],
      isDigital: false,
      isPromo: false,
      rarity: "common",
      setCode: "test",
      setName: "Test",
    },
    legalities: [],
    siblingPrintings: [],
  },
} satisfies CatalogPrintingResult;
