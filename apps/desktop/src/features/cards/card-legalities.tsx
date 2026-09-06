import type { CatalogFormatLegality } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";

type CardLegalitiesProps = {
  legalities: readonly CatalogFormatLegality[];
};

const formatOrder = [
  "standard",
  "future",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "commander",
  "oathbreaker",
  "pauper",
  "brawl",
  "historic",
  "explorer",
  "alchemy",
  "timeless",
] as const;

const formatRank = new Map<string, number>(formatOrder.map((format, index) => [format, index]));

export function CardLegalities({ legalities }: CardLegalitiesProps) {
  if (!legalities.length) {
    return (
      <p {...stylex.props(styles.empty)}>
        No format legality information is available for this card.
      </p>
    );
  }

  const ordered = legalities
    .map((legality, sourceIndex) => ({ legality, sourceIndex }))
    .sort((left, right) => {
      const leftRank = formatRank.get(left.legality.formatId);
      const rightRank = formatRank.get(right.legality.formatId);
      if (leftRank !== undefined || rightRank !== undefined) {
        return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
      }
      return left.sourceIndex - right.sourceIndex;
    });

  return (
    <section {...stylex.props(styles.section)} aria-labelledby="legalities-heading">
      <h2 id="legalities-heading" {...stylex.props(styles.title)}>
        Format legality
      </h2>
      <ul {...stylex.props(styles.grid)}>
        {ordered.map(({ legality }) => (
          <li {...stylex.props(styles.item)} key={legality.formatId}>
            <span {...stylex.props(styles.format)}>{legality.formatName}</span>
            <span
              {...stylex.props(
                styles.status,
                legality.status === "legal" && styles.statusLegal,
                legality.status === "restricted" && styles.statusRestricted,
                legality.status === "banned" && styles.statusBanned,
              )}
            >
              <span {...stylex.props(styles.statusDot)} aria-hidden="true" />
              {statusNames[legality.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const statusNames = {
  banned: "Banned",
  legal: "Legal",
  "not-legal": "Not legal",
  restricted: "Restricted",
} as const;

const styles = stylex.create({
  section: { minWidth: 0 },
  title: { margin: "0 0 18px", color: "#dedfd5", fontSize: "16px", fontWeight: 500 },
  empty: { margin: 0, color: "#989b92", fontSize: "14px", lineHeight: 1.6 },
  grid: {
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "4px 24px",
    listStyle: "none",
    "@media (max-width: 1100px) and (min-width: 821px)": { gridTemplateColumns: "minmax(0, 1fr)" },
    "@media (max-width: 540px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  item: {
    minHeight: "40px",
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    borderRadius: "6px",
    ":nth-child(4n+1)": { backgroundColor: "#151615" },
    ":nth-child(4n+2)": { backgroundColor: "#151615" },
  },
  format: { minWidth: 0, color: "#c6c8bd", fontSize: "13px", overflowWrap: "anywhere" },
  status: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    color: "#85887f",
    fontSize: "12px",
  },
  statusLegal: { color: "#69d799" },
  statusRestricted: { color: "#dec26d" },
  statusBanned: { color: "#dc8175" },
  statusDot: { width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "currentColor" },
});
