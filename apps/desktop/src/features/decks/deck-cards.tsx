import { PrintingPrice } from "../prices/printing-price";
import type { Deck, DeckEntry } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef } from "react";

import { Button } from "../../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { PrintingImage } from "../cards/printing-image";
import { useCatalogImageLoading } from "../catalog/catalog-image-loading";
import { deckStyles } from "./deck-controls";
import { withDeckOrigin } from "./deck-origin";
import { ownershipKey, type summarizeDeck } from "./deck-summary";
import { useDeckViewPreference } from "./use-deck-view-preference";

export function DeckCards({
  deck,
  printings,
  summary,
  onEdit,
  onRemove,
}: {
  deck: Deck;
  printings: ReadonlyMap<string, CatalogPrintingResult | null>;
  summary: ReturnType<typeof summarizeDeck>;
  onEdit: (entry: DeckEntry) => void;
  onRemove: (entry: DeckEntry) => void;
}) {
  const { view, setView } = useDeckViewPreference();
  const grid = view === "grid";
  const containerRef = useRef<HTMLDivElement>(null);
  const images = useMemo(
    () =>
      new Map(
        [...printings].map(([id, printing]) => [
          id,
          printing?.status === "visible"
            ? printing.detail.selectedPrinting.images.find(
                (image) => image.faceIndex === 0 && image.size === "normal",
              )
            : undefined,
        ]),
      ),
    [printings],
  );
  const imageIds = useMemo(
    () => [...images].flatMap(([id, image]) => (image ? [id] : [])),
    [images],
  );
  const imageLoading = useCatalogImageLoading(containerRef, imageIds, grid, grid, "240px 0px");

  return (
    <div ref={containerRef} {...stylex.props(styles.sections)}>
      <div {...stylex.props(deckStyles.header)}>
        <h2 {...stylex.props(deckStyles.sectionTitle)}>Cards</h2>
        <ToggleGroup
          aria-label="Deck card view"
          value={[view]}
          variant="outline"
          spacing={0}
          onValueChange={(nextViews) => {
            const nextView = nextViews[0];
            if (nextView) setView(nextView);
          }}
        >
          <ToggleGroupItem value="list" type="button">
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" type="button">
            Grid
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {summary.sections.map(({ value, label, quantity, entries }) => (
        <section key={value} {...stylex.props(deckStyles.panel)} aria-label={label}>
          <h3 {...stylex.props(deckStyles.sectionTitle)}>
            {label} · {quantity}
          </h3>
          {!quantity ? <p {...stylex.props(deckStyles.muted)}>No cards in this section.</p> : null}
          <ul {...stylex.props(deckStyles.list, grid && styles.grid)}>
            {entries
              .toSorted((a, b) => {
                const left = printings.get(a.printingId);
                const right = printings.get(b.printingId);
                return (
                  Number(b.section === "commander") - Number(a.section === "commander") ||
                  (left?.status === "visible" ? left.detail.card.name : "").localeCompare(
                    right?.status === "visible" ? right.detail.card.name : "",
                  ) ||
                  a.id.localeCompare(b.id)
                );
              })
              .map((entry) => {
                const printing = printings.get(entry.printingId);
                const detail = printing?.status === "visible" ? printing.detail : null;
                const name =
                  detail?.card.name ??
                  (printing?.status === "protected" ? "Protected preview" : "Printing unavailable");
                const legality = detail?.legalities.find(
                  ({ formatId }) => formatId === deck.formatId,
                );
                const owned = summary.owned.get(ownershipKey(entry)) ?? 0;
                const needed = summary.required.get(ownershipKey(entry)) ?? 0;
                return (
                  <li key={entry.id} {...stylex.props(deckStyles.row, grid && styles.tile)}>
                    {grid ? (
                      <Link
                        to="/cards/$printingId"
                        params={{ printingId: entry.printingId }}
                        state={withDeckOrigin({ deckId: deck.id })}
                        search={{}}
                        aria-label={`View ${name}, ${entry.quantity} ${entry.quantity === 1 ? "copy" : "copies"}`}
                        {...stylex.props(styles.artwork)}
                      >
                        <PrintingImage
                          alt=""
                          concealed={printing?.status === "protected"}
                          image={images.get(entry.printingId)}
                          imageActive={imageLoading.ids.has(entry.printingId)}
                          failed={imageLoading.failed.has(entry.printingId)}
                          imageKey={`${imageLoading.generation}:${entry.printingId}`}
                          placeholder={
                            printing?.status === "protected" ? "Protected preview" : undefined
                          }
                          overlay={
                            <strong {...stylex.props(styles.quantity)}>{entry.quantity}×</strong>
                          }
                          onImageError={() => imageLoading.settle(entry.printingId, true)}
                          onImageLoad={() => imageLoading.settle(entry.printingId)}
                        />
                      </Link>
                    ) : (
                      <strong>{entry.quantity}×</strong>
                    )}
                    <div {...stylex.props(deckStyles.grow, grid && styles.identity)}>
                      <Link
                        to="/cards/$printingId"
                        params={{ printingId: entry.printingId }}
                        state={withDeckOrigin({ deckId: deck.id })}
                        search={{}}
                        {...stylex.props(deckStyles.link)}
                      >
                        {name}
                      </Link>
                      {entry.section === "commander" ? (
                        <span {...stylex.props(deckStyles.commanderLabel)}>Commander</span>
                      ) : null}
                      <p {...stylex.props(deckStyles.muted)}>
                        {detail
                          ? `${detail.selectedPrinting.setCode.toUpperCase()} ${detail.selectedPrinting.collectorNumber}`
                          : entry.printingId}{" "}
                        · {entry.finish} · {owned} owned
                        {needed ? ` / ${needed} needed across this deck` : ""}
                        {legality && legality.status !== "legal"
                          ? ` · ${legality.status.replaceAll("_", " ")}`
                          : ""}
                      </p>
                      {detail && !detail.selectedPrinting.isDigital ? (
                        <PrintingPrice printingId={entry.printingId} finish={entry.finish} />
                      ) : null}
                    </div>
                    <div {...stylex.props(styles.actions)}>
                      <Button
                        variant="secondary"
                        onClick={() => onEdit(entry)}
                        aria-label={`Edit ${name}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => onRemove(entry)}
                        aria-label={`Remove ${name}`}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

const styles = stylex.create({
  sections: { display: "grid", gap: "24px", minWidth: 0 },
  grid: {
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))",
    gap: "24px 20px",
    alignItems: "stretch",
  },
  tile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    flexWrap: "nowrap",
    minWidth: 0,
    paddingBlock: 0,
    borderBottomWidth: 0,
  },
  artwork: {
    display: "block",
    color: "#a6a89d",
    textDecoration: "none",
    borderRadius: "3.5% / 2.5%",
    outline: { default: "none", ":focus-visible": "2px solid #c4ef8c" },
    outlineOffset: "4px",
  },
  quantity: {
    position: "absolute",
    top: "8px",
    left: "8px",
    padding: "3px 9px",
    borderRadius: "4px",
    backgroundColor: "#171915",
    color: "#f4f1e8",
    boxShadow: "0 1px 6px rgb(0 0 0 / 40%)",
  },
  identity: { flex: "1 1 auto", fontSize: "13px" },
  actions: { display: "flex", flexWrap: "wrap", gap: "12px" },
});
