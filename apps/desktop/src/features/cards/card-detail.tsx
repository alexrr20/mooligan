import type { CatalogCardDetail as CatalogCardDetailModel } from "@mooligan/domain/catalog-detail";
import type { CatalogPrintingVisibility } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { Ref } from "react";

import { Button } from "../../components/button";
import { colors } from "../../styles/tokens.stylex.js";
import { CardRules } from "./card-rules";
import { ManaCost } from "./mana-cost";
import { CardLegalities } from "./card-legalities";
import type { CatalogSearchOrigin } from "../search/catalog-search-origin";
import { PrintingDetails } from "./printing-details";
import { PrintingGallery } from "./printing-gallery";
import { PrintingImage } from "./printing-image";
import { PrintingViewer } from "./printing-viewer";
import { PrintingSpoilerControl } from "../spoilers/printing-spoiler-control";

type CardDetailProps = {
  detail: CatalogCardDetailModel;
  headingRef: Ref<HTMLHeadingElement>;
  origin: CatalogSearchOrigin | null;
  visibility: CatalogPrintingVisibility;
};

type CardDetailSkeletonProps = {
  origin: CatalogSearchOrigin | null;
};

type CardDetailProblemProps = {
  headingRef: Ref<HTMLHeadingElement>;
  kind: "error" | "unavailable";
  onRetry?: () => void;
  origin: CatalogSearchOrigin | null;
};

export function CardDetail({ detail, headingRef, origin, visibility }: CardDetailProps) {
  const firstFace = detail.card.faces[0];
  const multipleFaces = detail.card.faces.length > 1;

  return (
    <article {...stylex.props(styles.page)} aria-labelledby="card-detail-heading">
      <ReturnNavigation origin={origin} />

      <div {...stylex.props(styles.detailGrid)}>
        <aside {...stylex.props(styles.artworkRail)} aria-label="Selected printing artwork">
          <div {...stylex.props(styles.artworkSizer)}>
            <PrintingViewer
              key={detail.selectedPrinting.id}
              faces={detail.card.faces}
              printing={detail.selectedPrinting}
            />
          </div>
        </aside>

        <div {...stylex.props(styles.information)}>
          <header {...stylex.props(styles.identityHeader)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1
                ref={headingRef}
                {...stylex.props(styles.title)}
                id="card-detail-heading"
                tabIndex={-1}
              >
                {detail.card.name}
              </h1>
              {!multipleFaces && firstFace?.manaCost ? (
                <ManaCost value={firstFace.manaCost} />
              ) : null}
            </div>
            {!multipleFaces && firstFace ? (
              <p {...stylex.props(styles.primaryType)}>{firstFace.typeLine}</p>
            ) : null}
          </header>

          <CardRules card={detail.card} />
          <PrintingDetails printing={detail.selectedPrinting} />
          <PrintingSpoilerControl printingId={detail.selectedPrinting.id} visibility={visibility} />
          <CardLegalities legalities={detail.legalities} />
        </div>
      </div>

      {detail.card.hasSharedIdentity ? (
        <PrintingGallery
          cardName={detail.card.name}
          origin={origin}
          printings={detail.siblingPrintings}
          selectedPrintingId={detail.selectedPrinting.id}
        />
      ) : null}
    </article>
  );
}

export function CardDetailSkeleton({ origin }: CardDetailSkeletonProps) {
  return (
    <div {...stylex.props(styles.page)} aria-busy="true" aria-label="Loading card details">
      <ReturnNavigation origin={origin} />
      <div {...stylex.props(styles.detailGrid)}>
        <div {...stylex.props(styles.skeletonArtwork)} aria-hidden="true">
          <PrintingImage placeholder={false} variant="detail" />
        </div>
        <div {...stylex.props(styles.skeletonInformation)} aria-hidden="true" />
      </div>
    </div>
  );
}

export function CardDetailProblem({ headingRef, kind, onRetry, origin }: CardDetailProblemProps) {
  const unavailable = kind === "unavailable";

  return (
    <article {...stylex.props(styles.page)}>
      <ReturnNavigation origin={origin} />
      <section
        {...stylex.props(styles.problem)}
        aria-labelledby="card-detail-problem-heading"
        role={unavailable ? undefined : "alert"}
      >
        <h1
          ref={headingRef}
          {...stylex.props(styles.problemTitle)}
          id="card-detail-problem-heading"
          tabIndex={-1}
        >
          {unavailable ? "Printing unavailable" : "Card details unavailable"}
        </h1>
        <p {...stylex.props(styles.problemDescription)}>
          {unavailable
            ? "This printing is not present in the installed catalog."
            : "Mooligan could not read this printing from the local catalog."}
        </p>
        <div {...stylex.props(styles.problemActions)}>
          {!unavailable && onRetry ? (
            <Button size="small" type="button" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          <Link {...stylex.props(styles.secondaryAction)} search={{}} to="/search">
            Search all cards
          </Link>
        </div>
      </section>
    </article>
  );
}

export function ReturnNavigation({ origin }: { origin: CatalogSearchOrigin | null }) {
  return (
    <nav {...stylex.props(styles.returnRow)} aria-label="Card detail return">
      <Link {...stylex.props(styles.returnLink)} search={origin?.search ?? {}} to="/search">
        <span {...stylex.props(styles.returnArrow)} aria-hidden="true">
          ←
        </span>
        <span>{origin ? "Back to results" : "All cards"}</span>
      </Link>
    </nav>
  );
}

const styles = stylex.create({
  page: {
    width: "100%",
    maxWidth: "1480px",
    minHeight: "100%",
    marginInline: "auto",
    padding: {
      default: "32px clamp(30px, 5vw, 76px) 78px",
      "@media (max-width: 820px)": "28px 28px 58px",
    },
  },
  returnRow: {
    minHeight: "43px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
  },
  returnLink: {
    minHeight: "30px",
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    color: "#b8baaf",
    fontSize: "8px",
    letterSpacing: "0.11em",
    textDecoration: "none",
    textTransform: "uppercase",
    transition: "color 150ms ease",
    ":hover": {
      color: "#f4f1e8",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
  returnArrow: {
    color: colors.accent,
    fontSize: "15px",
    lineHeight: 1,
  },
  detailGrid: {
    paddingTop: {
      default: "36px",
      "@media (max-width: 820px)": "28px",
    },
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(240px, 0.76fr) minmax(0, 1.24fr)",
      "@media (max-width: 820px)": "minmax(0, 1fr)",
    },
    alignItems: "start",
    gap: {
      default: "clamp(36px, 5vw, 78px)",
      "@media (max-width: 820px)": "44px",
    },
  },
  artworkRail: {
    minWidth: 0,
    alignSelf: "start",
    "@media (min-width: 821px) and (min-height: 720px)": {
      position: "sticky",
      top: "28px",
    },
  },
  artworkSizer: {
    width: "100%",
    maxWidth: {
      default: "410px",
      "@media (max-width: 820px)": "390px",
      "@media (min-width: 821px) and (min-height: 720px)":
        "min(410px, calc((100vh - 176px) * 0.7142857))",
    },
    marginInline: {
      default: 0,
      "@media (max-width: 820px)": "auto",
    },
  },
  information: {
    minWidth: 0,
  },
  identityHeader: {
    minWidth: 0,
  },
  titleRow: {
    marginTop: 0,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
  },
  title: {
    maxWidth: "760px",
    margin: 0,
    color: "#f4f1e8",
    fontSize: {
      default: "clamp(44px, 5.9vw, 76px)",
      "@media (max-width: 1040px)": "44px",
      "@media (max-width: 820px)": "clamp(40px, 8vw, 60px)",
    },
    fontWeight: 400,
    letterSpacing: "-0.055em",
    lineHeight: 0.91,
    overflowWrap: "anywhere",
    outline: "none",
    ":focus-visible": {
      outlineWidth: "1px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "8px",
    },
  },
  primaryType: {
    margin: "20px 0 0",
    color: "#a6a89d",
    fontSize: "12px",
    lineHeight: 1.55,
  },
  skeletonArtwork: {
    width: "100%",
    maxWidth: "410px",
  },
  skeletonInformation: {
    minWidth: 0,
    minHeight: "520px",
    borderTop: "1px solid #34362f",
    borderBottom: "1px solid #34362f",
    backgroundColor: "#171815",
  },
  problem: {
    minHeight: "min(590px, calc(100vh - 150px))",
    paddingBlock: "72px",
    borderTop: "1px solid #55584f",
    borderBottom: "1px solid #34362f",
  },
  problemTitle: {
    maxWidth: "650px",
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(42px, 6vw, 72px)",
    fontWeight: 400,
    letterSpacing: "-0.052em",
    lineHeight: 0.94,
    outline: "none",
    ":focus-visible": {
      outlineWidth: "1px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "8px",
    },
  },
  problemDescription: {
    maxWidth: "520px",
    margin: "24px 0 0",
    color: "#a6a89d",
    fontSize: "12px",
    lineHeight: 1.7,
  },
  problemActions: {
    marginTop: "30px",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  },
  secondaryAction: {
    minHeight: "34px",
    paddingInline: "15px",
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #55584f",
    borderRadius: "2px",
    color: "#e1ded5",
    backgroundColor: "transparent",
    fontSize: "8px",
    letterSpacing: "0.09em",
    textDecoration: "none",
    textTransform: "uppercase",
    ":hover": {
      borderColor: "#85887e",
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
});
