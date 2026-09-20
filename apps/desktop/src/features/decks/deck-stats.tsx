import * as stylex from "@stylexjs/stylex";

import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import type { summarizeDeck } from "@mooligan/workspace/client/deck-summary";

const typeSymbols = {
  Planeswalker: "\ue623",
  Battle: "\ue9d1",
  Creature: "\ue61f",
  Sorcery: "\ue624",
  Instant: "\ue621",
  Artifact: "\ue61e",
  Enchantment: "\ue620",
  Land: "\ue622",
};

export function DeckStats({ summary }: { summary: ReturnType<typeof summarizeDeck> }) {
  const owned = summary.total - summary.missing;

  return (
    <div role="group" aria-label="Deck summary" {...stylex.props(styles.stats)}>
      <div role="group" aria-label="Main deck card types" {...stylex.props(styles.types)}>
        {summary.cardTypes.map(({ type, quantity }) => (
          <Tooltip key={type}>
            <TooltipTrigger aria-label={`${type}: ${quantity}`} {...stylex.props(styles.count)}>
              <span aria-hidden="true" {...stylex.props(styles.symbol)}>
                {typeSymbols[type]}
              </span>
              <span aria-hidden="true">{quantity}</span>
            </TooltipTrigger>
            <TooltipContent>
              {type}: {quantity}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <p {...stylex.props(styles.text)}>
        {summary.sections
          .filter(({ value, quantity }) => value === "mainboard" || quantity > 0)
          .map(({ label, quantity }) => `${label} ${quantity}`)
          .join(" · ")}
      </p>
      <Tooltip>
        <TooltipTrigger
          aria-label={`Collection coverage: ${owned} of ${summary.total} copies owned, ${summary.missing} missing`}
          {...stylex.props(styles.coverage)}
        >
          {owned}/{summary.total} owned · {summary.missing} missing
          <span aria-hidden="true">ⓘ</span>
        </TooltipTrigger>
        <TooltipContent>
          Counts the selected printings and finishes, excluding the maybeboard. Decks do not reserve
          collection copies.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const styles = stylex.create({
  types: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px 20px",
    width: "100%",
    paddingBlock: "4px",
  },
  count: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
    borderWidth: 0,
    borderRadius: "2px",
    backgroundColor: "transparent",
    color: "#f4f1e8",
    font: "inherit",
    fontSize: "14px",
    lineHeight: 1.4,
    cursor: "help",
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "4px" },
  },
  symbol: {
    fontFamily: "Mana",
    fontSize: "14px",
    fontWeight: 400,
    width: "14px",
    height: "14px",
    lineHeight: 1,
    textAlign: "center",
    color: "#a6a89d",
  },
  stats: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px 24px",
    color: "#a6a89d",
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
  },
  text: { margin: 0 },
  coverage: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    marginInlineStart: "auto",
    padding: "2px 0",
    borderWidth: 0,
    borderRadius: "2px",
    backgroundColor: "transparent",
    color: "inherit",
    font: "inherit",
    cursor: "help",
    ":hover": { color: "#f4f1e8" },
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "4px" },
  },
});
