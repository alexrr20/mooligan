import { editorStyles } from "../../components/ui/editor-controls";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCatalogFormatName, type CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { Deck } from "@mooligan/workspace/deck-contract";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "../../components/ui/button";
import { fontFamilies, pageInsets } from "../../styles/tokens.stylex";
import { catalogImageUrl } from "../catalog/catalog-image";
import { deckStyles } from "./deck-controls";
import { DeckColors } from "./deck-colors";
import "./deck-header.css";

export function DeckHeader({
  deck,
  art,
  children,
}: {
  deck: Deck;
  art: readonly CatalogImageDescriptor[];
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotionConfig() ?? false;

  return (
    <>
      <header {...stylex.props(styles.bar)} data-deck-bar data-reduced-motion={reduceMotion}>
        <div aria-hidden="true" {...stylex.props(styles.plate)} data-deck-plate />
        <Button
          render={<Link to="/decks" search={{}} />}
          nativeButton={false}
          variant="ghost"
          size="icon"
          style={styles.back}
          aria-label="Back to decks"
          title="Back to decks"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} aria-hidden="true" />
        </Button>
        <div aria-hidden="true" {...stylex.props(styles.compactHeading)} data-deck-compact-title>
          <DeckColors deck={deck} />
          <span {...stylex.props(styles.compactTitle)}>{deck.name}</span>
        </div>
        <div {...stylex.props(editorStyles.toolbar)}>{children}</div>
      </header>
      <div {...stylex.props(styles.hero)} data-reduced-motion={reduceMotion}>
        {art.length ? (
          <div aria-hidden="true" {...stylex.props(styles.background)} data-deck-art>
            {art.map((image) => (
              <div key={image.printingId} {...stylex.props(styles.art(catalogImageUrl(image)))} />
            ))}
            <div {...stylex.props(styles.shade)} />
          </div>
        ) : null}
        <div {...stylex.props(styles.heading)} data-deck-heading>
          <div {...stylex.props(styles.colors)}>
            <DeckColors deck={deck} />
          </div>
          <motion.h1
            key={deck.id}
            {...stylex.props(deckStyles.title, styles.title)}
            initial={{
              opacity: 0,
              transform: reduceMotion ? "none" : "translateY(10px) scale(0.98)",
              filter: reduceMotion ? "none" : "blur(3px)",
            }}
            animate={{
              opacity: 1,
              transform: reduceMotion ? "none" : "translateY(0px) scale(1)",
              filter: reduceMotion ? "none" : "blur(0px)",
            }}
            transition={{ duration: reduceMotion ? 0.15 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {deck.name}
          </motion.h1>
          <p {...stylex.props(editorStyles.muted)}>
            {getCatalogFormatName(deck.formatId)}
            {deck.archived ? " · Archived" : ""}
            {deck.tags.length ? ` · ${deck.tags.join(", ")}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}

const styles = stylex.create({
  colors: { display: "flex", justifyContent: "flex-start", minHeight: "16px", marginBottom: "8px" },
  heading: { minWidth: 0, paddingBlock: "40px", textAlign: "left" },
  title: {
    fontFamily: fontFamilies.sans,
    fontSize: "48px",
    fontWeight: 600,
    fontStyle: "italic",
    letterSpacing: "-0.04em",
    lineHeight: 1.1,
    textTransform: "uppercase",
    transformOrigin: "bottom left",
  },
  bar: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    isolation: "isolate",
    display: "flex",
    alignItems: "center",
    gap: "20px",
    minWidth: 0,
    minHeight: "48px",
    marginInline: `calc(-1 * (${pageInsets.inline} + ${pageInsets.shellInline}))`,
    paddingInline: `calc(${pageInsets.inline} + ${pageInsets.shellInline})`,
  },
  plate: {
    position: "absolute",
    insetInline: 0,
    // Cover the page inset before the bar reaches its sticky position.
    top: `calc(-1 * ${pageInsets.top})`,
    bottom: "-40px",
    zIndex: -1,
    backgroundImage:
      "linear-gradient(180deg, #0a0a0a 36%, rgb(10 10 10 / 96%) 46%, rgb(10 10 10 / 84%) 56%, rgb(10 10 10 / 64%) 66%, rgb(10 10 10 / 40%) 76%, rgb(10 10 10 / 16%) 86%, rgb(10 10 10 / 4%) 94%, rgb(10 10 10 / 0%) 100%)",
    pointerEvents: "none",
    opacity: 0,
  },
  back: { width: "44px", height: "44px" },
  compactHeading: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1,
    minWidth: 0,
    opacity: 0,
  },
  compactTitle: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: fontFamilies.sans,
    fontSize: "16px",
    fontWeight: 600,
    fontStyle: "italic",
    textTransform: "uppercase",
    letterSpacing: "-0.025em",
  },
  hero: { position: "relative", isolation: "isolate", minWidth: 0 },
  background: {
    position: "absolute",
    top: `calc(-1 * (${pageInsets.top} + 64px))`,
    insetInlineStart: "40%",
    insetInlineEnd: `calc(-1 * (${pageInsets.inline} + ${pageInsets.shellInline}))`,
    bottom: "-16px",
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
      "linear-gradient(180deg, rgb(10 10 10 / 20%), rgb(10 10 10 / 65%) 40%, #0a0a0a 100%), linear-gradient(90deg, #0a0a0a, transparent 45%)",
  },
});
