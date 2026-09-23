import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeScryfallCardDetail } from "@mooligan/domain/catalog-detail";
import {
  ScryfallCardDownloadSchema,
  type ScryfallCardDownload,
} from "@mooligan/domain/catalog-download";
import type { DeckEntry } from "../src/deck-contract.ts";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import {
  analyzeDeckMana,
  drawProbability,
  manaDrawStats,
  manaDrawTargets,
} from "../src/client/deck-mana.ts";

function printing(id: string, fields: Partial<ScryfallCardDownload> = {}): CatalogPrintingResult {
  return {
    status: "visible",
    visibility: { reason: "released" },
    detail: normalizeScryfallCardDetail(
      ScryfallCardDownloadSchema.parse({
        id,
        name: id,
        object: "card",
        collector_number: "1",
        set: "test",
        set_id: "test",
        set_name: "Test",
        rarity: "common",
        type_line: "Creature",
        cmc: 2,
        mana_cost: "{1}{G}",
        layout: "normal",
        ...fields,
      }),
    ),
  };
}

function entry(
  printingId: string,
  quantity = 1,
  section: DeckEntry["section"] = "mainboard",
): DeckEntry {
  return { id: `${printingId}-${section}`, printingId, quantity, section, finish: "nonfoil" };
}

void test("catalog production reaches analysis; quantities, sections and commander costs stay distinct", () => {
  const printings = new Map([
    [
      "forest",
      printing("forest", {
        type_line: "Basic Land — Forest",
        cmc: 0,
        mana_cost: "",
        produced_mana: ["G"],
      }),
    ],
    ["elf", printing("elf", { produced_mana: ["G"] })],
    ["bolt", printing("bolt", { type_line: "Instant", cmc: 1, mana_cost: "{R}" })],
    ["leader", printing("leader", { cmc: 4, mana_cost: "{2}{G}{G}", produced_mana: ["G"] })],
  ]);
  const entries = [
    entry("forest", 24),
    entry("elf", 32),
    entry("bolt", 4),
    entry("leader", 1, "commander"),
    entry("bolt", 15, "sideboard"),
    entry("forest", 50, "maybeboard"),
    entry("elf", 1, "companion"),
  ];
  const analysis = analyzeDeckMana(entries, printings);
  assert.equal(analysis.librarySize, 60);
  assert.equal(analysis.lands, 24);
  assert.equal(analysis.nonlandSources, 32);
  assert.equal(analysis.spellCount, 37);
  assert.equal(analysis.manaTotal, 72);
  assert.equal(analysis.averageMana, 72 / 37);
  assert.equal(analysis.averageWithLands, 72 / 61);
  assert.deepEqual(analysis.curve[1], { label: "1", total: 4, permanents: 0, nonpermanents: 4 });
  assert.equal(analysis.curve[4]?.permanents, 1);
  assert.equal(analysis.colors.find((color) => color.value === "G")?.pips, 34);
  assert.equal(analysis.colors.find((color) => color.value === "G")?.sources, 56);
  assert.equal(analysis.colors.find((color) => color.value === "G")?.landSources, 24);
  assert.equal(manaDrawTargets(analysis).find((target) => target.label === "bolt")?.quantity, 4);
  assert.ok(!analysis.cards.some((card) => card.id === "leader"));
  assert.equal(analyzeDeckMana([entry("forest", 20), entry("elf", 40)], printings).lands, 20);
});

void test("pip demand handles hybrid, Phyrexian, colorless, generic and variable costs", () => {
  const card = printing("hybrid", { mana_cost: "{X}{3}{W/U}{2/R}{B/P}{G/U/P}{C}{S}", cmc: 9 });
  const analysis = analyzeDeckMana([entry("hybrid", 2)], new Map([["hybrid", card]]));
  assert.deepEqual(
    analysis.colors.map((color) => color.pips),
    [1, 2, 2, 2, 1, 2],
  );
  assert.equal(analysis.curve[8]?.total, 2);
  assert.equal(analysis.manaTotal, 18);
});

void test("modal land backs count as land options; transform backs and Adventure costs do not", () => {
  const faces = [
    { name: "Front", type_line: "Sorcery", mana_cost: "{2}{G}" },
    { name: "Back", type_line: "Land", mana_cost: "" },
  ];
  const modal = printing("modal", {
    layout: "modal_dfc",
    card_faces: faces,
    cmc: 3,
    produced_mana: ["G"],
  });
  const transform = printing("transform", {
    layout: "transform",
    card_faces: faces,
    cmc: 3,
    produced_mana: ["G"],
  });
  const adventure = printing("adventure", {
    layout: "adventure",
    cmc: 3,
    card_faces: [
      { name: "Creature", type_line: "Creature", mana_cost: "{2}{G}" },
      { name: "Adventure", type_line: "Instant", mana_cost: "{U}" },
    ],
  });
  const split = printing("split", {
    layout: "split",
    cmc: 4,
    card_faces: [
      { name: "One", type_line: "Instant", mana_cost: "{R}" },
      { name: "Two", type_line: "Sorcery", mana_cost: "{1}{W}{W}" },
    ],
  });
  const analysis = analyzeDeckMana(
    [entry("modal", 2), entry("transform"), entry("adventure"), entry("split")],
    new Map([
      ["modal", modal],
      ["transform", transform],
      ["adventure", adventure],
      ["split", split],
    ]),
  );
  assert.equal(analysis.lands, 2);
  assert.equal(analysis.modalLands, 2);
  assert.equal(analysis.nonlandSources, 1);
  assert.equal(analysis.spellCount, 3);
  assert.equal(analysis.manaTotal, 10);
  assert.equal(analysis.averageMana, 10 / 3);
  assert.equal(analysis.averageWithLands, 10 / 5);
  assert.deepEqual(
    analysis.colors.map((color) => color.pips),
    [2, 0, 0, 1, 2, 0],
  );
  assert.equal(analysis.curve[3]?.total, 2);
  assert.equal(analysis.curve[4]?.nonpermanents, 1);
});

void test("multicolor sources count once per color; card odds combine printings and finishes", () => {
  const card = printing("dual", {
    oracle_id: "shared",
    name: "Dual land",
    type_line: "Land",
    mana_cost: "",
    cmc: 0,
    produced_mana: ["U", "R", "U"],
  });
  const other = printing("other", {
    oracle_id: "shared",
    name: "Dual land",
    type_line: "Land",
    mana_cost: "",
    cmc: 0,
    produced_mana: ["U", "R"],
  });
  const analysis = analyzeDeckMana(
    [entry("dual", 2), { ...entry("other", 2), finish: "foil" }],
    new Map([
      ["dual", card],
      ["other", other],
    ]),
  );
  assert.equal(analysis.lands, 4);
  assert.deepEqual(
    analysis.colors.map((color) => color.landSources),
    [0, 4, 0, 4, 0, 0],
  );
  assert.deepEqual(analysis.cards, [{ id: "shared", name: "Dual land", quantity: 4 }]);
});

void test("missing and protected cards remain in library size without exposing details or inventing odds", () => {
  const protectedCard: CatalogPrintingResult = {
    status: "protected",
    printingId: "hidden",
    releasedOn: "2030-01-01",
    release: {
      code: "future",
      name: "Future set",
      nextReleaseOn: "2030-01-01",
      rootSetId: "future",
      symbol: { setId: "future" },
    },
  };
  const analysis = analyzeDeckMana(
    [entry("hidden", 2), entry("missing", 3)],
    new Map([["hidden", protectedCard]]),
  );
  assert.equal(analysis.librarySize, 5);
  assert.equal(analysis.unknown, 5);
  assert.equal(analysis.unknownLibrary, 5);
  assert.deepEqual(analysis.cards, []);
  assert.equal(analysis.averageMana, null);
  assert.equal(manaDrawStats(analysis, false).expectedLands, null);
  assert.ok(manaDrawStats(analysis, false).turns.every((turn) => turn.probability === null));
  const commanderOnly = analyzeDeckMana(
    [entry("known", 8), entry("hidden", 1, "commander")],
    new Map([
      ["known", printing("known")],
      ["hidden", protectedCard],
    ]),
  );
  assert.equal(commanderOnly.unknownLibrary, 0);
  assert.equal(manaDrawStats(commanderOnly, false).expectedLands, 0);
});

void test("unknown mana values are excluded from averages instead of counted as zero", () => {
  const analysis = analyzeDeckMana(
    [entry("unknown"), entry("known")],
    new Map([
      ["unknown", printing("unknown", { cmc: undefined })],
      ["known", printing("known")],
    ]),
  );
  assert.equal(analysis.unknownManaValue, 1);
  assert.equal(analysis.spellCount, 2);
  assert.equal(analysis.averageMana, 2);
});

void test("hypergeometric odds match exhaustive draws of a small deck", () => {
  // Enumerate every 3-card hand of a 6-card deck with two matching copies.
  const counts = [0, 0, 0, 0];
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++)
      for (let c = b + 1; c < 6; c++) {
        const matching = [a, b, c].filter((card) => card < 2).length;
        counts[matching]!++;
      }
  for (let wanted = 0; wanted <= 3; wanted++) {
    assert.ok(
      Math.abs(drawProbability(6, 2, 3, wanted, "exactly")! - counts[wanted]! / 20) < 1e-12,
    );
    assert.ok(
      Math.abs(
        drawProbability(6, 2, 3, wanted)! - counts.slice(wanted).reduce((a, b) => a + b, 0) / 20,
      ) < 1e-12,
    );
    assert.ok(
      Math.abs(
        drawProbability(6, 2, 3, wanted, "at-most")! -
          counts.slice(0, wanted + 1).reduce((a, b) => a + b, 0) / 20,
      ) < 1e-12,
    );
  }
});

void test("probabilities stay finite for empty, all-land, no-land and very large decks", () => {
  assert.equal(drawProbability(0, 0, 0, 0), null);
  assert.equal(drawProbability(60, 61, 7, 1), null);
  assert.equal(drawProbability(60, 24, 61, 1), null);
  assert.equal(drawProbability(60, 24, 7.5, 1), null);
  assert.equal(drawProbability(60, 24, 7, -1), null);
  assert.equal(drawProbability(60, 24, NaN, 1), null);
  assert.equal(drawProbability(60, 0, 7, 1), 0);
  assert.equal(drawProbability(60, 60, 7, 7), 1);
  assert.equal(drawProbability(60, 60, 7, 6, "exactly"), 0);
  assert.equal(drawProbability(60, 24, 0, 0, "exactly"), 1);
  assert.equal(drawProbability(60, 24, 7, 8), 0);
  assert.ok(Number.isFinite(drawProbability(1_000_000, 400_000, 7, 3)));
  const sum = Array.from({ length: 8 }, (_, count) =>
    drawProbability(99, 37, 7, count, "exactly")!,
  ).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

void test("draw timing changes turn odds but not opening hands; short libraries cap cards seen", () => {
  const printings = new Map([
    ["land", printing("land", { type_line: "Land", cmc: 0, mana_cost: "" })],
    ["spell", printing("spell")],
  ]);
  const analysis = analyzeDeckMana([entry("land", 24), entry("spell", 36)], printings);
  const play = manaDrawStats(analysis, false);
  const draw = manaDrawStats(analysis, true);
  assert.equal(play.expectedLands, 2.8);
  assert.deepEqual(play.opening, draw.opening);
  assert.equal(play.turns[0]?.seen, 7);
  assert.equal(draw.turns[0]?.seen, 8);
  assert.ok(draw.turns[2]!.probability! > play.turns[2]!.probability!);
  const short = manaDrawStats(analyzeDeckMana([entry("land", 3)], printings), true);
  assert.equal(short.handSize, 3);
  assert.equal(short.turns[0]?.probability, 1);
  assert.equal(short.turns[3]?.probability, 0);
  assert.ok(short.turns.every((turn) => turn.seen === 3));
});
