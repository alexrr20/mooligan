import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef } from "react";

import { Button } from "../../components/ui/button";
import { colors } from "../../styles/tokens.stylex.js";
import { useCatalogImageLoading } from "../catalog/catalog-image-loading";
import { CatalogSetSymbol } from "../catalog/catalog-set-symbol";
import { PrintingImage } from "../cards/printing-image";
import { type CatalogSearchOrigin, withCatalogSearchOrigin } from "./catalog-search-origin";
import { formatSpoilerReleaseDate } from "../spoilers/spoiler-ui-state";
import { AddToCollectionButton } from "../collection/collection-editor";

type CommonSearchResultsProps = {
  error: string;
  grid: boolean;
  hasMore: boolean;
  imagesReady: boolean;
  loading: boolean;
  onLoadMore: () => void;
  origin: CatalogSearchOrigin;
  total: number | null;
};

type SearchResultsProps = CommonSearchResultsProps & {
  cards: CatalogCardSummary[];
  queryError: string;
};

type UpcomingSearchResultsProps = CommonSearchResultsProps & {
  printings: CatalogUpcomingPrinting[];
};

type CatalogResultItem =
  | {
      card: CatalogCardSummary;
      releasedOn?: string;
      status: "visible";
    }
  | Extract<CatalogUpcomingPrinting, { status: "protected" }>;

export function SearchResults({
  cards,
  error,
  grid,
  hasMore,
  imagesReady,
  loading,
  onLoadMore,
  origin,
  queryError,
  total,
}: SearchResultsProps) {
  return (
    <CatalogResults
      emptyCopy={queryError || "Try a card name, set code, or a query such as t:creature c:green."}
      emptyTitle={queryError ? "Search query not understood" : "No matching cards"}
      error={error}
      grid={grid}
      hasMore={hasMore}
      imagesReady={imagesReady}
      items={cards.map((card) => ({ card, status: "visible" as const }))}
      loading={loading}
      origin={origin}
      total={total}
      onLoadMore={onLoadMore}
    />
  );
}

export function UpcomingSearchResults({
  error,
  grid,
  hasMore,
  imagesReady,
  loading,
  onLoadMore,
  origin,
  printings,
  total,
}: UpcomingSearchResultsProps) {
  return (
    <CatalogResults
      emptyCopy="The installed catalog has no future printings."
      emptyTitle="No upcoming cards"
      error={error}
      grid={grid}
      hasMore={hasMore}
      imagesReady={imagesReady}
      items={printings}
      loading={loading}
      origin={origin}
      total={total}
      onLoadMore={onLoadMore}
    />
  );
}

type CatalogResultsProps = CommonSearchResultsProps & {
  emptyCopy: string;
  emptyTitle: string;
  items: CatalogResultItem[];
};

function CatalogResults({
  emptyCopy,
  emptyTitle,
  error,
  grid,
  hasMore,
  imagesReady,
  items,
  loading,
  onLoadMore,
  origin,
  total,
}: CatalogResultsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const imageIds = useMemo(
    () =>
      items.flatMap((item) => {
        if (item.status === "protected") return [];
        return (grid ? item.card.gridImage : item.card.image) ? [item.card.id] : [];
      }),
    [grid, items],
  );
  const imageLoading = useCatalogImageLoading(listRef, imageIds, grid, imagesReady, "240px 0px");

  if (error) {
    return (
      <div {...stylex.props(styles.message)} role="alert">
        <span {...stylex.props(styles.messageMark)} aria-hidden="true">
          !
        </span>
        <div>
          <strong {...stylex.props(styles.messageTitle)}>Index unavailable</strong>
          <p {...stylex.props(styles.messageCopy)}>{error}</p>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !loading) {
    return (
      <div {...stylex.props(styles.message)}>
        <span {...stylex.props(styles.messageMark)} aria-hidden="true">
          0
        </span>
        <div>
          <strong {...stylex.props(styles.messageTitle)}>{emptyTitle}</strong>
          <p {...stylex.props(styles.messageCopy)}>{emptyCopy}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!grid ? (
        <div {...stylex.props(styles.columnHead)} aria-hidden="true">
          <span>Card</span>
          <span />
          <span>Printing</span>
        </div>
      ) : null}
      <ol ref={listRef} {...stylex.props(styles.cardList, grid && styles.cardGrid)} start={1}>
        {items.map((item) => {
          const card = item.status === "visible" ? item.card : null;
          const printingId = item.status === "visible" ? item.card.id : item.printingId;
          const image = card ? (grid ? card.gridImage : card.image) : null;
          const imageActive = imageLoading.ids.has(printingId);
          const imageFailed = imageLoading.failed.has(printingId);

          return (
            <li {...stylex.props(styles.cardItem)} key={printingId}>
              <Link
                {...stylex.props(styles.cardRow, grid && styles.cardTile)}
                params={{ printingId }}
                state={withCatalogSearchOrigin(origin)}
                to="/cards/$printingId"
              >
                <PrintingImage
                  alt={card ? `${card.name}, ${card.setName ?? card.setCode} printing` : ""}
                  compact={!grid}
                  concealed={item.status === "protected"}
                  failed={imageFailed}
                  image={image}
                  imageActive={imageActive}
                  imageKey={`${imageLoading.generation}:${printingId}`}
                  placeholder={
                    item.status === "protected" ? (
                      <div {...stylex.props(styles.protectedArtwork)}>
                        <CatalogSetSymbol
                          code={item.release.code}
                          size={grid ? "large" : "small"}
                          symbol={item.release.symbol}
                        />
                        {grid ? (
                          <span {...stylex.props(styles.protectedArtworkLabel)}>Protected</span>
                        ) : null}
                      </div>
                    ) : undefined
                  }
                  onImageError={() => imageLoading.settle(printingId, true)}
                  onImageLoad={() => imageLoading.settle(printingId)}
                />
                <div {...stylex.props(styles.cardIdentity, grid && styles.tileIdentity)}>
                  <strong {...stylex.props(styles.cardName, grid && styles.tileName)}>
                    {card?.name ?? "Protected preview"}
                  </strong>
                  {item.status === "protected" ? (
                    <span {...stylex.props(styles.protectedCopy)}>Spoiler protection</span>
                  ) : null}
                </div>
                <div {...stylex.props(styles.printing, grid && styles.tilePrinting)}>
                  <span {...stylex.props(styles.printingCopy)}>
                    {item.status === "visible" ? item.card.setName : item.release.name}
                  </span>
                  <span {...stylex.props(styles.printingCopy, styles.printingNumber)}>
                    {item.status === "visible"
                      ? `#${item.card.collectorNumber}`
                      : item.release.code}
                  </span>
                  {item.releasedOn ? (
                    <time
                      {...stylex.props(styles.printingCopy, styles.releaseDate)}
                      dateTime={item.releasedOn}
                    >
                      {formatSpoilerReleaseDate(item.releasedOn)}
                    </time>
                  ) : null}
                </div>
              </Link>
              {card && !card.isDigital ? (
                <div
                  {...stylex.props(styles.collectionAction, grid && styles.tileCollectionAction)}
                >
                  <AddToCollectionButton compact printingId={card.id} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {hasMore ? (
        <Button
          style={styles.moreButton}
          disabled={loading}
          variant="secondary"
          type="button"
          onClick={onLoadMore}
        >
          <span>{loading ? "Reading…" : "Show 100 more"}</span>
          <span {...stylex.props(styles.moreCount)}>
            {items.length.toLocaleString()}
            {total === null ? "+" : ` / ${total.toLocaleString()}`}
          </span>
        </Button>
      ) : null}
    </>
  );
}

const styles = stylex.create({
  columnHead: {
    padding: "8px 64px 12px 12px",
    display: "grid",
    gridTemplateColumns: "64px minmax(0, 1fr) minmax(180px, .7fr)",
    alignItems: "center",
    color: "#85887f",
    fontSize: "12px",
    "@media (max-width: 700px)": { display: "none" },
  },
  cardList: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "4px" },
  cardItem: { minWidth: 0, position: "relative" },
  collectionAction: { position: "absolute", zIndex: 3, right: "12px", top: "28px" },
  tileCollectionAction: { right: "8px", top: "8px" },
  cardGrid: {
    paddingBlock: "4px 32px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))",
    gap: "30px 22px",
  },
  cardRow: {
    minHeight: "88px",
    padding: "10px 64px 10px 12px",
    display: "grid",
    gridTemplateColumns: "64px minmax(0, 1fr) minmax(180px, .7fr)",
    alignItems: "center",
    borderRadius: "9px",
    color: "inherit",
    textDecoration: "none",
    ":hover": { backgroundColor: "#191b18" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "2px" },
    "@media (max-width: 700px)": { gridTemplateColumns: "54px minmax(0, 1fr)", rowGap: "4px" },
  },
  cardTile: {
    minWidth: 0,
    minHeight: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "start",
    alignContent: "start",
    ":hover": { backgroundColor: "transparent" },
    "@media (max-width: 700px)": { gridTemplateColumns: "minmax(0, 1fr)", rowGap: 0 },
  },
  protectedArtwork: { display: "grid", placeItems: "center", gap: "14px" },
  protectedArtworkLabel: { color: "#a6a89d", fontSize: "12px" },
  cardIdentity: { minWidth: 0, paddingRight: "20px", display: "grid", gap: "6px" },
  cardName: {
    color: "#f4f1e8",
    fontSize: "16px",
    fontWeight: 400,
    letterSpacing: "-.01em",
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
  tileIdentity: { padding: "13px 2px 0" },
  tileName: { fontSize: "15px", lineHeight: 1.35 },
  protectedCopy: { color: "#9eaf9e", fontSize: "11px", lineHeight: 1.4 },
  printing: { minWidth: 0, "@media (max-width: 700px)": { gridColumn: "2", paddingBottom: "4px" } },
  tilePrinting: { padding: "5px 2px 0", "@media (max-width: 700px)": { gridColumn: "auto" } },
  printingCopy: {
    color: "#989b92",
    fontSize: "12px",
    lineHeight: 1.5,
    display: "block",
    overflowWrap: "anywhere",
  },
  printingNumber: { display: "inline-block", color: "#787d73", fontSize: "11px", marginTop: "2px" },
  releaseDate: { marginTop: "5px", color: "#b5b8ae" },
  message: {
    minHeight: "240px",
    padding: "40px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "24px",
    backgroundColor: "#131413",
    borderRadius: "12px",
  },
  messageMark: {
    width: "48px",
    height: "64px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "6px",
    color: colors.accent,
    backgroundColor: "#213326",
    fontSize: "24px",
    boxShadow: "7px 5px 0 #1b231d",
  },
  messageTitle: { color: "#f4f1e8", fontSize: "22px", fontWeight: 400 },
  messageCopy: {
    maxWidth: "440px",
    margin: "10px 0 0",
    color: "#989b92",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  moreButton: {
    display: "flex",
    gap: "20px",
    margin: "24px auto 0",
    height: "40px",
    paddingInline: "18px",
    borderWidth: 0,
    fontSize: "13px",
  },
  moreCount: { color: "#989b92", fontVariantNumeric: "tabular-nums" },
});
