import assert from "node:assert/strict";
import { test } from "node:test";
import type { MarketPrice, ExchangeRates } from "@mooligan/domain/market";
import { lowestRetailPrice } from "@mooligan/catalog/lowest-prices";

void test("cheapest market uses converted values, matching finish, and available rates", () => {
  const price = (
    market: string,
    amountMinor: number,
    currency = "USD",
    finish: MarketPrice["finish"] = "nonfoil",
    kind: MarketPrice["kind"] = "retail",
  ): MarketPrice => ({
    supplier: "mtgjson",
    market,
    money: { amountMinor, currency },
    finish,
    kind,
    priceDate: "2026-09-10",
  });
  const rates: ExchangeRates = {
    fetchedAt: "2026-09-11T00:00:00Z",
    rates: [
      { base: "EUR", quote: "USD", rate: 2, date: "2026-09-10" },
      { base: "EUR", quote: "JPY", rate: 100, date: "2026-09-10" },
    ],
  };
  const prices = [
    price("tcgplayer", 500),
    price("cardmarket", 400, "EUR"),
    price("cardkingdom", 1),
    price("tcgplayer", 0, "USD", "foil"),
    price("tcgplayer", 1, "USD", "nonfoil", "buylist"),
  ];
  const enabled = ["tcgplayer", "cardmarket"];
  assert.equal(lowestRetailPrice(prices, enabled, "EUR", rates, "nonfoil").lowest?.amount, 2.5);
  assert.equal(lowestRetailPrice(prices, enabled, "JPY", rates, "nonfoil").lowest?.amount, 250);
  assert.equal(lowestRetailPrice(prices, enabled, "EUR", rates).lowest?.amount, 0);
  assert.equal(lowestRetailPrice(prices, [], "EUR", rates).lowest, null);
  assert.equal(lowestRetailPrice(prices, enabled, "EUR", rates, "glossy").lowest, null);
  const partial = lowestRetailPrice(prices, enabled, "EUR", null, "nonfoil");
  assert.equal(partial.lowest?.amount, 4);
  assert.equal(partial.missingRates, true);
  assert.equal(
    lowestRetailPrice([price("tcgplayer", 100, "JPY")], enabled, "USD", rates).lowest?.amount,
    2,
  );
});
