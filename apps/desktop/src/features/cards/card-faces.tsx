import type { CatalogCardIdentity, CatalogCardFace } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";

import { OracleText } from "./oracle-text";

type CardFacesProps = {
  card: CatalogCardIdentity;
};

export function CardFaces({ card }: CardFacesProps) {
  const multipleFaces = card.faces.length > 1;

  return (
    <section {...stylex.props(styles.section)} aria-label="Oracle information">
      <div {...stylex.props(styles.sectionHead)}>
        <span>01 / Oracle record</span>
        <span>{multipleFaces ? `${card.faces.length} ordered faces` : "Current rules text"}</span>
      </div>

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

export function ManaCost({ value }: { value: string }) {
  return (
    <span {...stylex.props(styles.manaCost)} aria-label={`Mana cost ${value}`}>
      <OracleText className={stylex.props(styles.manaSymbols).className} text={value} />
    </span>
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
  section: {
    marginTop: "36px",
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
  faces: {
    display: "grid",
  },
  face: {
    paddingBlock: "30px 32px",
    borderBottom: "1px solid #34362f",
  },
  faceMultiple: {
    paddingBlock: "28px 34px",
  },
  faceHeader: {
    marginBottom: "26px",
  },
  faceIndex: {
    display: "block",
    marginBottom: "12px",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  faceTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
  },
  faceTitle: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(23px, 3.4vw, 36px)",
    fontWeight: 400,
    letterSpacing: "-0.035em",
    lineHeight: 1,
  },
  manaCost: {
    minHeight: "28px",
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    color: "#f4f1e8",
    fontSize: "17px",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  },
  manaSymbols: {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
  },
  typeLine: {
    margin: "13px 0 0",
    color: "#a6a89d",
    fontSize: "11px",
    lineHeight: 1.5,
  },
  oracleLayout: {
    display: "block",
  },
  oracleLayoutWithStats: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(116px, 0.3fr)",
      "@media (max-width: 1040px)": "minmax(0, 1fr)",
    },
    gap: "26px",
  },
  oracleCopy: {
    maxWidth: "650px",
    margin: 0,
    color: "#e1ded5",
    fontSize: "14px",
    lineHeight: 1.72,
  },
  oracleText: {
    whiteSpace: "normal",
  },
  noOracleText: {
    color: "#85887e",
    fontStyle: "italic",
  },
  stats: {
    margin: 0,
    display: "grid",
    alignContent: "start",
    gap: "1px",
    border: "1px solid #34362f",
    backgroundColor: "#34362f",
  },
  stat: {
    minHeight: "55px",
    padding: "10px 12px",
    display: "grid",
    alignContent: "center",
    gap: "5px",
    backgroundColor: "#11120f",
  },
  term: {
    margin: 0,
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.1em",
    lineHeight: 1.3,
    textTransform: "uppercase",
  },
  statValue: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "15px",
    lineHeight: 1.2,
  },
  cardFacts: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "1px",
    borderBottom: "1px solid #34362f",
    backgroundColor: "#34362f",
  },
  cardFact: {
    minHeight: "70px",
    padding: "14px 16px",
    display: "grid",
    alignContent: "center",
    gap: "7px",
    backgroundColor: "#11120f",
  },
  cardFactWide: {
    gridColumn: "1 / -1",
  },
  factValue: {
    margin: 0,
    color: "#d7d5cc",
    fontSize: "10px",
    lineHeight: 1.45,
  },
});
