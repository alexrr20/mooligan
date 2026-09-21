import { ResultsLayout } from "@/components/results-layout";
import { useDeferredValue, useState } from "react";
import type { CollectionHolding, CollectionListRequest } from "@mooligan/domain/collection";
import { cardConditions, cardLanguages } from "@mooligan/domain/collection";
import { Button, Choice, Copy, Field, Panel, Row, Screen, confirmRemoval } from "@/components/ui";
import { CardRow } from "@/components/cards";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";
import { router } from "expo-router";

export const finishes = [
  { value: "nonfoil", label: "Nonfoil" },
  { value: "foil", label: "Foil" },
  { value: "etched", label: "Etched" },
  { value: "glossy", label: "Glossy" },
] as const;
export default function CollectionScreen() {
  const { lots } = useWorkspace();
  const [request, setRequest] = useState<CollectionListRequest>({ sort: "name" });
  const deferred = useDeferredValue(request);
  const [selected, setSelected] = useState<CollectionHolding | null>(null);
  const [filters, setFilters] = useState(false);
  const result = useCatalogQuery(
    ["collection", JSON.stringify(deferred), JSON.stringify(lots)],
    ({ catalog, visibility, lots }) => {
      catalog.project(lots);
      return catalog.collection({ ...deferred, limit: 40 }, visibility);
    },
  );
  function filter(next: CollectionListRequest) {
    setRequest({ ...next, offset: 0 });
    setSelected(null);
  }
  return (
    <Screen>
      <Copy title="Your collection">
        {result.data
          ? `${result.data.total.copies} ${result.data.total.copies === 1 ? "copy" : "copies"} · ${result.data.total.cards} ${result.data.total.cards === 1 ? "card" : "cards"}`
          : `${lots.reduce((sum, lot) => sum + lot.quantity, 0)} copies saved locally`}
      </Copy>
      <Button label="Add cards" onPress={() => router.push("/")} />
      <Field
        label="Search collection"
        value={request.query ?? ""}
        onChangeText={(query) => filter({ ...request, query })}
      />
      <Button
        quiet
        label={filters ? "Hide filters" : "Filter and sort"}
        onPress={() => setFilters(!filters)}
      />
      {filters && (
        <Panel>
          <Choice
            label="Sort"
            value={request.sort ?? "name"}
            options={[
              { value: "name", label: "Name" },
              { value: "set", label: "Set" },
              { value: "quantity", label: "Quantity" },
            ]}
            onChange={(sort) => filter({ ...request, sort })}
          />
          <Choice
            label="Set"
            value={request.setCode ?? "all"}
            options={[
              { value: "all", label: "All sets" },
              ...(result.data?.sets.map((set) => ({ value: set.code, label: set.name })) ?? []),
            ]}
            onChange={(setCode) =>
              filter({ ...request, setCode: setCode === "all" ? undefined : setCode })
            }
          />
          <Choice
            label="Finish"
            value={request.finish ?? "all"}
            options={[{ value: "all", label: "All finishes" }, ...finishes]}
            onChange={(finish) =>
              filter({ ...request, finish: finish === "all" ? undefined : finish })
            }
          />
          <Choice
            label="Language"
            value={request.language ?? "all"}
            options={[{ value: "all", label: "All languages" }, ...cardLanguages]}
            onChange={(language) =>
              filter({ ...request, language: language === "all" ? undefined : language })
            }
          />
          <Choice
            label="Condition"
            value={request.condition ?? "all"}
            options={[{ value: "all", label: "All conditions" }, ...cardConditions]}
            onChange={(condition) =>
              filter({ ...request, condition: condition === "all" ? undefined : condition })
            }
          />
        </Panel>
      )}
      {result.error && <Copy>{result.error.message}</Copy>}
      <ResultsLayout preference="collection">
        {result.data?.holdings.map((holding, index) => (
          <Panel key={index}>
            {holding.status === "visible" ? (
              <CardRow
                printingId={holding.printingId}
                name={holding.name}
                detail={`${holding.setCode.toUpperCase()} #${holding.collectorNumber} · ${holding.finish} · ${holding.language} · ${holding.condition}`}
                image={holding.image}
                gridImage={holding.gridImage}
                quantity={holding.quantity}
                finish={holding.finish}
              />
            ) : (
              <Copy title={holding.label}>{holding.quantity} copies</Copy>
            )}
            {holding.status === "protected" ? (
              <Button
                quiet
                label="Preview controls"
                onPress={() =>
                  router.push({
                    pathname: "/cards/[printingId]",
                    params: { printingId: holding.routePrintingId },
                  })
                }
              />
            ) : (
              holding.editableLotId && (
                <Button quiet label="Edit holding" onPress={() => setSelected(holding)} />
              )
            )}
            {selected === holding && (
              <HoldingEditor
                key={
                  holding.status === "protected" ? holding.routePrintingId : holding.editableLotId
                }
                holding={holding}
                onDone={() => setSelected(null)}
              />
            )}
          </Panel>
        ))}
      </ResultsLayout>
      {result.data && !result.data.holdings.length && (
        <Copy>No holdings match these filters. Add paper cards from Search.</Copy>
      )}
      <Row>
        <Button
          quiet
          label="Previous"
          disabled={!request.offset}
          onPress={() =>
            setRequest({ ...request, offset: Math.max(0, (request.offset ?? 0) - 40) })
          }
        />
        <Button
          quiet
          label="Next"
          disabled={!result.data?.hasMore}
          onPress={() => setRequest({ ...request, offset: (request.offset ?? 0) + 40 })}
        />
      </Row>
    </Screen>
  );
}
function HoldingEditor({ holding, onDone }: { holding: CollectionHolding; onDone: () => void }) {
  if (holding.status === "protected") return null;
  return <EditableHolding key={holding.editableLotId} holding={holding} onDone={onDone} />;
}
function EditableHolding({
  holding,
  onDone,
}: {
  holding: Exclude<CollectionHolding, { status: "protected" }>;
  onDone: () => void;
}) {
  const { collection } = useWorkspace();
  const [quantity, setQuantity] = useState(String(holding.quantity));
  const [finish, setFinish] = useState(holding.finish);
  const [language, setLanguage] = useState(holding.language);
  const [condition, setCondition] = useState(holding.condition);
  return (
    <>
      <Field
        label="Quantity"
        keyboardType="number-pad"
        value={quantity}
        onChangeText={setQuantity}
      />
      <Choice
        label="Finish"
        value={finish}
        options={
          holding.status === "visible"
            ? finishes.filter((f) => holding.availableFinishes.includes(f.value))
            : finishes.filter((f) => f.value === holding.finish)
        }
        onChange={setFinish}
      />
      <Choice label="Language" value={language} options={cardLanguages} onChange={setLanguage} />
      <Choice
        label="Condition"
        value={condition}
        options={cardConditions}
        onChange={setCondition}
      />
      <Row>
        <Button
          label="Save holding"
          onPress={async () => {
            if (holding.editableLotId)
              await collection.update({
                lotId: holding.editableLotId,
                quantity: Number(quantity),
                finish,
                language,
                condition,
              });
            onDone();
          }}
        />
        <Button quiet label="Cancel" onPress={onDone} />
        <Button
          quiet
          destructive
          label="Delete holding"
          onPress={() =>
            confirmRemoval(
              "Delete this holding?",
              "All copies in this holding will be removed from your collection on every synced device.",
              async () => {
                await collection.remove({ lotId: holding.editableLotId! });
                onDone();
              },
            )
          }
        />
      </Row>
    </>
  );
}
