import { deckCostMetrics, deckCostScope } from "@mooligan/catalog/deck-cost-summary";
import type { DeckEntry } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { usePriceProviders } from "../prices/use-price-providers";
import { spoilerCatalogCacheKey, useSpoilerState } from "../spoilers/use-spoilers";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";

export function DeckCost({ entries }: { entries: DeckEntry[] }) {
  const { enabledProviders: providers, currency } = usePriceProviders();
  const store = useWorkspaceLiveStore();
  const { state: spoilers } = useSpoilerState();
  const rates = useQuery({
    queryKey: ["prices", "exchange-rates"],
    queryFn: () => window.prices.exchangeRates(),
    enabled: providers.length > 0 && entries.length > 0,
    staleTime: 3_600_000,
  });
  const request = { entries, providers, currency, rates: rates.data ?? null };
  const result = useQuery({
    queryKey: ["catalog", "deck-cost", store.storeId, spoilerCatalogCacheKey(spoilers), request],
    queryFn: () => window.catalog.deckCost(request),
    enabled: providers.length > 0 && (!entries.length || !rates.isPending),
    staleTime: Infinity,
  });

  return (
    <section aria-label="Deck cost" {...stylex.props(styles.cost)}>
      {!providers.length ? (
        <p {...stylex.props(styles.note)}>Enable a price provider in Settings to see deck cost.</p>
      ) : result.isPending ? (
        <p role="status" {...stylex.props(styles.note)}>
          Calculating deck cost…
        </p>
      ) : result.isError ? (
        <p role="alert" {...stylex.props(styles.note)}>
          Deck cost could not be read.{" "}
          <Button size="sm" variant="secondary" onClick={() => void result.refetch()}>
            Retry
          </Button>
        </p>
      ) : (
        <>
          <div {...stylex.props(styles.metrics)}>
            {deckCostMetrics(result.data).map((metric) => (
              <Tooltip key={metric.label}>
                <TooltipTrigger {...stylex.props(styles.metric)}>
                  <span {...stylex.props(styles.label)}>
                    {metric.label} <span aria-hidden="true">ⓘ</span>
                  </span>
                  <span {...stylex.props(styles.amount)}>{metric.value}</span>
                  {metric.coverage ? (
                    <span {...stylex.props(styles.note)}>{metric.coverage}</span>
                  ) : null}
                </TooltipTrigger>
                <TooltipContent>{metric.description}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <p {...stylex.props(styles.note)}>
            {deckCostScope}{" "}
            {result.data.current.missingRates || result.data.cheapest.missingRates
              ? "Some market prices could not be converted."
              : null}
          </p>
        </>
      )}
    </section>
  );
}

const styles = stylex.create({
  cost: { display: "grid", gap: "10px", paddingBlock: "12px", borderBlock: "1px solid #252721" },
  metrics: { display: "flex", flexWrap: "wrap", gap: "16px 40px" },
  metric: {
    display: "grid",
    gap: "4px",
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: "2px",
    color: "#f4f1e8",
    font: "inherit",
    textAlign: "left",
    cursor: "help",
    fontVariantNumeric: "tabular-nums",
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "4px" },
  },
  label: { color: "#a6a89d", fontSize: "12px" },
  amount: { fontSize: "20px", fontWeight: 500, lineHeight: 1.4 },
  note: { margin: 0, color: "#a6a89d", fontSize: "12px", lineHeight: 1.5 },
});
