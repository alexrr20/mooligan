import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeScryfallCardDetail } from "@mooligan/domain/catalog-detail";
import type { DeckEntry } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";

import { commanderArt } from "../src/features/decks/deck-art.ts";

const entries: DeckEntry[] = [
  { id: "first", printingId: "a", section: "commander", quantity: 1, finish: "nonfoil" },
  { id: "partner", printingId: "b", section: "commander", quantity: 1, finish: "nonfoil" },
  { id: "duplicate", printingId: "a", section: "commander", quantity: 1, finish: "foil" },
  { id: "main", printingId: "c", section: "mainboard", quantity: 1, finish: "nonfoil" },
];
const printings = new Map(["a", "b", "c"].map((id) => [id, visible(id)]));

void test("commander covers use exact front artwork once per commander in a stable order", () => {
  for (const formatId of ["commander", "duel", "paupercommander"]) {
    assert.deepEqual(commanderArt({ formatId, entries: [...entries].reverse() }, printings), [
      { faceIndex: 0, printingId: "a", size: "art_crop" },
      { faceIndex: 0, printingId: "b", size: "art_crop" },
    ]);
  }
  assert.deepEqual(commanderArt({ formatId: "modern", entries }, printings), []);
  assert.deepEqual(commanderArt({ formatId: "commander", entries: [] }, printings), []);
});

void test("covers omit unavailable art and protected previews", () => {
  const hidden: CatalogPrintingResult = {
    status: "protected",
    printingId: "a",
    releasedOn: "2099-01-01",
    release: {
      code: "test",
      name: "Test",
      nextReleaseOn: "2099-01-01",
      rootSetId: "test",
      symbol: { setId: "test" },
    },
  };
  for (const result of [null, hidden, visible("a", false)]) {
    assert.deepEqual(
      commanderArt({ formatId: "commander", entries }, new Map([["a", result]])),
      [],
    );
  }
});

function visible(id: string, art = true): CatalogPrintingResult {
  return {
    status: "visible",
    visibility: { reason: "released" },
    detail: normalizeScryfallCardDetail({
      id,
      object: "card",
      name: id,
      collector_number: "1",
      rarity: "rare",
      set: "test",
      set_id: "test",
      set_name: "Test",
      type_line: "Legendary Creature",
      image_uris: {
        normal: `https://cards.scryfall.io/normal/front/${id}.jpg`,
        art_crop: art ? `https://cards.scryfall.io/art_crop/front/${id}.jpg` : undefined,
      },
    }),
  };
}
