import type { CatalogSiblingPrinting } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import { colors } from "../../styles/tokens.stylex.js";
import { useCatalogImageLoading } from "../catalog/catalog-image-loading";
import { type CardDetailOrigin, withCardDetailOrigin } from "./card-detail-origin";
import { PrintingImage } from "./printing-image";
import {
  getInitialGalleryVisibleCount,
  getNextGalleryVisibleCount,
} from "./printing-gallery-pagination";

type PrintingGalleryProps = {
  cardName: string;
  origin: CardDetailOrigin | null;
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
          <h2 {...stylex.props(styles.title)} id="printing-gallery-heading">
            Printings
          </h2>
          <p {...stylex.props(styles.description)}>
            Choose an edition to see its artwork and printing details.
          </p>
        </div>
        <p {...stylex.props(styles.count)}>
          Showing {visiblePrintings.length.toLocaleString()} / {printings.length.toLocaleString()}
        </p>
      </div>

      <ul ref={listRef} {...stylex.props(styles.grid)}>
        {visiblePrintings.map((printing) => {
          const selected = printing.id === selectedPrintingId;
          const imageActive = imageLoading.ids.has(printing.id);
          const imageFailed = imageLoading.failed.has(printing.id);

          return (
            <li {...stylex.props(styles.item)} key={printing.id}>
              <Link
                {...stylex.props(styles.link, selected && styles.linkSelected)}
                aria-current={selected ? "page" : undefined}
                params={{ printingId: printing.id }}
                state={withCardDetailOrigin(origin)}
                to="/cards/$printingId"
              >
                <PrintingImage
                  alt={`${cardName}, ${printing.setName} (${printing.setCode.toUpperCase()}) number ${printing.collectorNumber}`}
                  failed={imageFailed}
                  image={printing.image}
                  imageActive={imageActive}
                  imageKey={`${imageLoading.generation}:${printing.id}`}
                  onImageError={() => imageLoading.settle(printing.id, true)}
                  onImageLoad={() => imageLoading.settle(printing.id)}
                />

                <div {...stylex.props(styles.identity)}>
                  <div {...stylex.props(styles.setLine)}>
                    <strong {...stylex.props(styles.setName)}>{printing.setName}</strong>
                    {selected ? <span {...stylex.props(styles.currentLabel)}>Selected</span> : null}
                  </div>
                  <p {...stylex.props(styles.printingMeta)}>
                    {printing.setCode.toUpperCase()} · #{printing.collectorNumber}
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
        <Button
          style={styles.moreButton}
          variant="secondary"
          type="button"
          onClick={() =>
            setVisibleCount((current) => getNextGalleryVisibleCount(printings.length, current))
          }
        >
          <span>Show 24 more</span>
          <span {...stylex.props(styles.moreCount)}>
            {visibleCount.toLocaleString()} / {printings.length.toLocaleString()}
          </span>
        </Button>
      ) : null}
    </section>
  );
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = stylex.create({
  section: { marginTop: "64px" },
  headingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "16px 32px",
  },
  title: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "24px",
    fontWeight: 500,
    letterSpacing: "-.02em",
    lineHeight: 1.3,
  },
  description: { margin: "8px 0 0", color: "#989b92", fontSize: "13px", lineHeight: 1.6 },
  count: { margin: 0, color: "#989b92", fontSize: "12px", fontVariantNumeric: "tabular-nums" },
  grid: {
    margin: "26px 0 0",
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))",
    gap: "30px 22px",
    listStyle: "none",
  },
  item: { minWidth: 0 },
  link: {
    minWidth: 0,
    display: "block",
    color: "inherit",
    textDecoration: "none",
    borderRadius: "6px",
    transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "5px" },
    "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)": {
      ":hover": { transform: "translateY(-3px)" },
    },
  },
  linkSelected: { color: "#f4f1e8" },
  currentLabel: {
    padding: "3px 6px",
    alignSelf: "start",
    borderRadius: "4px",
    color: colors.accent,
    backgroundColor: "#13271c",
    fontSize: "10px",
    lineHeight: 1.4,
  },
  identity: { padding: "13px 2px 0" },
  setLine: { display: "flex", alignItems: "start", flexWrap: "wrap", gap: "8px" },
  setName: {
    color: "#dedfd5",
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  printingMeta: {
    margin: "6px 0 0",
    color: "#989b92",
    fontSize: "12px",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  labels: { marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" },
  label: {
    padding: "3px 7px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "4px",
    color: "#a6a89d",
    backgroundColor: "#1b1c1b",
    fontSize: "11px",
    lineHeight: 1.4,
  },
  moreButton: {
    display: "flex",
    gap: "20px",
    margin: "28px auto 0",
    height: "40px",
    paddingInline: "18px",
    borderWidth: 0,
    fontSize: "13px",
  },
  moreCount: { color: "#989b92", fontVariantNumeric: "tabular-nums" },
});
