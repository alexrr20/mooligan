import { Tabs } from "@base-ui/react/tabs";
import type { CatalogCardDetail as CatalogCardDetailModel } from "@mooligan/domain/catalog-detail";
import type { CatalogPrintingVisibility } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { Ref } from "react";

import { Button } from "../../components/ui/button";
import { colors, pageInsets } from "../../styles/tokens.stylex.js";
import { CardRules } from "./card-rules";
import { ManaCost } from "./mana-cost";
import { CardLegalities } from "./card-legalities";
import type { CardDetailOrigin } from "./card-detail-origin";
import { PrintingDetails } from "./printing-details";
import { PrintingGallery } from "./printing-gallery";
import { PrintingImage } from "./printing-image";
import { PrintingViewer } from "./printing-viewer";
import { PrintingSpoilerControl } from "../spoilers/printing-spoiler-control";
import { AddToCollectionButton } from "../collection/collection-editor";
import { AddToDeckButton } from "../decks/deck-card-picker";
import { PrintingPrices } from "../prices/printing-prices";

type CardDetailProps = {
  detail: CatalogCardDetailModel;
  headingRef: Ref<HTMLHeadingElement>;
  origin: CardDetailOrigin | null;
  visibility: CatalogPrintingVisibility;
};

type CardDetailSkeletonProps = {
  origin: CardDetailOrigin | null;
};

type CardDetailProblemProps = {
  headingRef: Ref<HTMLHeadingElement>;
  kind: "error" | "unavailable";
  onRetry?: () => void;
  origin: CardDetailOrigin | null;
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
            <div {...stylex.props(styles.printingCaption)}>
              <strong {...stylex.props(styles.setName)}>{detail.selectedPrinting.setName}</strong>
              <span {...stylex.props(styles.printingCode)}>
                {detail.selectedPrinting.setCode.toUpperCase()} · #
                {detail.selectedPrinting.collectorNumber}
                {detail.selectedPrinting.isDigital ? " · Digital" : ""}
              </span>
            </div>
            <div {...stylex.props(styles.collectionAction)}>
              <AddToCollectionButton detail={detail} />
              <AddToDeckButton detail={detail} />
            </div>
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

          <Tabs.Root defaultValue="rules" {...stylex.props(styles.tabs)}>
            <Tabs.List {...stylex.props(styles.tabList)} aria-label="Card information">
              <Tabs.Tab {...stylex.props(styles.tab)} value="rules">
                Oracle text
              </Tabs.Tab>
              <Tabs.Tab {...stylex.props(styles.tab)} value="printing">
                Printing details
              </Tabs.Tab>
              <Tabs.Tab {...stylex.props(styles.tab)} value="formats">
                Format legality
              </Tabs.Tab>
              {!detail.selectedPrinting.isDigital ? (
                <Tabs.Tab {...stylex.props(styles.tab)} value="prices">
                  Prices
                </Tabs.Tab>
              ) : null}
            </Tabs.List>
            <Tabs.Panel value="rules" {...stylex.props(styles.tabPanel)}>
              <CardRules card={detail.card} />
            </Tabs.Panel>
            <Tabs.Panel value="printing" {...stylex.props(styles.tabPanel)}>
              <PrintingDetails printing={detail.selectedPrinting} />
            </Tabs.Panel>
            <Tabs.Panel value="formats" {...stylex.props(styles.tabPanel)}>
              <CardLegalities legalities={detail.legalities} />
            </Tabs.Panel>
            {!detail.selectedPrinting.isDigital ? (
              <Tabs.Panel value="prices" {...stylex.props(styles.tabPanel)}>
                <PrintingPrices printingId={detail.selectedPrinting.id} />
              </Tabs.Panel>
            ) : null}
          </Tabs.Root>
          <PrintingSpoilerControl printingId={detail.selectedPrinting.id} visibility={visibility} />
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
            <Button size="sm" type="button" onClick={onRetry}>
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

export function ReturnNavigation({ origin }: { origin: CardDetailOrigin | null }) {
  if (origin?.kind === "deck") {
    return (
      <nav {...stylex.props(styles.returnRow)} aria-label="Card detail return">
        <Link
          {...stylex.props(styles.returnLink)}
          search={{ deck: origin.value.deckId }}
          to="/decks"
        >
          <span {...stylex.props(styles.returnArrow)} aria-hidden="true">
            ←
          </span>
          Back to deck
        </Link>
      </nav>
    );
  }
  if (origin?.kind === "collection") {
    return (
      <nav {...stylex.props(styles.returnRow)} aria-label="Card detail return">
        <Link {...stylex.props(styles.returnLink)} search={origin.value.search} to="/collection">
          <span {...stylex.props(styles.returnArrow)} aria-hidden="true">
            ←
          </span>
          <span>Back to collection</span>
        </Link>
      </nav>
    );
  }

  return (
    <nav {...stylex.props(styles.returnRow)} aria-label="Card detail return">
      <Link {...stylex.props(styles.returnLink)} search={origin?.value.search ?? {}} to="/search">
        <span {...stylex.props(styles.returnArrow)} aria-hidden="true">
          ←
        </span>
        <span>{origin?.kind === "search" ? "Back to results" : "All cards"}</span>
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
    paddingTop: "28px",
    paddingInline: pageInsets.inline,
    paddingBottom: "100px",
  },
  returnRow: { display: "flex", alignItems: "center", minHeight: "32px", marginBottom: "32px" },
  returnLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    color: "#989b92",
    fontSize: "13px",
    textDecoration: "none",
    ":hover": { color: "#f4f1e8" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "4px" },
  },
  returnArrow: { color: "#989b92", fontSize: "18px", lineHeight: 1 },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 340px) minmax(0, 1fr)",
    alignItems: "start",
    gap: "clamp(36px, 5vw, 72px)",
    "@media (max-width: 820px)": { gridTemplateColumns: "minmax(0, 1fr)", gap: "36px" },
  },
  artworkRail: {
    minWidth: 0,
    alignSelf: "start",
    "@media (min-width: 821px) and (min-height: 820px)": { position: "sticky", top: "28px" },
  },
  artworkSizer: {
    width: "100%",
    maxWidth: "340px",
    "@media (max-width: 820px)": { marginInline: "auto" },
  },
  printingCaption: { display: "grid", gap: "5px", marginTop: "18px" },
  setName: { color: "#c6c8bd", fontSize: "14px", fontWeight: 400, lineHeight: 1.4 },
  printingCode: { color: "#85887f", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" },
  collectionAction: {
    marginTop: "18px",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  },
  information: { minWidth: 0 },
  identityHeader: { minWidth: 0 },
  titleRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: "16px 24px",
  },
  title: {
    flex: "1 1 240px",
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(30px, 3.2vw, 42px)",
    fontWeight: 500,
    letterSpacing: "-.03em",
    lineHeight: 1.12,
    overflowWrap: "anywhere",
    outline: "none",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "6px" },
  },
  primaryType: { margin: "14px 0 0", color: "#989b92", fontSize: "14px", lineHeight: 1.6 },
  tabs: { marginTop: "30px" },
  tabList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    padding: "4px",
    width: "fit-content",
    borderRadius: "10px",
    backgroundColor: "#171817",
  },
  tab: {
    padding: "9px 13px",
    borderWidth: 0,
    borderRadius: "7px",
    backgroundColor: "transparent",
    color: "#989b92",
    fontSize: "13px",
    cursor: "pointer",
    "[data-active]": { backgroundColor: "#30322e", color: "#f4f1e8" },
    ":hover": { color: "#f4f1e8" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "3px" },
  },
  tabPanel: {
    marginTop: "28px",
    outline: "none",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "6px" },
  },
  skeletonArtwork: {
    width: "100%",
    maxWidth: "340px",
    "@media (max-width: 820px)": { marginInline: "auto" },
  },
  skeletonInformation: {
    minWidth: 0,
    minHeight: "360px",
    borderRadius: "12px",
    backgroundColor: "#151615",
  },
  problem: {
    minHeight: "360px",
    padding: "48px 32px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "start",
    backgroundColor: "#131413",
    borderRadius: "12px",
  },
  problemTitle: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "32px",
    fontWeight: 500,
    letterSpacing: "-.025em",
    lineHeight: 1.2,
    outline: "none",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "6px" },
  },
  problemDescription: {
    maxWidth: "520px",
    margin: "16px 0 0",
    color: "#989b92",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  problemActions: {
    marginTop: "24px",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
  },
  secondaryAction: {
    color: colors.accent,
    fontSize: "13px",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "4px" },
  },
});
