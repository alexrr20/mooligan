import * as z from "zod";
import { finishLabels } from "@mooligan/domain/catalog";
import { priceProviderLabels, type MarketPrice, type PriceProvider } from "@mooligan/domain/market";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { PriceUpdateControl } from "./price-updates";
import { usePriceProviders } from "./use-price-providers";
import { Link } from "@tanstack/react-router";

export function PrintingPrices({ printingId }: { printingId: string }) {
  const { enabledProviders } = usePriceProviders();
  const result = useQuery({
    // Catalog prefix makes spoiler changes clear these cached, printing-specific results too.
    queryKey: ["catalog", "prices", printingId],
    queryFn: () => window.prices.printing(printingId),
  });
  const groups = new Map<
    string,
    {
      market: PriceProvider;
      finish: MarketPrice["finish"];
      retail?: MarketPrice;
      buylist?: MarketPrice;
    }
  >();
  for (const price of result.data?.prices ?? []) {
    const market = enabledProviders.find((provider) => provider === price.market);
    if (!market) continue;
    const key = `${market}:${price.finish}:${price.money.currency}`;
    const group = groups.get(key) ?? { market, finish: price.finish };
    group[price.kind] = price;
    groups.set(key, group);
  }

  return (
    <section aria-labelledby="printing-prices-heading">
      <h2 {...stylex.props(styles.title)} id="printing-prices-heading">
        Paper prices
      </h2>
      <p {...stylex.props(styles.copy)}>
        Estimates supplied by MTGJSON. Retail is the buying reference; buylist is the selling
        reference. These prices do not adjust for your copies’ condition or language.
      </p>
      {!enabledProviders.length ? (
        <p {...stylex.props(styles.empty)}>
          All price providers are disabled. <Link to="/settings">Choose providers in Settings</Link>
          .
        </p>
      ) : result.isPending ? (
        <p {...stylex.props(styles.empty)} role="status">
          Reading saved prices…
        </p>
      ) : result.isError ? (
        <p {...stylex.props(styles.empty)} role="alert">
          Saved prices could not be read.
        </p>
      ) : !groups.size ? (
        <p {...stylex.props(styles.empty)}>
          No saved prices from your enabled providers are available for this printing.
        </p>
      ) : (
        <div {...stylex.props(styles.scroll)}>
          <table {...stylex.props(styles.table)}>
            <caption {...stylex.props(styles.caption)}>
              Prices for this exact printing, by market and finish
            </caption>
            <thead>
              <tr>
                <th {...stylex.props(styles.heading)} scope="col">
                  Market
                </th>
                <th {...stylex.props(styles.heading)} scope="col">
                  Finish
                </th>
                <th {...stylex.props(styles.heading)} scope="col">
                  Retail
                </th>
                <th {...stylex.props(styles.heading)} scope="col">
                  Buylist
                </th>
              </tr>
            </thead>
            <tbody>
              {[...groups].map(([key, group]) => (
                <tr key={key}>
                  <th {...stylex.props(styles.cell, styles.market)} scope="row">
                    {priceProviderLabels[group.market]}
                  </th>
                  <td {...stylex.props(styles.cell)}>{finishLabels[group.finish]}</td>
                  <td {...stylex.props(styles.cell)}>
                    <PriceValue price={group.retail} />
                  </td>
                  <td {...stylex.props(styles.cell)}>
                    <PriceValue price={group.buylist} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PriceUpdateControl />
    </section>
  );
}

function PriceValue({ price }: { price: MarketPrice | undefined }) {
  if (!price) return <span {...stylex.props(styles.date)}>Unavailable</span>;
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: price.money.currency,
    currencyDisplay: "code",
  });
  const digits = z.number().parse(formatter.resolvedOptions().maximumFractionDigits);
  const stale = Date.now() - Date.parse(price.priceDate) > 2 * 86_400_000;
  return (
    <span {...stylex.props(styles.value)}>
      <span>{formatter.format(price.money.amountMinor / 10 ** digits)}</span>
      <span {...stylex.props(styles.date, stale && styles.stale)}>
        {price.priceDate}
        {stale ? " · Stale" : ""}
      </span>
    </span>
  );
}

const styles = stylex.create({
  title: { margin: "0 0 12px", color: "#dedfd5", fontSize: "16px", fontWeight: 500 },
  copy: { margin: 0, color: "#989b92", fontSize: "13px", lineHeight: 1.6 },
  empty: { marginBlock: "24px", color: "#989b92", fontSize: "14px" },
  scroll: { overflowX: "auto", marginTop: "24px" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" },
  caption: { textAlign: "left", fontSize: "12px", color: "#85887f", paddingBottom: "12px" },
  heading: {
    padding: "10px 12px",
    color: "#989b92",
    fontSize: "12px",
    fontWeight: 400,
    borderBottom: "1px solid #30322e",
  },
  cell: {
    padding: "14px 12px",
    color: "#c6c8bd",
    borderBottom: "1px solid #20221f",
    whiteSpace: "nowrap",
  },
  market: { fontWeight: 500, color: "#f4f1e8" },
  value: { display: "grid", gap: "5px", fontVariantNumeric: "tabular-nums" },
  date: { color: "#85887f", fontSize: "11px" },
  stale: { color: "#dec26d" },
});
