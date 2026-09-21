import type { Finish } from "@mooligan/domain/catalog";
import type { ExchangeRates, MarketPrice } from "@mooligan/domain/market";

export function lowestRetailPrice(
  prices: readonly MarketPrice[],
  providers: readonly string[],
  currency: string,
  rates: ExchangeRates | null | undefined,
  finish?: Finish,
) {
  let lowest: { price: MarketPrice; amount: number; rateDate?: string } | null = null;
  let missingRates = false;
  const rateFor = (code: string) =>
    code === "EUR" ? { rate: 1, date: "" } : rates?.rates.find(({ quote }) => quote === code);
  for (const price of prices) {
    if (price.kind !== "retail" || !providers.includes(price.market)) continue;
    if (finish && price.finish !== finish) continue;
    const digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: price.money.currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    let amount = price.money.amountMinor / 10 ** digits;
    let rateDate: string | undefined;
    if (price.money.currency !== currency) {
      const source = rateFor(price.money.currency);
      const target = rateFor(currency);
      if (!source || !target) {
        missingRates = true;
        continue;
      }
      amount *= target.rate / source.rate;
      rateDate = [source.date, target.date].filter(Boolean).sort()[0];
    }
    if (!lowest || amount < lowest.amount) lowest = { price, amount, rateDate };
  }
  return { lowest, missingRates };
}
