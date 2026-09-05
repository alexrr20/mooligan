import type { Deck, DeckEntry } from "@mooligan/domain/decks";
import { collectionLotsQuery } from "@mooligan/workspace/schema";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { catalogCardDetailQueryOptions } from "../cards/use-card-detail";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import { DeckActions } from "./deck-actions";
import { DeckCardPicker } from "./deck-card-picker";
import { commanderArt } from "./deck-art";
import { DeckMessage, deckStyles } from "./deck-controls";
import { DeckEntryEditor } from "./deck-entry-editor";
import { DeckImportExport } from "./deck-import-export";
import { DeckHeader } from "./deck-header";
import { DeckMetadataEditor } from "./deck-metadata-editor";
import { withDeckOrigin } from "./deck-origin";
import { DeckStats } from "./deck-stats";
import { ownershipKey, summarizeDeck } from "./deck-summary";
import { useDeckMutations } from "./use-decks";

export function DeckDetail({
  deck,
  onOpenDeck,
  onDeleted,
}: {
  deck: Deck;
  onOpenDeck: (id: string) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState<DeckEntry>();
  const [transfer, setTransfer] = useState<"import" | "export">();
  const [deleting, setDeleting] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const mutations = useDeckMutations();
  const action = useMutation({ mutationFn: async (run: () => void) => run() });
  const ids = [...new Set(deck.entries.map(({ printingId }) => printingId))];
  const queries = useQueries({
    queries: ids.map((id) => catalogCardDetailQueryOptions(window.catalog.detail, id)),
  });
  const printings = new Map(ids.map((id, index) => [id, queries[index]?.data ?? null]));
  const store = useWorkspaceLiveStore();
  const lots = store.useQuery(collectionLotsQuery);
  const summary = summarizeDeck(deck.entries, lots, printings);
  return (
    <div {...stylex.props(deckStyles.page)}>
      <DeckHeader deck={deck} art={commanderArt(deck, printings)}>
        <DeckActions
          triggerRef={actionsRef}
          archived={deck.archived}
          onEdit={() => setEditing(true)}
          onDuplicate={() => action.mutate(() => onOpenDeck(mutations.duplicate(deck.id)))}
          onArchive={() =>
            action.mutate(() => mutations.update(deck.id, { archived: !deck.archived }))
          }
          onImport={() => setTransfer("import")}
          onExport={() => setTransfer("export")}
          onDelete={() => setDeleting(true)}
        />
      </DeckHeader>
      {action.error ? <DeckMessage error>{action.error.message}</DeckMessage> : null}
      {deck.notes ? <p {...stylex.props(deckStyles.notes)}>{deck.notes}</p> : null}
      <DeckStats summary={summary} />
      {queries.some((query) => query.isError) ? (
        <DeckMessage error>
          Some local card details could not be read.{" "}
          <Button
            variant="secondary"
            onClick={() => {
              for (const query of queries) if (query.isError) void query.refetch();
            }}
          >
            Retry
          </Button>
        </DeckMessage>
      ) : null}
      <DeckCardPicker deckId={deck.id} />
      {summary.sections.map(({ value, label, quantity, entries }) => (
        <section key={value} {...stylex.props(deckStyles.panel)} aria-label={label}>
          <h2 {...stylex.props(deckStyles.sectionTitle)}>
            {label} · {quantity}
          </h2>
          {!quantity ? <p {...stylex.props(deckStyles.muted)}>No cards in this section.</p> : null}
          <ul {...stylex.props(deckStyles.list)}>
            {entries
              .toSorted((a, b) => {
                const left = printings.get(a.printingId);
                const right = printings.get(b.printingId);
                return (
                  Number(b.section === "commander") - Number(a.section === "commander") ||
                  (left?.status === "visible" ? left.detail.card.name : "").localeCompare(
                    right?.status === "visible" ? right.detail.card.name : "",
                  ) ||
                  a.id.localeCompare(b.id)
                );
              })
              .map((entry) => {
                const printing = printings.get(entry.printingId);
                const detail = printing?.status === "visible" ? printing.detail : null;
                const name =
                  detail?.card.name ??
                  (printing?.status === "protected" ? "Protected preview" : "Printing unavailable");
                const legality = detail?.legalities.find(
                  ({ formatId }) => formatId === deck.formatId,
                );
                const owned = summary.owned.get(ownershipKey(entry)) ?? 0;
                const needed = summary.required.get(ownershipKey(entry)) ?? 0;
                return (
                  <li key={entry.id} {...stylex.props(deckStyles.row)}>
                    <strong>{entry.quantity}×</strong>
                    <div {...stylex.props(deckStyles.grow)}>
                      <Link
                        to="/cards/$printingId"
                        params={{ printingId: entry.printingId }}
                        state={withDeckOrigin({ deckId: deck.id })}
                        search={{}}
                        {...stylex.props(deckStyles.link)}
                      >
                        {name}
                      </Link>
                      {entry.section === "commander" ? (
                        <span {...stylex.props(deckStyles.commanderLabel)}>Commander</span>
                      ) : null}
                      <p {...stylex.props(deckStyles.muted)}>
                        {detail
                          ? `${detail.selectedPrinting.setCode.toUpperCase()} ${detail.selectedPrinting.collectorNumber}`
                          : entry.printingId}{" "}
                        · {entry.finish} · {owned} owned
                        {needed ? ` / ${needed} needed across this deck` : ""}
                        {legality && legality.status !== "legal"
                          ? ` · ${legality.status.replaceAll("_", " ")}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setEntry(entry)}
                      aria-label={`Edit ${name}`}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => action.mutate(() => mutations.removeEntry(deck.id, entry.id))}
                      aria-label={`Remove ${name}`}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {editing ? (
        <DeckMetadataEditor
          finalFocus={actionsRef}
          title="Edit deck details"
          initial={deck}
          onClose={() => setEditing(false)}
          onSave={(_metadata, changed) => {
            mutations.update(deck.id, changed);
            setEditing(false);
          }}
        />
      ) : null}
      {entry ? (
        <DeckEntryEditor deckId={deck.id} entry={entry} onClose={() => setEntry(undefined)} />
      ) : null}
      {transfer ? (
        <DeckImportExport
          finalFocus={actionsRef}
          deck={deck}
          mode={transfer}
          printings={printings}
          onClose={() => setTransfer(undefined)}
        />
      ) : null}
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent finalFocus={actionsRef}>
          <DialogTitle>Delete {deck.name}?</DialogTitle>
          <DialogDescription>
            This deletes the deck and its planned cards on every synced device. Collection copies
            stay in your collection.
          </DialogDescription>
          <Button
            variant="destructive"
            onClick={() =>
              action.mutate(() => {
                mutations.remove(deck.id);
                onDeleted();
              })
            }
          >
            Delete deck
          </Button>
          <Button variant="secondary" onClick={() => setDeleting(false)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
