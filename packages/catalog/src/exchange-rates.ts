import type { CatalogDatabase as DatabaseSync } from "./database.ts";
import { ExchangeRatesSchema, type ExchangeRates } from "@mooligan/domain/market";
import { readPriceMetadata } from "@mooligan/catalog/prices";

export async function updateExchangeRates(database: DatabaseSync): Promise<ExchangeRates | null> {
  const saved = readPriceMetadata(database, "exchange_rates");
  const cached = saved ? ExchangeRatesSchema.parse(JSON.parse(saved)) : null;
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 86_400_000) return cached;
  try {
    const response = await fetch(
      "https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,GBP,CAD,AUD,JPY,CHF&providers=ecb",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error("Exchange rates unavailable");
    const snapshot = ExchangeRatesSchema.parse({
      fetchedAt: new Date().toISOString(),
      rates: await response.json(),
    });
    if (
      !["USD", "GBP", "CAD", "AUD", "JPY", "CHF"].every((currency) =>
        snapshot.rates.some(({ quote }) => quote === currency),
      )
    )
      throw new Error("Incomplete exchange rates");
    database
      .prepare("INSERT OR REPLACE INTO price_meta (key, value) VALUES ('exchange_rates', ?)")
      .run(JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return cached;
  }
}
