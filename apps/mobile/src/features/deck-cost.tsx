import { deckCostMetrics, deckCostScope } from "@mooligan/presentation/deck-cost";
import type { DeckEntry } from "@mooligan/workspace/deck-contract";

import { Button, Copy, Panel } from "@/components/ui";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";

export function DeckCost({ entries }: { entries: readonly DeckEntry[] }) {
  const { providers, currency, rates } = useWorkspace();
  const request = { entries: [...entries], providers, currency, rates };
  const result = useCatalogQuery(
    ["deck-cost", JSON.stringify(request)],
    ({ catalog, visibility }) => catalog.deckCost(request, visibility),
  );
  return (
    <Panel>
      <Copy title="Deck cost">{deckCostScope}</Copy>
      {!providers.length ? (
        <Copy>Enable a price provider in Settings to see deck cost.</Copy>
      ) : result.isPending ? (
        <Copy>Calculating deck cost…</Copy>
      ) : result.isError ? (
        <>
          <Copy>Deck cost could not be read.</Copy>
          <Button
            quiet
            label="Retry deck cost"
            onPress={async () => {
              await result.refetch();
            }}
          />
        </>
      ) : (
        deckCostMetrics(result.data).map((metric) => (
          <Copy key={metric.label} title={`${metric.label}: ${metric.value}`}>
            {metric.coverage ? `${metric.coverage}. ` : ""}
            {metric.description}
          </Copy>
        ))
      )}
    </Panel>
  );
}
