import { ResultsLayout } from "@/components/results-layout";
import { useMobileAccount } from "@/account/account-provider";
import { useDeferredValue, useState } from "react";
import { router } from "expo-router";
import type { CatalogCardSummary, CatalogListRequest } from "@mooligan/domain/catalog-search";
import { Button, Choice, Copy, Field, Panel, Row, Screen } from "@/components/ui";
import { CardRow } from "@/components/cards";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";

export function CatalogSetup() {
  const { reference, snapshot, busy, progress, error } = useWorkspace();
  return (
    <Panel>
      <Copy title={snapshot ? "Offline catalog" : "Bring your cards offline"}>
        {snapshot
          ? `${snapshot.cardCount.toLocaleString()} printings · ${snapshot.updatedAt.slice(0, 10)}`
          : "Download the card catalog once to search cards, build decks, and manage your collection without a connection. Card images are saved as you view them."}
      </Copy>
      {progress && <Copy>{progress}</Copy>}
      {error && <Copy>{error}</Copy>}
      <Button
        disabled={busy}
        label={snapshot ? "Update catalog" : "Download card catalog"}
        onPress={() => reference.updateCatalog()}
      />
    </Panel>
  );
}
export default function SearchScreen() {
  const { snapshot } = useWorkspace();
  const { auth, runtime } = useMobileAccount();
  const hasProfile =
    auth.status === "signed-in" &&
    runtime.workspaces.some((w) => w.active && w.accountAssociation === "account");
  return (
    <Screen>
      <Copy title="Find your next card.">Search your offline Magic catalog.</Copy>
      <Row>
        <Button quiet label="Upcoming releases" onPress={() => router.push("/sets")} />
        {hasProfile && <Button quiet label="Profile" onPress={() => router.push("/profile")} />}
      </Row>
      {!snapshot && <CatalogSetup />}
      {snapshot && <CatalogSearch />}
    </Screen>
  );
}
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
