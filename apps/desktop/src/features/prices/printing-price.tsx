import type { Finish } from "@mooligan/domain/catalog";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import cardkingdom from "../../assets/markets/cardkingdom.png";
import cardmarket from "../../assets/markets/cardmarket.png";
import cardsphere from "../../assets/markets/cardsphere.svg";
import manapool from "../../assets/markets/manapool.svg";
import tcgplayer from "../../assets/markets/tcgplayer.ico";
import { lowestRetailPrice } from "@mooligan/catalog/lowest-prices";
import { priceProviderLabels, priceProviders } from "@mooligan/domain/market";

import { usePriceProviders } from "./use-price-providers";

const marketLogos = { cardkingdom, cardmarket, cardsphere, manapool, tcgplayer };

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
  const market = priceProviders.find((provider) => provider === lowest?.price.market);
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
          {...stylex.props(styles.value)}
          title={`${market ? priceProviderLabels[market] : lowest.price.market} · ${lowest.price.finish} · ${lowest.price.priceDate} · Retail reference per copy${converted ? ` · Converted from ${lowest.price.money.currency} using ECB rates dated ${lowest.rateDate}` : ""}`}
        >
          <span>
            {!finish ? "From " : ""}
            {converted ? "≈ " : ""}
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency,
              currencyDisplay: "narrowSymbol",
            }).format(lowest.amount)}
          </span>
          {market ? (
            <img
              src={marketLogos[market]}
              alt={priceProviderLabels[market]}
              title={priceProviderLabels[market]}
              width={16}
              height={16}
              {...stylex.props(styles.logo)}
            />
          ) : null}
          {stale ? <span {...stylex.props(styles.source)}>Stale</span> : null}
        </span>
      )}
      {lowest && missingRates && !rates.isPending ? (
        <span {...stylex.props(styles.source)}>Some markets could not be converted</span>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  value: { display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: "6px" },
  logo: { objectFit: "contain", flexShrink: 0 },
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
