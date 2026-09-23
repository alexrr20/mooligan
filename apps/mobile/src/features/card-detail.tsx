import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import type { Finish } from "@mooligan/domain/catalog";
import { cardLanguages, type CardCondition, type CardLanguage } from "@mooligan/domain/collection";
import type { DeckSection } from "@mooligan/domain/decks";
import { Button, Choice, Copy, Field, Panel, Row, Screen } from "@/components/ui";
import { CardImage, CardRow, PrintingPrice } from "@/components/cards";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";
import {
  cardConditionOptions,
  cardLanguageOptions,
  deckSectionOptions,
  finishOptions,
} from "./options";

export default function CardDetailScreen() {
  const { printingId } = useLocalSearchParams<{ printingId: string }>();
  const { spoiler } = useWorkspace();
  const {
    data: result,
    error,
    isPending,
  } = useCatalogQuery(["detail", printingId], ({ catalog, visibility }) =>
    catalog.detail(printingId, visibility),
  );
  return (
    <Screen>
      {error ? (
        <Copy>{error.message}</Copy>
      ) : isPending ? (
        <Copy>Opening card…</Copy>
      ) : !result ? (
        <Copy title="Printing unavailable">
          Install or update the catalog in Settings to view this printing. Its saved collection and
          deck references remain intact.
        </Copy>
      ) : result.status === "protected" ? (
        <Panel>
          <Copy title="Protected preview">
            {result.release.name} · releases {result.releasedOn}
          </Copy>
          <Button
            label="Reveal this printing"
            onPress={() => spoiler({ type: "reveal-printing", targetId: printingId })}
          />
          <Button
            quiet
            label="Reveal release family"
            onPress={() => spoiler({ type: "reveal-release", targetId: result.release.rootSetId })}
          />
        </Panel>
      ) : (
        <>
          <VisibleCard key={printingId} detail={result.detail} />
          {result.visibility.reason !== "released" && (
            <Panel>
              <Copy title="Preview visibility">This card is from an upcoming release.</Copy>
              <Button
                quiet
                label="Protect this printing"
                onPress={() => spoiler({ type: "protect-printing", targetId: printingId })}
              />
              <Button
                quiet
                label="Protect release family"
                onPress={() =>
                  spoiler({
                    type: "protect-release",
                    targetId:
                      result.visibility.reason === "released"
                        ? printingId
                        : result.visibility.release.rootSetId,
                  })
                }
              />
            </Panel>
          )}
        </>
      )}
    </Screen>
  );
}
function VisibleCard({ detail }: { detail: CatalogCardDetail }) {
  const [tab, setTab] = useState("rules");
  const [face, setFace] = useState(0);
  const [page, setPage] = useState(0);
  const printing = detail.selectedPrinting;
  const activeFace = detail.card.faces[face] ?? detail.card.faces[0]!;
  const image = printing.images.find(
    (image) => image.faceIndex === face && image.size === "normal",
  );
  return (
    <>
      <Copy title={detail.card.name}>
        {printing.setName} · #{printing.collectorNumber} · {printing.rarity}
      </Copy>
      <CardImage image={image} large />
      {detail.card.faces.length > 1 && (
        <Row>
          {detail.card.faces.map((f, index) => (
            <Button
              key={index}
              quiet={index !== face}
              label={f.name}
              onPress={() => setFace(index)}
            />
          ))}
        </Row>
      )}
      <PrintingPrice printingId={printing.id} />
      <Choice
        label="Card details"
        value={tab}
        options={[
          { value: "rules", label: "Oracle text" },
          { value: "printings", label: `Printings (${detail.siblingPrintings.length})` },
          { value: "legality", label: "Format legality" },
          { value: "prices", label: "Market prices" },
          { value: "collection", label: "Add to collection" },
          { value: "deck", label: "Add to deck" },
        ]}
        onChange={setTab}
      />
      {tab === "rules" && (
        <Panel>
          <Copy title={activeFace.name}>{activeFace.manaCost}</Copy>
          <Copy>{activeFace.typeLine}</Copy>
          <Copy>{activeFace.oracleText || "No Oracle text."}</Copy>
          <Copy>
            {activeFace.power !== undefined
              ? `${activeFace.power}/${activeFace.toughness}`
              : activeFace.loyalty
                ? `Loyalty ${activeFace.loyalty}`
                : activeFace.defense
                  ? `Defense ${activeFace.defense}`
                  : ""}
          </Copy>
          <Copy>
            Mana value {detail.card.manaValue ?? "unknown"} ·{" "}
            {printing.language ?? "unknown language"}
            {printing.artists ? `\nIllustrated by ${printing.artists.join(", ")}` : ""}
            {printing.releasedOn ? `\nReleased ${printing.releasedOn}` : ""}
          </Copy>
        </Panel>
      )}
      {tab === "printings" && (
        <>
          {detail.siblingPrintings.slice(page * 40, page * 40 + 40).map((p) => (
            <CardRow
              key={p.id}
              printingId={p.id}
              name={p.setName}
              detail={`#${p.collectorNumber} · ${p.rarity} · ${p.releasedOn ?? ""}`}
              image={p.image}
              onPress={() =>
                router.replace({ pathname: "/cards/[printingId]", params: { printingId: p.id } })
              }
            />
          ))}
          <Row>
            <Button quiet label="Previous" disabled={!page} onPress={() => setPage(page - 1)} />
            <Button
              quiet
              label="Next"
              disabled={(page + 1) * 40 >= detail.siblingPrintings.length}
              onPress={() => setPage(page + 1)}
            />
          </Row>
        </>
      )}
      {tab === "legality" && (
        <Panel>
          {detail.legalities.map((legality) => (
            <Copy key={legality.formatId}>
              {legality.formatName} · {legality.status.replace("-", " ")}
            </Copy>
          ))}
          <Copy>
            These labels describe the card's legality. They do not validate deck construction.
          </Copy>
        </Panel>
      )}
      {tab === "prices" && <MarketPrices printingId={printing.id} digital={printing.isDigital} />}
      {tab === "collection" && <AddCollection detail={detail} />}
      {tab === "deck" && <AddDeckCard detail={detail} />}
    </>
  );
}
function AddCollection({ detail }: { detail: CatalogCardDetail }) {
  const { collection } = useWorkspace();
  const printing = detail.selectedPrinting;
  const [finish, setFinish] = useState<Finish>(printing.finishes?.[0] ?? "nonfoil");
  const [language, setLanguage] = useState<CardLanguage>(
    cardLanguages.find((value) => value === printing.language) ?? "en",
  );
  const [condition, setCondition] = useState<CardCondition>("near-mint");
  const [quantity, setQuantity] = useState("1");
  const [saved, setSaved] = useState("");
  if (printing.isDigital) return <Copy>Only paper printings belong in your collection.</Copy>;
  return (
    <Panel>
      <Field
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
      />
      <Choice
        label="Finish"
        value={finish}
        options={finishOptions.filter((f) => printing.finishes?.includes(f.value))}
        onChange={setFinish}
      />
      <Choice
        label="Language"
        value={language}
        options={cardLanguageOptions}
        onChange={setLanguage}
      />
      <Choice
        label="Condition"
        value={condition}
        options={cardConditionOptions}
        onChange={setCondition}
      />
      <Button
        label="Add copies"
        onPress={async () => {
          const result = await collection.add({
            printingId: printing.id,
            finish,
            language,
            condition,
            quantity: Number(quantity),
          });
          setSaved(
            `${result.holdingQuantity} ${result.holdingQuantity === 1 ? "copy" : "copies"} now in this holding.`,
          );
        }}
      />
      {saved && <Copy>{saved}</Copy>}
    </Panel>
  );
}
export function AddDeckCard({
  detail,
  deckId,
  onDone,
}: {
  detail: CatalogCardDetail;
  deckId?: string;
  onDone?: () => void;
}) {
  const { decks, deckActions } = useWorkspace();
  const [selectedDeck, setSelectedDeck] = useState(
    deckId ?? decks.find((d) => !d.archived)?.id ?? "",
  );
  const [section, setSection] = useState<DeckSection>("mainboard");
  const [finish, setFinish] = useState<Finish>(detail.selectedPrinting.finishes?.[0] ?? "nonfoil");
  const [quantity, setQuantity] = useState("1");
  const [saved, setSaved] = useState(false);
  return (
    <Panel>
      {!deckId && (
        <Choice
          label="Deck"
          value={selectedDeck}
          options={decks.filter((d) => !d.archived).map((d) => ({ label: d.name, value: d.id }))}
          onChange={setSelectedDeck}
        />
      )}
      {!selectedDeck && <Copy>Create a deck in the Decks tab first.</Copy>}
      <Field
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
      />
      <Choice label="Section" value={section} options={deckSectionOptions} onChange={setSection} />
      <Choice
        label="Finish"
        value={finish}
        options={finishOptions.filter((f) => detail.selectedPrinting.finishes?.includes(f.value))}
        onChange={setFinish}
      />
      <Button
        label="Add to deck"
        disabled={!selectedDeck}
        onPress={async () => {
          await deckActions.add(selectedDeck, {
            printingId: detail.selectedPrinting.id,
            finish,
            quantity: Number(quantity),
            section,
          });
          setSaved(true);
          onDone?.();
        }}
      />
      {saved && <Copy>Added to your deck.</Copy>}
    </Panel>
  );
}
function MarketPrices({ printingId, digital }: { printingId: string; digital: boolean }) {
  const { reference, providers, busy } = useWorkspace();
  const { data } = useCatalogQuery(["prices", printingId], ({ reference }) =>
    reference.prices(printingId),
  );
  if (digital) return <Copy>Market prices are available for paper printings.</Copy>;
  const prices =
    data?.prices.filter((p) => providers.some((provider) => provider === p.market)) ?? [];
  return (
    <Panel>
      <Copy title="Market prices">Per copy, without condition or language adjustments.</Copy>
      {prices.map((p) => {
        const digits =
          new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: p.money.currency,
          }).resolvedOptions().maximumFractionDigits ?? 2;
        return (
          <Copy key={`${p.market}-${p.kind}-${p.finish}-${p.money.currency}`}>
            {p.market} · {p.kind} · {p.finish}
            {"\n"}
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: p.money.currency,
            }).format(p.money.amountMinor / 10 ** digits)}{" "}
            · {p.priceDate}
            {Date.now() - Date.parse(p.priceDate) > 7 * 86_400_000 ? " · stale" : ""}
          </Copy>
        );
      })}
      {!prices.length && <Copy>No saved prices from your enabled providers.</Copy>}
      <Button
        quiet
        label="Update market prices"
        disabled={busy}
        onPress={() => reference.updatePrices()}
      />
    </Panel>
  );
}
