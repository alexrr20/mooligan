import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef } from "react";

import { colors } from "../../styles/tokens.stylex.js";
import { useCatalogImageLoading } from "../catalog/catalog-image-loading";
import { CatalogSetSymbol } from "../catalog/catalog-set-symbol";
import { PrintingImage } from "../cards/printing-image";
import { PrintingPrices } from "../cards/printing-prices";
import { type CatalogSearchOrigin, withCatalogSearchOrigin } from "./catalog-search-origin";
import { formatSpoilerReleaseDate } from "../spoilers/spoiler-ui-state";

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
  total,
}: SearchResultsProps) {
  return (
    <CatalogResults
      emptyCopy="Try a card name or a three-letter set code."
      emptyTitle="No matching cards"
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
          <span>No.</span>
          <span>Image</span>
          <span>Card</span>
          <span>Printing</span>
        </div>
      ) : null}
      <ol ref={listRef} {...stylex.props(styles.cardList, grid && styles.cardGrid)} start={1}>
        {items.map((item, index) => {
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
                {!grid ? (
                  <span {...stylex.props(styles.rowNumber)}>
                    {String(index + 1).padStart(3, "0")}
                  </span>
                ) : null}
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
                {grid && item.status === "visible" ? (
                  <div {...stylex.props(styles.tilePrices)}>
                    <PrintingPrices />
                  </div>
                ) : null}
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
                  {!grid && item.status === "visible" ? <PrintingPrices /> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      {hasMore ? (
        <Button
          {...stylex.props(styles.moreButton)}
          disabled={loading}
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
    minHeight: "34px",
    display: "grid",
    gridTemplateColumns: {
      default: "54px 62px minmax(0, 1fr) minmax(180px, 0.72fr)",
      "@media (max-width: 820px)": "42px 52px minmax(0, 1fr) 150px",
    },
    alignItems: "center",
    borderBottom: "1px solid #34362f",
    color: "#8f9287",
    fontSize: "7px",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  },
  cardList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  cardItem: {
    minWidth: 0,
  },
  cardGrid: {
    paddingBlock: "22px 30px",
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(auto-fill, minmax(164px, 1fr))",
      "@media (max-width: 820px)": "repeat(auto-fill, minmax(148px, 1fr))",
    },
    gap: "28px 18px",
    borderBottom: "1px solid #34362f",
  },
  cardRow: {
    minHeight: "88px",
    paddingBlock: "10px",
    display: "grid",
    gridTemplateColumns: {
      default: "54px 62px minmax(0, 1fr) minmax(180px, 0.72fr)",
      "@media (max-width: 820px)": "42px 52px minmax(0, 1fr) 150px",
    },
    alignItems: "center",
    borderBottom: "1px solid #34362f",
    color: "inherit",
    textDecoration: "none",
    transition: "background-color 140ms ease, padding 140ms ease",
    ":hover": {
      paddingInline: "8px",
      backgroundColor: "rgba(255, 255, 255, 0.04)",
    },
    ":focus-visible": {
      position: "relative",
      zIndex: 2,
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
  rowNumber: {
    color: "#85887e",
    fontSize: "8px",
    letterSpacing: "0.06em",
  },
  cardTile: {
    minWidth: 0,
    minHeight: 0,
    paddingBlock: 0,
    position: "relative",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "start",
    alignContent: "start",
    borderBottom: 0,
    transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
    ":hover": {
      paddingInline: 0,
      backgroundColor: "transparent",
    },
    "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)": {
      ":hover": {
        transform: "translateY(-4px)",
      },
    },
  },
  protectedArtwork: {
    display: "grid",
    placeItems: "center",
    gap: "14px",
  },
  protectedArtworkLabel: {
    color: "#a6a89d",
    fontSize: "7px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  cardIdentity: {
    minWidth: 0,
    paddingRight: "22px",
    display: "grid",
    gap: "3px",
  },
  cardName: {
    overflow: "hidden",
    color: "#f4f1e8",
    fontSize: "18px",
    fontWeight: 400,
    letterSpacing: "-0.015em",
    lineHeight: 1.1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileIdentity: {
    padding: "12px 4px 0",
  },
  tileName: {
    overflow: "visible",
    fontSize: "17px",
    lineHeight: 1.05,
    textOverflow: "clip",
    whiteSpace: "normal",
  },
  protectedCopy: {
    color: colors.accent,
    fontSize: "7px",
    letterSpacing: "0.11em",
    lineHeight: 1.4,
    textTransform: "uppercase",
  },
  printing: {
    minWidth: 0,
  },
  tilePrinting: {
    padding: "10px 4px 0",
  },
  printingCopy: {
    overflow: "hidden",
    color: "#8f9287",
    fontSize: "7px",
    letterSpacing: "0.05em",
    lineHeight: 1.55,
    display: "block",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  printingNumber: {
    marginTop: "2px",
  },
  releaseDate: {
    marginTop: "6px",
    color: "#c0c2b8",
  },
  tilePrices: {
    paddingInline: "4px",
  },
  message: {
    minHeight: "180px",
    display: "flex",
    alignItems: "center",
    gap: "22px",
    borderBottom: "1px solid #34362f",
  },
  messageMark: {
    width: "54px",
    height: "72px",
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    border: "1px solid #1b1d19",
    borderRadius: "3px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
    fontSize: "9px",
    boxShadow: "6px 6px 0 #242620",
  },
  messageTitle: {
    color: "#f4f1e8",
    fontSize: "22px",
    fontWeight: 400,
  },
  messageCopy: {
    margin: "6px 0 0",
    color: "#a6a89d",
    fontSize: "11px",
  },
  moreButton: {
    width: "100%",
    minHeight: "58px",
    paddingInline: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: "0 0 1px",
    borderStyle: "solid",
    borderColor: "#55584f",
    borderRadius: 0,
    color: "#f4f1e8",
    backgroundColor: "transparent",
    fontSize: "8px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "background-color 160ms ease",
    ":hover:not(:disabled)": {
      color: "#1b1d19",
      backgroundColor: colors.accent,
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
    ":disabled": {
      cursor: "wait",
      opacity: 0.58,
    },
  },
  moreCount: {
    color: "inherit",
    opacity: 0.72,
  },
});
