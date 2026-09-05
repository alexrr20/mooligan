import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { Deck } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";

export function commanderArt(
  deck: Pick<Deck, "formatId" | "entries">,
  printings: ReadonlyMap<string, CatalogPrintingResult | null>,
): CatalogImageDescriptor[] {
  if (!["commander", "duel", "paupercommander"].includes(deck.formatId)) return [];

  const commanders = new Set(
    deck.entries
      .filter(({ section }) => section === "commander")
      .map(({ printingId }) => printingId),
  );
  return [...commanders].sort().flatMap((printingId) => {
    const printing = printings.get(printingId);
    if (printing?.status !== "visible") return [];
    const art = printing.detail.selectedPrinting.images.find(
      ({ faceIndex, size }) => faceIndex === 0 && size === "art_crop",
    );
    return art ? [art] : [];
  });
}
