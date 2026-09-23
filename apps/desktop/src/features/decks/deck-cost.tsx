import { deckCostMetrics, deckCostScope } from "@mooligan/catalog/deck-cost-summary";
import type { DeckEntry } from "@mooligan/workspace/deck-contract";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { usePriceProviders } from "../prices/use-price-providers";
import { spoilerCatalogCacheKey, useSpoilerState } from "../spoilers/use-spoilers";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";

export function DeckCost({ entries }: { entries: readonly DeckEntry[] }) {
  const { enabledProviders: providers, currency } = usePriceProviders();
  const store = useWorkspaceLiveStore();
  const { state: spoilers } = useSpoilerState();
  const rates = useQuery({
    queryKey: ["prices", "exchange-rates"],
    queryFn: () => window.prices.exchangeRates(),
    enabled: providers.length > 0 && entries.length > 0,
    staleTime: 3_600_000,
  });
  const request = { entries: [...entries], providers, currency, rates: rates.data ?? null };
  const result = useQuery({
    queryKey: ["catalog", "deck-cost", store.storeId, spoilerCatalogCacheKey(spoilers), request],
    queryFn: () => window.catalog.deckCost(request),
    enabled: providers.length > 0 && (!entries.length || !rates.isPending),
    staleTime: Infinity,
  });

  return (
    <section aria-label="Deck cost" {...stylex.props(styles.cost)}>
      {!providers.length ? (
        <p {...stylex.props(styles.note)}>Enable a price provider in Settings to see deck cost</p>
      ) : result.isPending ? (
        <p role="status" {...stylex.props(styles.note)}>
          Pricing…
        </p>
      ) : result.isError ? (
        <p role="alert" {...stylex.props(styles.note)}>
          Deck cost could not be read.{" "}
          <Button size="xs" variant="ghost" onClick={() => void result.refetch()}>
            Retry
          </Button>
        </p>
      ) : (
        deckCostMetrics(result.data).map((metric, index) => (
          <Tooltip key={metric.label}>
            <TooltipTrigger
              aria-label={`${metric.label}: ${metric.value}`}
              {...stylex.props(styles.metric)}
            >
              <span {...stylex.props(styles.amount)}>{metric.value}</span>
              {index ? "cheapest" : "current"}
            </TooltipTrigger>
            <TooltipContent>
              <strong>{metric.label}.</strong> {metric.description}{" "}
              {metric.coverage ? `${metric.coverage}. ` : null}
              {deckCostScope}
            </TooltipContent>
          </Tooltip>
        ))
      )}
    </section>
  );
}

const styles = stylex.create({
  cost: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "8px 24px" },
  metric: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "6px",
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: "2px",
    color: "#a6a89d",
    font: "inherit",
    fontSize: "13px",
    cursor: "help",
    fontVariantNumeric: "tabular-nums",
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "4px" },
  },
  amount: { color: "#f4f1e8" },
  note: { margin: 0, color: "#a6a89d", fontSize: "13px" },
});
