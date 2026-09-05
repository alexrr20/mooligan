import { getCatalogFormatName, type CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { Deck } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { pageInsets } from "../../styles/tokens.stylex";
import { catalogImageUrl } from "../catalog/catalog-image";
import { deckStyles } from "./deck-controls";

export function DeckHeader({
  deck,
  art,
  children,
}: {
  deck: Deck;
  art: readonly CatalogImageDescriptor[];
  children: ReactNode;
}) {
  return (
    <header {...stylex.props(styles.header)}>
      {art.length ? (
        <div aria-hidden="true" {...stylex.props(styles.background)}>
          {art.map((image) => (
            <div key={image.printingId} {...stylex.props(styles.art(catalogImageUrl(image)))} />
          ))}
          <div {...stylex.props(styles.shade)} />
        </div>
      ) : null}
      <Link to="/decks" search={{}} {...stylex.props(deckStyles.link)}>
        Back to decks
      </Link>
      <div {...stylex.props(deckStyles.header)}>
        <div>
          <h1 {...stylex.props(deckStyles.title)}>{deck.name}</h1>
          <p {...stylex.props(deckStyles.muted)}>
            {getCatalogFormatName(deck.formatId)}
            {deck.archived ? " · Archived" : ""}
            {deck.tags.length ? ` · ${deck.tags.join(", ")}` : ""}
          </p>
        </div>
        <div {...stylex.props(deckStyles.toolbar)}>{children}</div>
      </div>
    </header>
  );
}

const styles = stylex.create({
  header: {
    position: "relative",
    isolation: "isolate",
    display: "grid",
    gap: "24px",
  },
  background: {
    position: "absolute",
    top: `calc(-1 * (${pageInsets.top} + 30px))`,
    insetInline: `calc(-1 * ${pageInsets.inline})`,
    bottom: "-24px",
    zIndex: -1,
    display: "flex",
    borderRadius: "10px 10px 0 0",
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
      "linear-gradient(180deg, rgb(13 13 13 / 20%), rgb(13 13 13 / 65%) 40%, #0d0d0d 100%), linear-gradient(90deg, rgb(13 13 13 / 50%), transparent 75%)",
  },
});
