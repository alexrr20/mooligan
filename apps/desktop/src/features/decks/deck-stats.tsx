import * as stylex from "@stylexjs/stylex";

import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import type { summarizeDeck } from "./deck-summary";

export function DeckStats({ summary }: { summary: ReturnType<typeof summarizeDeck> }) {
  const owned = summary.total - summary.missing;

  return (
    <div role="group" aria-label="Deck summary" {...stylex.props(styles.stats)}>
      <p {...stylex.props(styles.text)}>
        {summary.sections
          .filter(({ value, quantity }) => value === "mainboard" || quantity > 0)
          .map(({ label, quantity }) => `${label} ${quantity}`)
          .join(" · ")}
      </p>
      <p aria-label="Main deck composition" {...stylex.props(styles.text)}>
        {summary.lands} lands · {summary.spells} nonlands
        {summary.averageMana !== null ? ` · Avg. mana ${summary.averageMana.toFixed(2)}` : ""}
        {summary.unknown ? ` · ${summary.unknown} copies without card details` : ""}
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
