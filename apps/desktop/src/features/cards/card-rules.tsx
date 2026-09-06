import type { CatalogCardIdentity, CatalogCardFace } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";

import { ManaCost } from "./mana-cost";
import { OracleText } from "./oracle-text";

type CardRulesProps = {
  card: CatalogCardIdentity;
};

export function CardRules({ card }: CardRulesProps) {
  const multipleFaces = card.faces.length > 1;

  return (
    <section {...stylex.props(styles.section)} aria-label="Oracle information">
      <div {...stylex.props(styles.faces)}>
        {card.faces.map((face, index) => (
          <CardFace
            key={`${index}:${face.name}`}
            face={face}
            index={index}
            multipleFaces={multipleFaces}
          />
        ))}
      </div>

      <CardFacts card={card} />
    </section>
  );
}

function CardFace({
  face,
  index,
  multipleFaces,
}: {
  face: CatalogCardFace;
  index: number;
  multipleFaces: boolean;
}) {
  const headingId = `card-face-${index}-heading`;
  const hasStats =
    face.power !== undefined ||
    face.toughness !== undefined ||
    face.loyalty !== undefined ||
    face.defense !== undefined;

  return (
    <article
      {...stylex.props(styles.face, multipleFaces && styles.faceMultiple)}
      aria-labelledby={multipleFaces ? headingId : undefined}
    >
      {multipleFaces ? (
        <header {...stylex.props(styles.faceHeader)}>
          <span {...stylex.props(styles.faceIndex)}>Face {String(index + 1).padStart(2, "0")}</span>
          <div {...stylex.props(styles.faceTitleRow)}>
            <h2 {...stylex.props(styles.faceTitle)} id={headingId}>
              {face.name}
            </h2>
            {face.manaCost ? <ManaCost value={face.manaCost} /> : null}
          </div>
          <p {...stylex.props(styles.typeLine)}>{face.typeLine}</p>
        </header>
      ) : null}

      <div {...stylex.props(styles.oracleLayout, hasStats && styles.oracleLayoutWithStats)}>
        <p {...stylex.props(styles.oracleCopy)}>
          {face.oracleText ? (
            <OracleText
              className={stylex.props(styles.oracleText).className}
              text={face.oracleText}
            />
          ) : (
            <span {...stylex.props(styles.noOracleText)}>No Oracle text.</span>
          )}
        </p>
        {hasStats ? <FaceStats face={face} /> : null}
      </div>
    </article>
  );
}

function FaceStats({ face }: { face: CatalogCardFace }) {
  return (
    <dl {...stylex.props(styles.stats)}>
      {face.power !== undefined || face.toughness !== undefined ? (
        <div {...stylex.props(styles.stat)}>
          <dt {...stylex.props(styles.term)}>Power / Toughness</dt>
          <dd {...stylex.props(styles.statValue)}>
            {face.power ?? "—"} / {face.toughness ?? "—"}
          </dd>
        </div>
      ) : null}
      {face.loyalty !== undefined ? (
        <div {...stylex.props(styles.stat)}>
          <dt {...stylex.props(styles.term)}>Loyalty</dt>
          <dd {...stylex.props(styles.statValue)}>{face.loyalty}</dd>
        </div>
      ) : null}
      {face.defense !== undefined ? (
        <div {...stylex.props(styles.stat)}>
          <dt {...stylex.props(styles.term)}>Defense</dt>
          <dd {...stylex.props(styles.statValue)}>{face.defense}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function CardFacts({ card }: { card: CatalogCardIdentity }) {
  const colorIdentity = card.colorIdentity.length
    ? card.colorIdentity.map((color) => colorNames[color]).join(" · ")
    : "Colorless";

  return (
    <dl {...stylex.props(styles.cardFacts)}>
      {card.manaValue !== undefined ? (
        <div {...stylex.props(styles.cardFact)}>
          <dt {...stylex.props(styles.term)}>Mana value</dt>
          <dd {...stylex.props(styles.factValue)}>{formatManaValue(card.manaValue)}</dd>
        </div>
      ) : null}
      <div {...stylex.props(styles.cardFact, card.manaValue === undefined && styles.cardFactWide)}>
        <dt {...stylex.props(styles.term)}>Color identity</dt>
        <dd {...stylex.props(styles.factValue)}>{colorIdentity}</dd>
      </div>
      {card.keywords.length ? (
        <div {...stylex.props(styles.cardFact, styles.cardFactWide)}>
          <dt {...stylex.props(styles.term)}>Keywords</dt>
          <dd {...stylex.props(styles.factValue)}>{card.keywords.join(" · ")}</dd>
        </div>
      ) : null}
    </dl>
  );
}

const colorNames = {
  B: "Black",
  G: "Green",
  R: "Red",
  U: "Blue",
  W: "White",
} as const;

function formatManaValue(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

const styles = stylex.create({
  section: { display: "grid", gap: "28px" },
  faces: { display: "grid", gap: "24px" },
  face: { minWidth: 0 },
  faceMultiple: {
    padding: "22px",
    borderRadius: "12px",
    backgroundColor: "#151615",
    "@media (max-width: 620px)": { padding: "18px" },
  },
  faceHeader: { marginBottom: "22px" },
  faceIndex: { display: "block", marginBottom: "10px", color: "#85887f", fontSize: "12px" },
  faceTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px 20px",
  },
  faceTitle: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "22px",
    fontWeight: 500,
    letterSpacing: "-.02em",
    lineHeight: 1.3,
  },
  typeLine: { margin: "10px 0 0", color: "#989b92", fontSize: "13px", lineHeight: 1.6 },
  oracleLayout: { display: "block" },
  oracleLayoutWithStats: { display: "grid", gap: "20px" },
  oracleCopy: { maxWidth: "650px", margin: 0, color: "#dedfd5", fontSize: "16px", lineHeight: 1.8 },
  oracleText: { whiteSpace: "normal" },
  noOracleText: { color: "#85887f", fontStyle: "italic" },
  stats: { margin: 0, display: "flex", flexWrap: "wrap", gap: "24px" },
  stat: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "12px" },
  term: { margin: 0, color: "#989b92", fontSize: "12px", lineHeight: 1.5 },
  statValue: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "22px",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.3,
  },
  cardFacts: {
    margin: 0,
    padding: "20px",
    display: "flex",
    flexWrap: "wrap",
    gap: "20px 36px",
    backgroundColor: "#151615",
    borderRadius: "10px",
  },
  cardFact: { display: "grid", alignContent: "start", gap: "7px" },
  cardFactWide: { flexBasis: "100%" },
  factValue: { margin: 0, color: "#c6c8bd", fontSize: "14px", lineHeight: 1.5 },
});
