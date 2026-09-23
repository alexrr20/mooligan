import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeckCost } from "@mooligan/domain/deck-cost";
import { deckCostMetrics } from "../src/deck-cost.ts";

void test("cost labels distinguish partial, unavailable, converted and empty totals", () => {
  const total = {
    amount: 3,
    pricedQuantity: 1,
    priceDate: "2026-09-20",
    rateDate: null,
    missingRates: false,
  };
  const cost: DeckCost = {
    currency: "EUR",
    quantity: 7,
    current: total,
    cheapest: { ...total, amount: 5, pricedQuantity: 3, rateDate: "2026-09-18" },
  };
  const metrics = deckCostMetrics(cost);
  assert.match(metrics[0]!.value, /partial/u);
  assert.match(metrics[1]!.value, /^≈ /u);
  assert.equal(metrics[1]!.coverage, "Prices for 3 of 7 copies");
  assert.match(metrics[1]!.description, /exchange rates from 2026-09-18/u);
  const unavailable = { ...total, amount: 0, pricedQuantity: 0, missingRates: true };
  const disabled = deckCostMetrics({ ...cost, current: unavailable, cheapest: unavailable });
  assert.equal(disabled[0]!.value, "Unavailable");
  assert.match(disabled[0]!.description, /could not be converted/u);
  const empty = deckCostMetrics({ ...cost, quantity: 0, current: unavailable });
  assert.equal(empty[0]!.coverage, null);
  assert.doesNotMatch(empty[0]!.value, /Unavailable|partial/u);
});
