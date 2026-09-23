import { getCatalogFormatName } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Schema } from "effect";

import { PageFrame } from "../components/page-frame";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { DeckDetail } from "../features/decks/deck-detail";
import { deckStyles } from "../features/decks/deck-controls";
import { EditorSelect, editorStyles } from "../components/ui/editor-controls";
import { DeckGrid } from "../features/decks/deck-grid";
import { CreateDeckDialog } from "../features/decks/create-deck-dialog";
import { useDecks } from "../features/decks/use-decks";

const DeckSearchSchema = Schema.Struct({
  deck: Schema.optional(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128))),
});

export const Route = createFileRoute("/decks")({
  component: DecksPage,
  validateSearch: Schema.standardSchemaV1(DeckSearchSchema),
});

function DecksPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const decks = useDecks();
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("active");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("updated");
  const selected = decks.find(({ id }) => id === search.deck);
  function openDeck(id: string) {
    void navigate({ search: { deck: id } });
  }
  if (search.deck)
    return (
      <PageFrame>
        {selected ? (
          <DeckDetail
            key={selected.id}
            deck={selected}
            onOpenDeck={openDeck}
            onDeleted={() => {
              void navigate({ search: {}, replace: true });
            }}
          />
        ) : (
          <div {...stylex.props(deckStyles.page)}>
            <h1>Deck unavailable</h1>
            <p>This deck was deleted or belongs to another workspace.</p>
            <Link to="/decks" search={{}} {...stylex.props(deckStyles.link)}>
              Back to decks
            </Link>
          </div>
        )}
      </PageFrame>
    );
  const formats = [...new Set(decks.map(({ formatId }) => formatId))]
    .sort()
    .map((value) => ({ value, label: getCatalogFormatName(value) }));
  const shown = decks
    .filter(
      (deck) =>
        (status === "all" || deck.archived === (status === "archived")) &&
        (format === "all" || deck.formatId === format) &&
        `${deck.name} ${deck.notes} ${deck.tags.join(" ")}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  return (
    <PageFrame>
      <div {...stylex.props(deckStyles.page)}>
        <header {...stylex.props(deckStyles.header)}>
          <div>
            <h1 {...stylex.props(deckStyles.title)}>Decks</h1>
            <p {...stylex.props(editorStyles.muted)}>
              Plan cards for play. Your decks are saved in this workspace.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreatingDeck(true)}>
            Create deck
          </Button>
        </header>
        <div {...stylex.props(editorStyles.toolbar)}>
          <label {...stylex.props(editorStyles.field, deckStyles.searchField)}>
            Search decks
            <Input value={filter} onValueChange={setFilter} placeholder="Name, labels, or notes" />
          </label>
          <EditorSelect
            label="Status"
            options={[
              { label: "Active", value: "active" },
              { label: "Archived", value: "archived" },
              { label: "All decks", value: "all" },
            ]}
            value={status}
            onChange={setStatus}
          />
          <EditorSelect
            label="Format"
            options={[{ label: "All formats", value: "all" }, ...formats]}
            value={format}
            onChange={setFormat}
          />
          <EditorSelect
            label="Sort"
            options={[
              { label: "Recently updated", value: "updated" },
              { label: "Name", value: "name" },
            ]}
            value={sort}
            onChange={setSort}
          />
        </div>
        <p {...stylex.props(editorStyles.muted)}>
          {shown.length} {shown.length === 1 ? "deck" : "decks"}
        </p>
        {!shown.length ? (
          <section {...stylex.props(deckStyles.panel)}>
            <h2 {...stylex.props(deckStyles.sectionTitle)}>
              {decks.length ? "No matching decks" : "Build your first deck"}
            </h2>
            <p {...stylex.props(editorStyles.muted)}>
              {decks.length
                ? "Change the search or filters to find your decks."
                : "Create a deck, then find cards in the local catalog or import a deck list. No account is required."}
            </p>
          </section>
        ) : null}
        <DeckGrid decks={shown} />
        {creatingDeck && <CreateDeckDialog onClose={() => setCreatingDeck(false)} />}
      </div>
    </PageFrame>
  );
}
