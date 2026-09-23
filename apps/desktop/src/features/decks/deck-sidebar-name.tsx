import type { Deck } from "@mooligan/workspace/deck-contract";
import * as stylex from "@stylexjs/stylex";

import { DeckColors } from "./deck-colors";

export function DeckSidebarName({ deck }: { deck: Deck }) {
  return (
    <span {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.name)}>{deck.name}</span>
      <DeckColors deck={deck} compact />
    </span>
  );
}

const styles = stylex.create({
  row: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  name: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});
