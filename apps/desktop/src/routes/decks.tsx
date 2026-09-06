import { getCatalogFormatName } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";

import { PageFrame } from "../components/page-frame";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { DeckDetail } from "../features/decks/deck-detail";
import { DeckSelect, deckStyles } from "../features/decks/deck-controls";
import { DeckGrid } from "../features/decks/deck-grid";
import { DeckMetadataEditor, emptyDeck } from "../features/decks/deck-metadata-editor";
import { useDeckMutations, useDecks } from "../features/decks/use-decks";

const DeckSearchSchema = z.object({ deck: z.string().min(1).max(128).optional() });

export const Route = createFileRoute("/decks")({
  component: DecksPage,
  validateSearch: DeckSearchSchema,
});

function DecksPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const decks = useDecks();
  const mutations = useDeckMutations();
  const [creating, setCreating] = useState(false);
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
            <p {...stylex.props(deckStyles.muted)}>
              Plan cards for play. Your decks are saved in this workspace.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>Create deck</Button>
        </header>
        <div {...stylex.props(deckStyles.toolbar)}>
          <label {...stylex.props(deckStyles.field, deckStyles.grow)}>
            Search decks
            <Input value={filter} onValueChange={setFilter} placeholder="Name, tags, or notes" />
          </label>
          <DeckSelect
            label="Status"
            options={[
              { label: "Active", value: "active" },
              { label: "Archived", value: "archived" },
              { label: "All decks", value: "all" },
            ]}
            value={status}
            onChange={setStatus}
          />
          <DeckSelect
            label="Format"
            options={[{ label: "All formats", value: "all" }, ...formats]}
            value={format}
            onChange={setFormat}
          />
          <DeckSelect
            label="Sort"
            options={[
              { label: "Recently updated", value: "updated" },
              { label: "Name", value: "name" },
            ]}
            value={sort}
            onChange={setSort}
          />
        </div>
        <p {...stylex.props(deckStyles.muted)}>
          {shown.length} {shown.length === 1 ? "deck" : "decks"}
        </p>
        {!shown.length ? (
          <section {...stylex.props(deckStyles.panel)}>
            <h2 {...stylex.props(deckStyles.sectionTitle)}>
              {decks.length ? "No matching decks" : "Build your first deck"}
            </h2>
            <p {...stylex.props(deckStyles.muted)}>
              {decks.length
                ? "Change the search or filters to find your decks."
                : "Create a deck, then find cards in the local catalog or import a deck list. No account is required."}
            </p>
          </section>
        ) : null}
        <DeckGrid decks={shown} />
        {creating ? (
          <DeckMetadataEditor
            title="Create deck"
            initial={emptyDeck}
            onClose={() => setCreating(false)}
            onSave={(metadata) => {
              const id = mutations.create(metadata);
              setCreating(false);
              openDeck(id);
            }}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}
