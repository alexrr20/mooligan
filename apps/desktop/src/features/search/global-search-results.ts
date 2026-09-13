import { getCatalogFormatName, type CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { CatalogCardSummary } from "@mooligan/domain/catalog-search";
import type { CollectionHolding } from "@mooligan/domain/collection";
import type { Deck } from "@mooligan/domain/decks";

export type GlobalSearchResult = {
  id: string;
  kind: "card" | "deck" | "collection" | "recent";
  printingId?: string;
  finish?: "nonfoil" | "foil" | "etched" | "glossy";
  label: string;
  description: string;
  image: CatalogImageDescriptor | null;
};

export type GlobalSearchGroup = {
  label: string;
  items: GlobalSearchResult[];
};

export function cardSearchResults(cards: readonly CatalogCardSummary[]): GlobalSearchResult[] {
  return cards.map((card) => ({
    id: card.id,
    kind: "card",
    printingId: card.isDigital ? undefined : card.id,
    label: card.name,
    description: `${card.setName} · ${card.typeLine}`,
    image: card.image,
  }));
}

export function deckSearchResults(decks: readonly Deck[], query: string): GlobalSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return decks
    .filter((deck) =>
      `${deck.name} ${deck.tags.join(" ")} ${deck.notes}`.toLowerCase().includes(normalized),
    )
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase() === normalized) - Number(a.name.toLowerCase() === normalized) ||
        Number(a.archived) - Number(b.archived) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
    .map((deck) => ({
      id: deck.id,
      kind: "deck",
      label: deck.name,
      description: `${getCatalogFormatName(deck.formatId)}${deck.archived ? " · Archived" : ""}`,
      image: null,
    }));
}

export function collectionSearchResults(
  holdings: readonly CollectionHolding[],
): GlobalSearchResult[] {
  return holdings.flatMap((holding) =>
    holding.status === "visible"
      ? [
          {
            id: [holding.printingId, holding.finish, holding.language, holding.condition].join(":"),
            kind: "collection" as const,
            printingId: holding.printingId,
            finish: holding.finish,
            label: holding.name,
            description: `${holding.quantity} ${holding.quantity === 1 ? "copy" : "copies"} · ${holding.setCode.toUpperCase()} · ${holding.finish} · ${holding.language.toUpperCase()} · ${holding.condition.replaceAll("-", " ")}`,
            image: holding.image,
          },
        ]
      : [],
  );
}
