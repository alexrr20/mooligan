import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { colors } from "../../styles/tokens.stylex.js";
import { SearchImageLoading } from "./search-image-loading";

type SearchResultsProps = {
  cards: CatalogCardSummary[];
  error: string;
  grid: boolean;
  hasMore: boolean;
  imagesReady: boolean;
  loading: boolean;
  onLoadMore: () => void;
  total: number | null;
};

type ActiveImages = {
  generation: number;
  ids: ReadonlySet<string>;
};

export function SearchResults({
  cards,
  error,
  grid,
  hasMore,
  imagesReady,
  loading,
  onLoadMore,
  total,
}: SearchResultsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const observerRef = useRef<IntersectionObserver>(null);
  const generationRef = useRef(0);
  const [activeImages, setActiveImages] = useState<ActiveImages>({
    generation: 0,
    ids: new Set(),
  });
  const coordinator = useMemo(
    () =>
      new SearchImageLoading((id, generation) => {
        setActiveImages((current) => {
          if (current.generation !== generation) {
            return { generation, ids: new Set([id]) };
          }
          if (current.ids.has(id)) {
            return current;
          }

          const ids = new Set(current.ids);
          ids.add(id);
          return { generation, ids };
        });
      }),
    [],
  );
  const imageIds = useMemo(
    () => cards.flatMap((card) => ((grid ? card.gridImageUrl : card.imageUrl) ? [card.id] : [])),
    [cards, grid],
  );

  useLayoutEffect(() => {
    const generation = coordinator.reset();
    generationRef.current = generation;
    setActiveImages({ generation, ids: new Set() });

    if (!imagesReady) {
      return () => {
        coordinator.reset();
      };
    }

    let initialObservation = true;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIds = entries.flatMap((entry) => {
          const id = (entry.target as HTMLElement).dataset.imageId;
          return entry.isIntersecting && id ? [id] : [];
        });

        if (initialObservation) {
          initialObservation = false;
          coordinator.initialVisible(visibleIds, generation);
        } else {
          coordinator.visible(visibleIds, generation);
        }
      },
      { root: null, rootMargin: "0px" },
    );
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      if (observerRef.current === observer) {
        observerRef.current = null;
      }
      coordinator.reset();
    };
  }, [coordinator, grid, imagesReady]);

  useLayoutEffect(() => {
    if (!imagesReady) {
      return;
    }

    const generation = generationRef.current;
    coordinator.append(imageIds, generation);
    const observer = observerRef.current;
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-image-id]")
      .forEach((frame) => observer?.observe(frame));
  }, [coordinator, imageIds, imagesReady]);

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

  if (cards.length === 0 && !loading) {
    return (
      <div {...stylex.props(styles.message)}>
        <span {...stylex.props(styles.messageMark)} aria-hidden="true">
          0
        </span>
        <div>
          <strong {...stylex.props(styles.messageTitle)}>No matching cards</strong>
          <p {...stylex.props(styles.messageCopy)}>Try a card name or a three-letter set code.</p>
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
          <span>Card / Type</span>
          <span>Printing</span>
        </div>
      ) : null}
      <ol ref={listRef} {...stylex.props(styles.cardList, grid && styles.cardGrid)} start={1}>
        {cards.map((card, index) => {
          const imageUrl = grid ? card.gridImageUrl : card.imageUrl;
          const imageActive = imageUrl && activeImages.ids.has(card.id);

          return (
            <li {...stylex.props(styles.cardRow, grid && styles.cardTile)} key={card.id}>
              <span {...stylex.props(styles.rowNumber, grid && styles.tileNumber)}>
                {String(index + 1).padStart(3, "0")}
              </span>
              <div
                {...stylex.props(styles.cardImageFrame, grid && styles.tileImageFrame)}
                data-image-id={imageUrl ? card.id : undefined}
              >
                {imageActive ? (
                  <img
                    {...stylex.props(styles.cardImage)}
                    key={`${activeImages.generation}:${card.id}`}
                    alt={`${card.name}, ${card.setName ?? card.setCode} printing`}
                    decoding="async"
                    loading="eager"
                    src={imageUrl}
                    onError={() => coordinator.settled(card.id, activeImages.generation)}
                    onLoad={() => coordinator.settled(card.id, activeImages.generation)}
                  />
                ) : imageUrl ? null : (
                  <span {...stylex.props(styles.cardImageFallback)}>No art</span>
                )}
              </div>
              <div {...stylex.props(styles.cardIdentity, grid && styles.tileIdentity)}>
                <strong {...stylex.props(styles.cardName, grid && styles.tileName)}>
                  {card.name}
                </strong>
                <span {...stylex.props(styles.typeLine)}>{card.typeLine ?? "Card"}</span>
              </div>
              <div {...stylex.props(styles.printing, grid && styles.tilePrinting)}>
                <span {...stylex.props(styles.setCode)}>{card.setCode}</span>
                <span {...stylex.props(styles.printingCopy)}>
                  {card.setName ?? "Unknown set"} · #{card.collectorNumber}
                  {card.rarity ? ` · ${card.rarity}` : ""}
                </span>
              </div>
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
            {cards.length.toLocaleString()}
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
    transition: "background-color 140ms ease, padding 140ms ease",
    ":hover": {
      paddingInline: "8px",
      backgroundColor: "rgba(255, 255, 255, 0.04)",
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
  tileNumber: {
    minWidth: "31px",
    minHeight: "22px",
    paddingInline: "5px",
    position: "absolute",
    zIndex: 1,
    top: "9px",
    left: "9px",
    display: "grid",
    placeItems: "center",
    border: "1px solid #1b1d19",
    borderRadius: "2px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
  },
  cardImageFrame: {
    width: {
      default: "46px",
      "@media (max-width: 820px)": "40px",
    },
    aspectRatio: "5 / 7",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    border: "1px solid #34362f",
    borderRadius: "3px",
    backgroundColor: "#1b1d19",
    boxShadow: "3px 3px 0 rgba(0, 0, 0, 0.35)",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "cover",
  },
  cardImageFallback: {
    color: "#a6a89d",
    fontSize: "6px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  tileImageFrame: {
    width: "100%",
    borderRadius: "5px",
    boxShadow: "6px 6px 0 rgba(0, 0, 0, 0.4)",
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
    padding: "15px 4px 0",
  },
  tileName: {
    overflow: "visible",
    fontSize: "17px",
    lineHeight: 1.05,
    textOverflow: "clip",
    whiteSpace: "normal",
  },
  typeLine: {
    overflow: "hidden",
    color: "#a6a89d",
    fontSize: "9px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  printing: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr)",
    alignItems: "center",
    gap: "10px",
  },
  tilePrinting: {
    padding: "10px 4px 0",
    gridTemplateColumns: "40px minmax(0, 1fr)",
    gap: "8px",
  },
  setCode: {
    minHeight: "24px",
    display: "grid",
    placeItems: "center",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.accent,
    borderRadius: "2px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
    fontSize: "8px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  printingCopy: {
    overflow: "hidden",
    color: "#8f9287",
    fontSize: "7px",
    letterSpacing: "0.05em",
    lineHeight: 1.55,
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
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
