import { getCatalogFormatName, type CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { Deck } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { catalogCardDetailQueryOptions } from "../cards/use-card-detail";
import { catalogImageUrl } from "../catalog/catalog-image";
import { commanderArt } from "./deck-art";

export function DeckGrid({ decks }: { decks: readonly Deck[] }) {
  const ids = [
    ...new Set(
      decks.flatMap((deck) =>
        deck.entries
          .filter(({ section }) => section === "commander")
          .map(({ printingId }) => printingId),
      ),
    ),
  ];
  const queries = useQueries({
    queries: ids.map((id) => catalogCardDetailQueryOptions(window.catalog.detail, id)),
  });
  const printings = new Map(ids.map((id, index) => [id, queries[index]?.data ?? null]));

  return (
    <ul {...stylex.props(styles.grid)}>
      {decks.map((deck) => (
        <li key={deck.id} {...stylex.props(styles.item)}>
          <DeckCard deck={deck} art={commanderArt(deck, printings)} />
        </li>
      ))}
    </ul>
  );
}

function DeckCard({ deck, art }: { deck: Deck; art: readonly CatalogImageDescriptor[] }) {
  const quantity = deck.entries
    .filter(({ section }) => section !== "maybeboard")
    .reduce((total, entry) => total + entry.quantity, 0);

  return (
    <Link
      to="/decks"
      search={{ deck: deck.id }}
      aria-labelledby={`deck-name-${deck.id}`}
      {...stylex.props(styles.card)}
    >
      {art.length ? (
        <div aria-hidden="true" {...stylex.props(styles.background)}>
          {art.map((image) => (
            <div key={image.printingId} {...stylex.props(styles.art(catalogImageUrl(image)))} />
          ))}
          <div {...stylex.props(styles.shade)} />
        </div>
      ) : null}
      <div {...stylex.props(styles.badges)}>
        <span {...stylex.props(styles.badge)}>{getCatalogFormatName(deck.formatId)}</span>
        {deck.archived ? <span {...stylex.props(styles.badge)}>Archived</span> : null}
      </div>
      <div {...stylex.props(styles.details)}>
        <h2 id={`deck-name-${deck.id}`} {...stylex.props(styles.name)}>
          {deck.name}
        </h2>
        <p {...stylex.props(styles.metadata)}>
          <span>
            {quantity} {quantity === 1 ? "card" : "cards"}
          </span>
          <span>Updated {new Date(deck.updatedAt).toLocaleDateString()}</span>
        </p>
        {deck.tags.length ? <p {...stylex.props(styles.tags)}>{deck.tags.join(" · ")}</p> : null}
      </div>
    </Link>
  );
}

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
    gap: "12px",
    padding: 0,
    margin: 0,
    listStyle: "none",
  },
  item: { display: "grid", minWidth: 0 },
  card: {
    position: "relative",
    isolation: "isolate",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "24px",
    minWidth: 0,
    minHeight: "160px",
    boxSizing: "border-box",
    padding: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: "#34362f", ":hover": "#c4ef8c" },
    borderRadius: "8px",
    backgroundColor: "#1b1e18",
    color: "#f4f1e8",
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": "2px solid #c4ef8c" },
    outlineOffset: "4px",
  },
  background: {
    position: "absolute",
    inset: 0,
    zIndex: -1,
    display: "flex",
    borderRadius: "inherit",
    overflow: "hidden",
    pointerEvents: "none",
  },
  art: (url: string) => ({
    flex: 1,
    minWidth: 0,
    backgroundImage: `url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center 35%",
  }),
  shade: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(180deg, rgb(13 13 13 / 10%), rgb(13 13 13 / 25%) 25%, rgb(13 13 13 / 85%) 65%, #0d0d0d)",
  },
  badges: { display: "flex", flexWrap: "wrap", alignItems: "start", gap: "6px" },
  badge: {
    padding: "3px 7px",
    borderRadius: "4px",
    backgroundColor: "rgb(13 13 13 / 80%)",
    fontSize: "11px",
    fontWeight: 500,
  },
  details: { display: "grid", gap: "4px", minWidth: 0 },
  name: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 500,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  metadata: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: "8px",
    rowGap: "2px",
    margin: 0,
    color: "#c4c6bb",
    fontSize: "11px",
  },
  tags: { margin: 0, color: "#c4c6bb", fontSize: "12px", overflowWrap: "anywhere" },
});
