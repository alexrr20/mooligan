import { ResultsLayout } from "@/components/results-layout";
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { deckSections, type Deck, type DeckEntry, type DeckMetadata } from "@mooligan/domain/decks";
import { summarizeDeck } from "@mooligan/workspace/client/deck-summary";
import {
  exportDeckText,
  resolveDeckText,
  type DeckImportResult,
} from "@mooligan/workspace/client/deck-transfer";
import { Button, Choice, Copy, Field, Panel, Row, Screen, confirmRemoval } from "@/components/ui";
import { CardRow } from "@/components/cards";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";
import { readDocument, shareDocument } from "@/workspace/files";
import { CatalogSearch } from "./search";
import { DeckMetadataForm } from "./decks";
import { AddDeckCard } from "./card-detail";
import { finishes } from "./collection";
import { DeckCost } from "./deck-cost";

export default function DeckDetailScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { decks } = useWorkspace();
  const deck = decks.find((deck) => deck.id === deckId);
  return (
    <Screen>
      {deck ? (
        <DeckEditor key={deckId} deck={deck} />
      ) : (
        <Copy title="Deck unavailable">This deck may have been deleted on another device.</Copy>
      )}
    </Screen>
  );
}
function DeckEditor({ deck }: { deck: Deck }) {
  const { lots, deckActions } = useWorkspace();
  const [mode, setMode] = useState("cards");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [section, setSection] = useState("all");
  const [query, setQuery] = useState("");
  const ids = [...new Set(deck.entries.map((entry) => entry.printingId))];
  const { data: printings } = useCatalogQuery(
    ["deck-printings", JSON.stringify(ids)],
    ({ catalog, visibility }) => new Map(ids.map((id) => [id, catalog.detail(id, visibility)])),
  );
  const { data: selectedPrinting } = useCatalogQuery(
    ["deck-picker", selected],
    ({ catalog, visibility }) => (selected ? catalog.detail(selected, visibility) : null),
  );
  const summary = summarizeDeck(deck.entries, lots, printings ?? new Map());
  const entries = deck.entries.filter((entry) => {
    const result = printings?.get(entry.printingId);
    const name = result?.status === "visible" ? result.detail.card.name : "";
    return (
      (section === "all" || entry.section === section) &&
      name.toLowerCase().includes(query.toLowerCase())
    );
  });
  function saveMetadata(metadata: DeckMetadata, original: DeckMetadata = deck) {
    const change: Partial<DeckMetadata> = {};
    for (const key of ["name", "formatId", "notes"] as const)
      if (metadata[key] !== original[key]) change[key] = metadata[key];
    if (JSON.stringify(metadata.tags) !== JSON.stringify(original.tags))
      change.tags = metadata.tags;
    deckActions.update(deck.id, change);
    setMode("cards");
  }
  return (
    <>
      <Copy title={deck.name}>
        {deck.formatId} · {summary.total} cards{deck.archived ? " · archived" : ""}
      </Copy>
      <Panel>
        <Copy>
          {summary.total - summary.missing} owned · {summary.missing} missing
          {summary.unknown
            ? `\n${summary.unknown} cards with protected or unavailable details`
            : ""}
        </Copy>
        <Copy>
          {summary.lands} lands · {summary.spells} nonlands · average mana{" "}
          {summary.averageMana?.toFixed(2) ?? "unavailable"}
        </Copy>
        {deck.notes && <Copy>{deck.notes}</Copy>}
        {deck.tags.length > 0 && <Copy>{deck.tags.join(" · ")}</Copy>}
      </Panel>
      <DeckCost entries={deck.entries} />
      <Choice
        label="Deck actions"
        value={mode}
        options={[
          { value: "cards", label: "Cards" },
          { value: "add", label: "Add cards" },
          { value: "edit", label: "Name, format, tags, and notes" },
          { value: "transfer", label: "Import and export" },
          { value: "manage", label: "Duplicate, archive, or delete" },
        ]}
        onChange={(mode) => {
          setMode(mode);
          setSelected(null);
        }}
      />
      {mode === "edit" && (
        <DeckMetadataForm initial={deck} submit="Save deck" onSave={saveMetadata} />
      )}
      {mode === "manage" && (
        <Panel>
          <Button
            quiet
            label="Duplicate deck"
            onPress={() => {
              const id = deckActions.duplicate(deck.id);
              router.replace({ pathname: "/decks/[deckId]", params: { deckId: id } });
            }}
          />
          <Button
            quiet
            label={deck.archived ? "Unarchive deck" : "Archive deck"}
            onPress={() => deckActions.update(deck.id, { archived: !deck.archived })}
          />
          <Button
            quiet
            destructive
            label="Delete deck"
            onPress={() =>
              confirmRemoval(
                `Delete ${deck.name}?`,
                "This removes the deck from every synced device. Your collection is unaffected.",
                () => {
                  deckActions.remove(deck.id);
                  router.back();
                },
              )
            }
          />
        </Panel>
      )}
      {mode === "transfer" && (
        <>
          <Button
            label="Export deck text"
            onPress={() =>
              shareDocument(
                "mooligan-deck.txt",
                exportDeckText(deck.entries, printings ?? new Map()),
                "text/plain",
              )
            }
          />
          <DeckImport deckId={deck.id} />
        </>
      )}
      {mode === "add" && (
        <>
          {selectedPrinting?.status === "visible" ? (
            <>
              <Copy title={selectedPrinting.detail.card.name} />
              <AddDeckCard
                key={selectedPrinting.detail.selectedPrinting.id}
                detail={selectedPrinting.detail}
                deckId={deck.id}
                onDone={() => setSelected(null)}
              />
              <Button quiet label="Choose another card" onPress={() => setSelected(null)} />
            </>
          ) : (
            <CatalogSearch onSelect={(card) => setSelected(card.id)} />
          )}
        </>
      )}
      {mode === "cards" && (
        <>
          <Field label="Search deck cards" value={query} onChangeText={setQuery} />
          <Choice
            label="Section"
            value={section}
            options={[{ value: "all", label: "All sections" }, ...deckSections]}
            onChange={setSection}
          />
          <ResultsLayout preference="deck-cards">
            {entries.map((entry) => {
              const result = printings?.get(entry.printingId);
              const detail = result?.status === "visible" ? result.detail : null;
              return (
                <Panel key={entry.id}>
                  <CardRow
                    printingId={entry.printingId}
                    name={
                      detail?.card.name ??
                      (result?.status === "protected"
                        ? "Protected preview"
                        : "Unavailable printing")
                    }
                    image={detail?.selectedPrinting.images.find((i) => i.size === "small")}
                    gridImage={detail?.selectedPrinting.images.find((i) => i.size === "normal")}
                    detail={`${deckSections.find((s) => s.value === entry.section)?.label} · ${entry.finish}${detail ? ` · ${detail.legalities.find((l) => l.formatId === deck.formatId)?.status ?? "Legality unavailable"}` : ""}`}
                    quantity={entry.quantity}
                    finish={entry.finish}
                  />
                  <Button
                    quiet
                    label={editing === entry.id ? "Cancel edit" : "Edit card"}
                    onPress={() => setEditing(editing === entry.id ? null : entry.id)}
                  />
                  {editing === entry.id && (
                    <EntryEditor
                      key={entry.id}
                      entry={entry}
                      deckId={deck.id}
                      allowedFinishes={detail?.selectedPrinting.finishes ?? [entry.finish]}
                      onDone={() => setEditing(null)}
                    />
                  )}
                </Panel>
              );
            })}
          </ResultsLayout>
          {!entries.length && (
            <Copy>
              No cards in this section. Use Add cards or Import and export to build your deck.
            </Copy>
          )}
        </>
      )}
    </>
  );
}
function EntryEditor({
  entry,
  deckId,
  allowedFinishes,
  onDone,
}: {
  entry: DeckEntry;
  deckId: string;
  allowedFinishes: readonly string[];
  onDone: () => void;
}) {
  const { deckActions } = useWorkspace();
  const [original] = useState(entry);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [finish, setFinish] = useState(entry.finish);
  const [section, setSection] = useState(entry.section);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const { data: printing } = useCatalogQuery(
    ["replacement", replacement],
    ({ catalog, visibility }) => (replacement ? catalog.detail(replacement, visibility) : null),
  );
  const available =
    printing?.status === "visible"
      ? (printing.detail.selectedPrinting.finishes ?? [])
      : allowedFinishes;
  return (
    <>
      <Field
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
      />
      <Choice label="Section" value={section} options={deckSections} onChange={setSection} />
      <Choice
        label="Finish"
        value={finish}
        options={finishes.filter((f) => available.includes(f.value))}
        onChange={setFinish}
      />
      <Button quiet label="Change printing" onPress={() => setChoosing(!choosing)} />
      {choosing && (
        <CatalogSearch
          onSelect={(card) => {
            setReplacement(card.id);
            setChoosing(false);
          }}
        />
      )}
      {printing?.status === "visible" && (
        <Copy>
          New printing: {printing.detail.card.name} · {printing.detail.selectedPrinting.setName}
        </Copy>
      )}
      <Row>
        <Button
          label="Save card"
          onPress={async () => {
            const change: Partial<Omit<DeckEntry, "id">> = {};
            if (Number(quantity) !== original.quantity) change.quantity = Number(quantity);
            if (finish !== original.finish) change.finish = finish;
            if (section !== original.section) change.section = section;
            if (replacement) change.printingId = replacement;
            await deckActions.updateEntry(deckId, entry.id, change);
            onDone();
          }}
        />
        <Button
          quiet
          destructive
          label="Remove card"
          onPress={() =>
            confirmRemoval(
              "Remove this deck card?",
              "Collection ownership stays unchanged.",
              () => {
                deckActions.removeEntry(deckId, entry.id);
                onDone();
              },
            )
          }
        />
      </Row>
    </>
  );
}
function DeckImport({ deckId }: { deckId: string }) {
  const { catalog, visibility, deckActions } = useWorkspace();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<DeckImportResult | null>(null);
  function change(value: string) {
    setText(value);
    setPreview(null);
  }
  return (
    <Panel>
      <Copy title="Import deck text">
        Paste a quantity and card name per line, Arena editions, MTGO sideboards, or a Mooligan
        export.
      </Copy>
      <Button
        quiet
        label="Open text file"
        onPress={async () => {
          const value = await readDocument(1_000_000);
          if (value !== null) change(value);
        }}
      />
      <Field label="Deck text" value={text} onChangeText={change} multiline />
      <Button
        label="Check import"
        onPress={async () =>
          setPreview(
            await resolveDeckText(text, {
              detail: async (id) => catalog.detail(id, visibility),
              list: async (request) => catalog.list(request, visibility),
            }),
          )
        }
      />
      {preview && (
        <>
          <Copy>
            {preview.entries.reduce((sum, entry) => sum + entry.quantity, 0)} copies resolved
          </Copy>
          {[...preview.errors, ...preview.warnings].map((message, i) => (
            <Copy key={i}>{message}</Copy>
          ))}
          <Button
            disabled={preview.errors.length > 0 || !preview.entries.length}
            label="Add checked cards"
            onPress={() => {
              deckActions.addEntries(deckId, preview.entries);
              change("");
            }}
          />
        </>
      )}
    </Panel>
  );
}
