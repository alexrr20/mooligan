import type { Finish } from "@mooligan/domain/catalog";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { lowestRetailPrice } from "./lowest-prices";
import { priceProviders, usePriceProviders } from "./use-price-providers";

export function PrintingPrice({ printingId, finish }: { printingId: string; finish?: Finish }) {
  const { enabledProviders, currency } = usePriceProviders();
  const result = useQuery({
    queryKey: ["catalog", "prices", printingId],
    queryFn: () => window.prices.printing(printingId),
    enabled: enabledProviders.length > 0,
    staleTime: Infinity,
  });
  const needsRates =
    result.data?.prices.some(
      (price) =>
        price.kind === "retail" &&
        enabledProviders.some((provider) => provider === price.market) &&
        (!finish || price.finish === finish) &&
        price.money.currency !== currency,
    ) ?? false;
  const rates = useQuery({
    queryKey: ["prices", "exchange-rates"],
    queryFn: () => window.prices.exchangeRates(),
    enabled: needsRates,
    staleTime: 3_600_000,
  });
  if (!enabledProviders.length) return null;
  const { lowest, missingRates } = lowestRetailPrice(
    result.data?.prices ?? [],
    enabledProviders,
    currency,
    rates.data,
    finish,
  );
  const market = lowest
    ? (priceProviders.find(({ id }) => id === lowest.price.market)?.name ?? lowest.price.market)
    : "";
  const converted = lowest && lowest.price.money.currency !== currency;
  const stale =
    lowest &&
    (Date.now() - Date.parse(lowest.price.priceDate) > 2 * 86_400_000 ||
      (lowest.rateDate && Date.now() - Date.parse(lowest.rateDate) > 4 * 86_400_000));
  return (
    <span {...stylex.props(styles.prices)} data-printing-price={printingId}>
      {result.isPending || (needsRates && rates.isPending) ? (
        "Loading price…"
      ) : result.isError ? (
        "Price could not be read"
      ) : !lowest ? (
        missingRates ? (
          "Exchange rates unavailable"
        ) : (
          "Price unavailable"
        )
      ) : (
        <span
          title={`${market} · ${lowest.price.finish} · ${lowest.price.priceDate} · Retail reference per copy${converted ? ` · Converted from ${lowest.price.money.currency} using ECB rates dated ${lowest.rateDate}` : ""}`}
        >
          {!finish ? "From " : ""}
          {converted ? "≈ " : ""}
          {new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            currencyDisplay: "code",
          }).format(lowest.amount)}
          <span {...stylex.props(styles.source)}>
            {" "}
            · {market}
            {stale ? " · Stale" : ""}
          </span>
        </span>
      )}
      {lowest && missingRates && !rates.isPending ? (
        <span {...stylex.props(styles.source)}>Some markets could not be converted</span>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  prices: {
    display: "grid",
    gap: "3px",
    marginTop: "6px",
    color: "#c6c8bd",
    fontSize: "12px",
    lineHeight: 1.5,
    fontVariantNumeric: "tabular-nums",
  },
  source: { color: "#989b92", fontSize: "11px" },
});
