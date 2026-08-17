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
    return null;
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
      <div {...stylex.props(styles.sectionHead)}>
        <h2 {...stylex.props(styles.sectionTitle)} id="legalities-heading">
          03 / Format legalities
        </h2>
        <span>Current catalog status</span>
      </div>

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
  section: {
    marginTop: "46px",
    borderTop: "1px solid #55584f",
  },
  sectionHead: {
    minHeight: "39px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    borderBottom: "1px solid #34362f",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  sectionTitle: {
    margin: 0,
    color: "inherit",
    fontSize: "inherit",
    fontWeight: 400,
    letterSpacing: "inherit",
  },
  grid: {
    margin: 0,
    padding: "14px 0 0",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "1px",
    listStyle: "none",
    backgroundColor: "#34362f",
  },
  item: {
    minHeight: "46px",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    backgroundColor: "#11120f",
  },
  format: {
    overflow: "hidden",
    color: "#c6c6bd",
    fontSize: "9px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  status: {
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },
  statusLegal: {
    color: "#69d799",
  },
  statusRestricted: {
    color: "#dec26d",
  },
  statusBanned: {
    color: "#dc8175",
  },
  statusDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: "currentColor",
  },
});
