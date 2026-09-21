import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { createDeckCostQuery } from "@mooligan/catalog/deck-cost";
import { deckCostMetrics } from "@mooligan/catalog/deck-cost-summary";
import { importCatalogData } from "@mooligan/catalog/import";
import { initializePriceDatabase } from "@mooligan/catalog/prices";
import {
  parseCatalogQueryWorkerRequest,
  parseCatalogQueryWorkerResponse,
} from "@mooligan/catalog/query";
import { DeckCostRequestSchema, type DeckCostRequest } from "@mooligan/domain/deck-cost";
import {
  ScryfallSetDownloadSchema,
  type ScryfallCardDownload,
} from "@mooligan/domain/catalog-download";
import type { DeckEntry } from "@mooligan/domain/decks";
import type { MarketPrice } from "@mooligan/domain/market";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";

const visibility: SpoilerVisibilitySnapshot = {
  currentDate: "2026-09-21",
  policy: "protect",
  revision: 0,
  revealedPrintingIds: [],
  revealedRootSetIds: [],
};

void test("deck cost compares selected finishes with visible paper siblings using quantities and market preferences", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-deck-cost-"));
  const database = new DatabaseSync(":memory:");
  const prices = new DatabaseSync(join(directory, "prices.sqlite"));
  try {
    initializePriceDatabase(prices);
    const cards = [
      card("selected", "same-card"),
      card("cheap", "same-card"),
      card("digital", "same-card", { digital: true }),
      card("preview", "same-card", { released_at: "2027-01-01" }),
      card("singleton"),
      card("unrelated"),
      card("unpriced", "same-card"),
    ];
    await importCatalogData(
      database,
      {
        compressedSize: 1,
        downloadUrl: "https://example.com/catalog.gz",
        updatedAt: "2026-09-21T00:00:00Z",
      },
      [
        ScryfallSetDownloadSchema.parse({
          id: "set-tst",
          code: "tst",
          name: "Test",
          set_type: "expansion",
          card_count: cards.length,
          digital: false,
          foil_only: false,
          nonfoil_only: false,
          object: "set",
          scryfall_uri: "https://example.com/set",
          search_uri: "https://example.com/search",
          uri: "https://example.com/set",
          released_at: "2020-01-01",
          icon_svg_uri: "https://example.com/set.svg",
        }),
      ],
      (async function* () {
        for (const value of cards) yield JSON.stringify(value);
      })(),
      () => {},
    );
    database.prepare("ATTACH DATABASE ? AS market_prices").run(join(directory, "prices.sqlite"));
    const insert = prices.prepare("INSERT INTO prices VALUES (?, ?, ?, ?, ?, ?, ?)");
    function price(
      id: string,
      amount: number,
      finish: MarketPrice["finish"] = "nonfoil",
      market = "cardmarket",
      currency = "EUR",
      kind = "retail",
    ) {
      insert.run(id, market, kind, finish, currency, amount, "2026-09-20");
    }
    price("selected", 1000, "foil");
    price("selected", 800);
    price("cheap", 200);
    price("cheap", 100, "foil");
    price("cheap", 50, "etched", "tcgplayer", "USD");
    price("cheap", 1, "nonfoil", "cardkingdom");
    price("cheap", 0, "nonfoil", "cardmarket", "EUR", "buylist");
    price("digital", 0);
    price("preview", 0);
    price("singleton", 300);
    price("unrelated", 0);
    const entries = [
      entry("selected", 2, "mainboard", "foil"),
      entry("selected", 1, "commander"),
      entry("singleton", 3, "sideboard"),
      entry("selected", 1, "companion", "foil"),
      entry("selected", 999, "maybeboard"),
    ];
    const request: DeckCostRequest = {
      entries,
      providers: ["cardmarket"],
      currency: "EUR",
      rates: null,
    };
    const read = createDeckCostQuery(database);
    const result = read(request, visibility);
    assert.equal(result.quantity, 7);
    assert.equal(result.current.amount, 47);
    assert.equal(result.cheapest.amount, 13);
    assert.equal(result.current.pricedQuantity, 7);
    assert.equal(result.cheapest.pricedQuantity, 7);
    assert.equal(result.current.priceDate, "2026-09-20");
    assert.equal(result.cheapest.rateDate, null);
    assert.equal(result.cheapest.missingRates, false);
    assert.deepEqual(request.entries, entries, "calculating cost never replaces deck entries");
    assert.ok(
      parseCatalogQueryWorkerRequest({
        id: 1,
        operation: { type: "deck-cost", request, visibility },
      }),
    );
    assert.ok(
      parseCatalogQueryWorkerResponse({ id: 1, operation: "deck-cost", result }, "deck-cost"),
    );
    assert.equal(
      DeckCostRequestSchema.safeParse({ ...request, entries: [{ ...entries[0], quantity: -1 }] })
        .success,
      false,
    );

    const convertedRequest: DeckCostRequest = {
      ...request,
      providers: ["cardmarket", "tcgplayer"],
      rates: {
        fetchedAt: "2026-09-20T00:00:00Z",
        rates: [{ base: "EUR", quote: "USD", rate: 2, date: "2026-09-18" }],
      },
    };
    const converted = read(convertedRequest, visibility);
    assert.equal(converted.cheapest.amount, 10);
    assert.equal(converted.cheapest.rateDate, "2026-09-18");
    assert.match(deckCostMetrics(converted)[1]!.value, /^≈ /);
    const missingRates = read({ ...convertedRequest, rates: null }, visibility);
    assert.equal(missingRates.cheapest.amount, 13);
    assert.equal(missingRates.cheapest.missingRates, true);
    assert.equal(missingRates.current.missingRates, false);
    const foreignOnly = read({ ...request, providers: ["tcgplayer"] }, visibility);
    assert.equal(foreignOnly.cheapest.pricedQuantity, 0);
    assert.equal(foreignOnly.cheapest.missingRates, true);

    const missing = read(
      { ...request, entries: [entry("unpriced", 2), entry("missing", 4), entry("singleton", 1)] },
      visibility,
    );
    assert.equal(missing.quantity, 7);
    assert.equal(missing.current.amount, 3);
    assert.equal(missing.current.pricedQuantity, 1);
    assert.equal(missing.cheapest.amount, 5);
    assert.equal(missing.cheapest.pricedQuantity, 3);
    assert.match(deckCostMetrics(missing)[0]!.value, /partial/);
    assert.equal(deckCostMetrics(missing)[1]!.coverage, "Prices for 3 of 7 copies");
    assert.equal(
      read({ ...request, entries: [entry("selected", 1, "mainboard", "glossy")] }, visibility)
        .current.pricedQuantity,
      0,
    );
    const disabled = read({ ...request, providers: [] }, visibility);
    assert.equal(disabled.cheapest.pricedQuantity, 0);
    assert.equal(deckCostMetrics(disabled)[0]!.value, "Unavailable");
    const empty = read({ ...request, entries: [entry("selected", 1, "maybeboard")] }, visibility);
    assert.equal(empty.quantity, 0);
    assert.equal(empty.current.amount, 0);
    assert.equal(deckCostMetrics(empty)[0]!.coverage, null);
    assert.doesNotMatch(deckCostMetrics(empty)[0]!.value, /Unavailable|partial/);

    const protectedEntry = read(
      { ...request, entries: [entry("preview", 1), entry("digital", 1)] },
      visibility,
    );
    assert.equal(protectedEntry.current.pricedQuantity, 0);
    assert.equal(protectedEntry.cheapest.pricedQuantity, 0);
    const revealed = read(request, { ...visibility, revealedPrintingIds: ["preview"] });
    assert.equal(revealed.cheapest.amount, 9, "a revealed free printing is a valid zero price");
    assert.equal(revealed.cheapest.pricedQuantity, 7);
    prices.prepare("UPDATE prices SET amount_minor = 400 WHERE printing_id = 'singleton'").run();
    assert.equal(read(request, visibility).current.amount, 50, "a price refresh changes the total");
  } finally {
    database.close();
    prices.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function entry(
  printingId: string,
  quantity: number,
  section: DeckEntry["section"] = "mainboard",
  finish: DeckEntry["finish"] = "nonfoil",
): DeckEntry {
  return { id: `${printingId}-${section}-${finish}`, printingId, quantity, section, finish };
}

function card(
  id: string,
  oracle_id?: string,
  overrides: Partial<ScryfallCardDownload> = {},
): ScryfallCardDownload {
  return {
    id,
    oracle_id,
    name: "Same name",
    collector_number: "1",
    object: "card",
    rarity: "common",
    set: "tst",
    set_id: "set-tst",
    set_name: "Test",
    type_line: "Artifact",
    ...overrides,
  };
}
