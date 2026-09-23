import { ResultsLayout } from "@/components/results-layout";
import { Fragment, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { deckSectionLabels } from "@mooligan/domain/decks";
import type {
  Deck,
  DeckEntry,
  DeckMetadata,
  NewDeckEntry,
} from "@mooligan/workspace/deck-contract";
import { summarizeDeck } from "@mooligan/workspace/client/deck-summary";
import { analyzeDeckMana } from "@mooligan/workspace/client/deck-mana";
import { DeckManaAnalysis } from "./deck-mana-analysis";
import {
  exportDeckText,
  resolveDeckText,
  type DeckImportResult,
} from "@mooligan/workspace/client/deck-transfer";
import { Button, Choice, Copy, Field, Panel, Row, Screen, confirmRemoval } from "@/components/ui";
import { CardRow } from "@/components/cards";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";
import { readDocument, shareDocument } from "@/workspace/files";
import { CatalogSearch } from "./search/catalog-search";
import { DeckMetadataForm } from "./decks/deck-metadata-form";
import { AddDeckCard } from "./decks/add-deck-card";
import { deckSectionOptions, finishOptions } from "./options";
import {
  cardIdentity,
  tagsForDeck,
  indexCardTags,
  groupEntriesByTag,
  filterEntriesByTag,
} from "@mooligan/workspace/client/tag-state";
import { CardTagBadges, CardTagEditor, CardTagManager } from "./card-tags";
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
  const { lots, deckActions, cardTags, tagAssignments } = useWorkspace();
  const [mode, setMode] = useState("cards");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [section, setSection] = useState("all");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [tagScope, setTagScope] = useState("all");
  const [groupBy, setGroupBy] = useState("cards");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [tagging, setTagging] = useState<{ title: string; cardIds: string[] } | null>(null);
  const availableTags = tagsForDeck(cardTags, deck.id, tagScope === "all");
  const byCard = indexCardTags(availableTags, tagAssignments);
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
  const mana = analyzeDeckMana(deck.entries, printings ?? new Map());
  const { activeFilter: activeTagFilter, entries: taggedEntries } = filterEntriesByTag(
    deck.entries,
    printings ?? new Map(),
    availableTags,
    tagAssignments,
    tagFilter,
  );
  const entries = taggedEntries.filter((entry) => {
    const result = printings?.get(entry.printingId);
    const name = result?.status === "visible" ? result.detail.card.name : "";
    return (
      (section === "all" || entry.section === section) &&
      name.toLowerCase().includes(query.toLowerCase())
    );
  });
  const allIds = new Set(
    deck.entries.flatMap((entry) => cardIdentity(printings?.get(entry.printingId)) ?? []),
  );
  const selectedIds = [...selection].filter((id) => allIds.has(id));
  const groups =
    groupBy === "tags"
      ? groupEntriesByTag(entries, printings ?? new Map(), availableTags, tagAssignments)
      : [
          {
            id: "all",
            tag: null,
            entries,
            quantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
          },
        ];
  function saveMetadata(metadata: DeckMetadata, original: DeckMetadata = deck) {
    deckActions.update(deck.id, {
      ...(metadata.name !== original.name && { name: metadata.name }),
      ...(metadata.formatId !== original.formatId && { formatId: metadata.formatId }),
      ...(metadata.notes !== original.notes && { notes: metadata.notes }),
      ...(JSON.stringify(metadata.tags) !== JSON.stringify(original.tags) && {
        tags: metadata.tags,
      }),
    });
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
          {mana.unknown ? `\n${mana.unknown} cards with protected or unavailable details` : ""}
        </Copy>
        <Copy>
          {mana.lands} lands · {mana.spellCount} nonlands · average mana{" "}
          {mana.averageMana?.toFixed(2) ?? "unavailable"}
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
          { value: "mana", label: "Mana analysis" },
          { value: "tags", label: "Tags & categories" },
          { value: "add", label: "Add cards" },
          { value: "edit", label: "Name, format, labels, and notes" },
          { value: "transfer", label: "Import and export" },
          { value: "manage", label: "Duplicate, archive, or delete" },
        ]}
        onChange={(mode) => {
          setMode(mode);
          setSelected(null);
        }}
      />
      {mode === "tags" && <CardTagManager deckId={deck.id} />}
      {mode === "mana" && <DeckManaAnalysis analysis={mana} />}
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
          <Copy>
            Text exports contain cards only. Use a workspace backup to preserve tags and templates.
          </Copy>
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
            options={[{ value: "all", label: "All sections" }, ...deckSectionOptions]}
            onChange={setSection}
          />
          <Choice
            label="Tag scope"
            value={tagScope}
            onChange={setTagScope}
            options={[
              { value: "all", label: "Include global tags" },
              { value: "deck", label: "This deck only" },
            ]}
          />
          <Choice
            label="Filter by tag"
            value={activeTagFilter}
            onChange={setTagFilter}
            options={[
              { value: "all", label: "All cards" },
              { value: "untagged", label: "Untagged" },
              ...availableTags.map((tag) => ({
                value: tag.id,
                label: tag.name + (tag.deckId === null ? " · Global" : ""),
              })),
            ]}
          />
          <Choice
            label="Group by"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "cards", label: "Cards" },
              { value: "tags", label: "Tags & categories" },
            ]}
          />
          <Button
            quiet
            label="Select visible cards"
            disabled={!entries.length}
            onPress={() =>
              setSelection(
                new Set(
                  entries.flatMap((entry) => cardIdentity(printings?.get(entry.printingId)) ?? []),
                ),
              )
            }
          />
          {selectedIds.length ? (
            <Row>
              <Button
                label={`Tag ${selectedIds.length} selected cards`}
                onPress={() =>
                  setTagging({
                    title: `Tag ${selectedIds.length} selected cards`,
                    cardIds: selectedIds,
                  })
                }
              />
              <Button quiet label="Clear selection" onPress={() => setSelection(new Set())} />
            </Row>
          ) : null}
          {tagging ? (
            <CardTagEditor
              deckId={deck.id}
              cardIds={tagging.cardIds}
              title={tagging.title}
              onDone={() => setTagging(null)}
            />
          ) : null}
          {groupBy === "tags" ? (
            <Copy>Cards appear in each assigned category. Deck totals count each copy once.</Copy>
          ) : null}
          {groups.map((group) => (
            <Fragment key={group.id}>
              {groupBy === "tags" ? (
                <Copy
                  title={`${group.tag?.name ?? "Untagged"}${group.tag?.deckId === null ? " · Global" : ""} · ${group.quantity}`}
                />
              ) : null}
              <ResultsLayout preference="deck-cards">
                {group.entries.map((entry) => {
                  const result = printings?.get(entry.printingId);
                  const detail = result?.status === "visible" ? result.detail : null;
                  const identity = cardIdentity(result);
                  const assigned = identity ? (byCard.get(identity) ?? []) : [];
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
                        detail={`${deckSectionLabels[entry.section]} · ${entry.finish}${detail ? ` · ${detail.legalities.find((l) => l.formatId === deck.formatId)?.status ?? "Legality unavailable"}` : ""}`}
                        quantity={entry.quantity}
                        finish={entry.finish}
                      />
                      {assigned.length ? <CardTagBadges tags={assigned} /> : null}
                      {identity ? (
                        <Row>
                          <Button
                            quiet
                            label={selection.has(identity) ? "Deselect card" : "Select card"}
                            onPress={() =>
                              setSelection((current) => {
                                const next = new Set(current);
                                if (next.has(identity)) next.delete(identity);
                                else next.add(identity);
                                return next;
                              })
                            }
                          />
                          <Button
                            quiet
                            label="Edit card tags"
                            onPress={() =>
                              setTagging({
                                title: `Tag ${detail?.card.name ?? "card"}`,
                                cardIds: [identity],
                              })
                            }
                          />
                        </Row>
                      ) : null}
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
              {!group.quantity && groupBy === "tags" ? <Copy>No cards assigned.</Copy> : null}
            </Fragment>
          ))}
          {!entries.length && (
            <Copy>
              No cards match these filters. Change the filters, or add cards to your deck.
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
      <Choice label="Section" value={section} options={deckSectionOptions} onChange={setSection} />
      <Choice
        label="Finish"
        value={finish}
        options={finishOptions.filter((f) => available.includes(f.value))}
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
            const change: Partial<NewDeckEntry> = {
              ...(Number(quantity) !== original.quantity && { quantity: Number(quantity) }),
              ...(finish !== original.finish && { finish }),
              ...(section !== original.section && { section }),
              ...(replacement && { printingId: replacement }),
            };
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
