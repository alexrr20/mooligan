import type { CatalogSiblingPrinting } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { colors } from "../../styles/tokens.stylex.js";
import { catalogImageUrl } from "../catalog/catalog-image";
import { useCatalogImageLoading } from "../catalog/catalog-image-loading";
import {
  type CatalogSearchOrigin,
  getInitialGalleryVisibleCount,
  getNextGalleryVisibleCount,
  withCatalogSearchOrigin,
} from "./card-navigation";

type PrintingGalleryProps = {
  cardName: string;
  origin: CatalogSearchOrigin | null;
  printings: readonly CatalogSiblingPrinting[];
  selectedPrintingId: string;
};

export function PrintingGallery({
  cardName,
  origin,
  printings,
  selectedPrintingId,
}: PrintingGalleryProps) {
  const selectedIndex = printings.findIndex((printing) => printing.id === selectedPrintingId);
  const [visibleCount, setVisibleCount] = useState(() =>
    getInitialGalleryVisibleCount(printings.length, selectedIndex),
  );
  const listRef = useRef<HTMLUListElement>(null);

  const visiblePrintings = printings.slice(0, visibleCount);
  const imageIds = useMemo(
    () =>
      printings.slice(0, visibleCount).flatMap((printing) => (printing.image ? [printing.id] : [])),
    [printings, visibleCount],
  );
  const imageLoading = useCatalogImageLoading(
    listRef,
    imageIds,
    selectedPrintingId,
    true,
    "360px 0px",
  );

  useLayoutEffect(() => {
    setVisibleCount(getInitialGalleryVisibleCount(printings.length, selectedIndex));
  }, [printings.length, selectedIndex, selectedPrintingId]);

  return (
    <section {...stylex.props(styles.section)} aria-labelledby="printing-gallery-heading">
      <div {...stylex.props(styles.headingRow)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>04 / Editions</p>
          <h2 {...stylex.props(styles.title)} id="printing-gallery-heading">
            Sibling printings
          </h2>
        </div>
        <p {...stylex.props(styles.count)}>
          Showing {visiblePrintings.length.toLocaleString()} / {printings.length.toLocaleString()}
        </p>
      </div>

      <ul ref={listRef} {...stylex.props(styles.grid)}>
        {visiblePrintings.map((printing, index) => {
          const selected = printing.id === selectedPrintingId;
          const imageActive = imageLoading.ids.has(printing.id);
          const imageFailed = imageLoading.failed.has(printing.id);

          return (
            <li {...stylex.props(styles.item)} key={printing.id}>
              <Link
                {...stylex.props(styles.link, selected && styles.linkSelected)}
                aria-current={selected ? "page" : undefined}
                params={{ printingId: printing.id }}
                state={withCatalogSearchOrigin(origin)}
                to="/cards/$printingId"
              >
                <div
                  {...stylex.props(styles.imageFrame)}
                  data-catalog-image-id={printing.image ? printing.id : undefined}
                >
                  <span {...stylex.props(styles.index)} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {printing.image && imageActive && !imageFailed ? (
                    <img
                      {...stylex.props(styles.image)}
                      key={`${imageLoading.generation}:${printing.id}`}
                      alt={`${cardName}, ${printing.setName} (${printing.setCode.toUpperCase()}) number ${printing.collectorNumber}`}
                      decoding="async"
                      loading="eager"
                      src={catalogImageUrl(printing.image)}
                      onError={() => imageLoading.settle(printing.id, true)}
                      onLoad={() => imageLoading.settle(printing.id)}
                    />
                  ) : !printing.image || imageFailed ? (
                    <span {...stylex.props(styles.imageFallback)}>
                      {imageFailed ? "Art offline" : "No art"}
                    </span>
                  ) : null}
                  {selected ? <span {...stylex.props(styles.currentLabel)}>Selected</span> : null}
                </div>

                <div {...stylex.props(styles.identity)}>
                  <div {...stylex.props(styles.setLine)}>
                    <strong {...stylex.props(styles.setName)}>{printing.setName}</strong>
                    <span {...stylex.props(styles.setCode)}>{printing.setCode.toUpperCase()}</span>
                  </div>
                  <p {...stylex.props(styles.printingMeta)}>
                    #{printing.collectorNumber}
                    {printing.releasedOn ? ` · ${printing.releasedOn.slice(0, 4)}` : ""}
                    {` · ${titleCase(printing.rarity)}`}
                    {printing.language ? ` · ${printing.language.toUpperCase()}` : ""}
                  </p>
                  {printing.isPromo || printing.isDigital ? (
                    <div {...stylex.props(styles.labels)}>
                      {printing.isPromo ? <span {...stylex.props(styles.label)}>Promo</span> : null}
                      {printing.isDigital ? (
                        <span {...stylex.props(styles.label)}>Digital</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {visibleCount < printings.length ? (
        <button
          {...stylex.props(styles.moreButton)}
          type="button"
          onClick={() =>
            setVisibleCount((current) => getNextGalleryVisibleCount(printings.length, current))
          }
        >
          <span>Show 24 more</span>
          <span {...stylex.props(styles.moreCount)}>
            {visibleCount.toLocaleString()} / {printings.length.toLocaleString()}
          </span>
        </button>
      ) : null}
    </section>
  );
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = stylex.create({
  section: {
    marginTop: {
      default: "82px",
      "@media (max-width: 820px)": "62px",
    },
    paddingTop: "30px",
    borderTop: "1px solid #55584f",
  },
  headingRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "32px",
  },
  eyebrow: {
    margin: "0 0 12px",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: {
      default: "34px",
      "@media (max-width: 820px)": "29px",
    },
    fontWeight: 400,
    letterSpacing: "-0.035em",
    lineHeight: 1,
  },
  count: {
    margin: 0,
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  grid: {
    margin: "28px 0 0",
    padding: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(auto-fill, minmax(154px, 1fr))",
      "@media (max-width: 820px)": "repeat(auto-fill, minmax(142px, 1fr))",
    },
    gap: "30px 16px",
    listStyle: "none",
  },
  item: {
    minWidth: 0,
  },
  link: {
    minWidth: 0,
    display: "block",
    color: "inherit",
    textDecoration: "none",
    transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "5px",
    },
    "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)": {
      ":hover": {
        transform: "translateY(-3px)",
      },
    },
  },
  linkSelected: {
    color: "#f4f1e8",
  },
  imageFrame: {
    width: "100%",
    aspectRatio: "5 / 7",
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    border: "1px solid #34362f",
    borderRadius: "4px",
    backgroundColor: "#171815",
    boxShadow: "6px 7px 0 rgba(0, 0, 0, 0.38)",
  },
  index: {
    minWidth: "27px",
    minHeight: "20px",
    paddingInline: "5px",
    position: "absolute",
    zIndex: 2,
    top: "8px",
    left: "8px",
    display: "grid",
    placeItems: "center",
    borderRadius: "2px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
    fontSize: "7px",
    letterSpacing: "0.08em",
  },
  image: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "cover",
  },
  imageFallback: {
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  currentLabel: {
    minHeight: "24px",
    paddingInline: "8px",
    position: "absolute",
    zIndex: 2,
    right: "8px",
    bottom: "8px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "2px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
    fontSize: "7px",
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  identity: {
    padding: "13px 3px 0",
  },
  setLine: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "start",
    gap: "9px",
  },
  setName: {
    overflow: "hidden",
    color: "#e1ded5",
    fontSize: "11px",
    fontWeight: 400,
    lineHeight: 1.25,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  setCode: {
    color: colors.accent,
    fontSize: "7px",
    letterSpacing: "0.08em",
  },
  printingMeta: {
    margin: "7px 0 0",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.055em",
    lineHeight: 1.45,
    textTransform: "uppercase",
  },
  labels: {
    marginTop: "8px",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
  },
  label: {
    minHeight: "19px",
    paddingInline: "6px",
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #55584f",
    borderRadius: "999px",
    color: "#a6a89d",
    fontSize: "6px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  moreButton: {
    width: "100%",
    minHeight: "58px",
    marginTop: "34px",
    paddingInline: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: "1px 0",
    borderStyle: "solid",
    borderColor: "#55584f",
    borderRadius: 0,
    color: "#f4f1e8",
    backgroundColor: "transparent",
    fontSize: "8px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "color 150ms ease, background-color 150ms ease",
    ":hover": {
      color: "#1b1d19",
      backgroundColor: colors.accent,
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
  moreCount: {
    opacity: 0.7,
  },
});
