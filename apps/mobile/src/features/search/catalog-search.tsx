import { useDeferredValue, useState } from "react";
import type { CatalogCardSummary, CatalogListRequest } from "@mooligan/domain/catalog-search";
import { Button, Choice, Copy, Field, Panel, Row } from "@/components/ui";
import { CardRow } from "@/components/cards";
import { ResultsLayout } from "@/components/results-layout";
import { useCatalogQuery } from "@/workspace/provider";

export function CatalogSearch({ onSelect }: { onSelect?: (card: CatalogCardSummary) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CatalogListRequest>({
    uniqueCards: true,
    includeDigital: false,
    includeTokens: false,
    includeArtSeries: false,
    includeAdCards: false,
  });
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState(false);
  const deferred = useDeferredValue(query);
  const result = useCatalogQuery(
    ["search", deferred, JSON.stringify(options), offset],
    ({ catalog, visibility }) =>
      catalog.list({ ...options, query: deferred, limit: 40, offset }, visibility),
  );
  function update(next: CatalogListRequest) {
    setOptions(next);
    setOffset(0);
  }
  return (
    <>
      <Field
        label="Search cards"
        placeholder="Name, t:creature, c:g, mv<=3…"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setOffset(0);
        }}
        autoCapitalize="none"
        maxLength={500}
        returnKeyType="search"
      />
      <Button
        quiet
        label={filters ? "Hide filters" : "Search filters"}
        onPress={() => setFilters(!filters)}
      />
      {filters && (
        <Panel>
          <Choice
            label="Printings"
            value={options.uniqueCards ? "cards" : "printings"}
            options={[
              { label: "One printing per card", value: "cards" },
              { label: "All printings", value: "printings" },
            ]}
            onChange={(value) => update({ ...options, uniqueCards: value === "cards" })}
          />
          <Choice
            label="Universe"
            value={options.universe ?? "all"}
            options={[
              { value: "all", label: "All cards" },
              { value: "within", label: "Universes Within" },
              { value: "beyond", label: "Universes Beyond" },
            ]}
            onChange={(value) =>
              update({ ...options, universe: value === "all" ? undefined : value })
            }
          />
          {(
            [
              ["includeDigital", "Digital cards"],
              ["includeTokens", "Tokens"],
              ["includeArtSeries", "Art series"],
              ["includeAdCards", "Ad cards"],
            ] as const
          ).map(([key, label]) => (
            <Choice
              key={key}
              label={label}
              value={options[key] ? "show" : "hide"}
              options={[
                { value: "hide", label: "Hide" },
                { value: "show", label: "Show" },
              ]}
              onChange={(value) => update({ ...options, [key]: value === "show" })}
            />
          ))}
        </Panel>
      )}
      {result.isPending && <Copy>Searching…</Copy>}
      {result.error && <Copy>{result.error.message}</Copy>}
      {result.data?.queryError && <Copy>{result.data.queryError}</Copy>}
      <ResultsLayout preference="search">
        {result.data?.cards.map((card) => (
          <CardRow
            key={card.id}
            printingId={card.id}
            name={card.name}
            detail={`${card.setName} · #${card.collectorNumber}`}
            image={card.image}
            gridImage={card.gridImage}
            onPress={onSelect ? () => onSelect(card) : undefined}
          />
        ))}
      </ResultsLayout>
      {result.data && !result.data.cards.length && !result.data.queryError && (
        <Copy>No matching cards in the local catalog.</Copy>
      )}
      <Row>
        <Button
          quiet
          label="Previous"
          disabled={offset === 0}
          onPress={() => setOffset(Math.max(0, offset - 40))}
        />
        <Copy>Page {offset / 40 + 1}</Copy>
        <Button
          quiet
          label="Next"
          disabled={!result.data?.hasMore}
          onPress={() => setOffset(offset + 40)}
        />
      </Row>
    </>
  );
}
