import assert from "node:assert/strict";
import { test } from "node:test";
import { openPriceDatabase } from "../electron/prices/database.ts";
import { updateExchangeRates } from "@mooligan/catalog/exchange-rates";

void test("exchange rates persist and retain their last good snapshot on network failure", async (context) => {
  const database = openPriceDatabase(":memory:");
  const rates = ["USD", "GBP", "CAD", "AUD", "JPY", "CHF"].map((quote) => ({
    base: "EUR",
    quote,
    rate: 2,
    date: "2026-09-10",
  }));
  const request = context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(rates)),
  );
  try {
    const saved = await updateExchangeRates(database);
    assert.deepEqual(saved?.rates, rates);
    assert.deepEqual(await updateExchangeRates(database), saved);
    assert.equal(request.mock.callCount(), 1);
    const old = { ...saved, fetchedAt: "2020-01-01T00:00:00Z" };
    database
      .prepare("UPDATE price_meta SET value = ? WHERE key = 'exchange_rates'")
      .run(JSON.stringify(old));
    request.mock.mockImplementation(async () => {
      throw new Error("offline");
    });
    assert.deepEqual(await updateExchangeRates(database), old);
    database.exec("DELETE FROM price_meta");
    assert.equal(await updateExchangeRates(database), null);
  } finally {
    database.close();
  }
});
