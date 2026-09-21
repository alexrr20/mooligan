import type { Deck, DeckEntry } from "@mooligan/domain/decks";
import { Tabs } from "@base-ui/react/tabs";
import { analyzeDeckMana } from "@mooligan/workspace/client/deck-mana";
import { collectionLotsQuery } from "@mooligan/workspace/schema";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueries } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { catalogCardDetailQueryOptions } from "../cards/use-card-detail";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import { DeckActions } from "./deck-actions";
import { DeckCardPicker } from "./deck-card-picker";
import { DeckCards } from "./deck-cards";
import { commanderArt } from "./deck-art";
import { DeckMessage, deckStyles } from "./deck-controls";
import { DeckEntryEditor } from "./deck-entry-editor";
import { DeckImportExport } from "./deck-import-export";
import { DeckHeader } from "./deck-header";
import { DeckMetadataEditor } from "./deck-metadata-editor";
import { DeckStats } from "./deck-stats";
import { DeckManaAnalysis } from "./deck-mana-analysis";
import { DeckCost } from "./deck-cost";
import { summarizeDeck } from "@mooligan/workspace/client/deck-summary";
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
      <DeckCost entries={deck.entries} />
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
      <Tabs.Root defaultValue="cards" {...stylex.props(styles.tabs)}>
        <Tabs.List aria-label="Deck view" {...stylex.props(styles.tabList)}>
          <Tabs.Tab value="cards" {...stylex.props(styles.tab)}>
            Cards
          </Tabs.Tab>
          <Tabs.Tab value="mana" {...stylex.props(styles.tab)}>
            Mana analysis
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="cards">
          <div {...stylex.props(deckStyles.section)}>
            <DeckCardPicker deckId={deck.id} />
            <DeckCards
              deck={deck}
              printings={printings}
              summary={summary}
              onEdit={setEntry}
              onRemove={(entry) => action.mutate(() => mutations.removeEntry(deck.id, entry.id))}
            />
          </div>
        </Tabs.Panel>
        <Tabs.Panel value="mana">
          <DeckManaAnalysis analysis={analyzeDeckMana(deck.entries, printings)} />
        </Tabs.Panel>
      </Tabs.Root>
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

const styles = stylex.create({
  tabs: { minWidth: 0 },
  tabList: {
    display: "flex",
    gap: "24px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
    marginBottom: "20px",
  },
  tab: {
    color: "#a6a89d",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    padding: "10px 0 12px",
    font: "inherit",
    cursor: "pointer",
    "[data-active]": { color: "#c4ef8c", borderBottomColor: "#c4ef8c" },
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "4px" },
  },
});
