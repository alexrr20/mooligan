import type { CatalogCardIdentity } from "@mooligan/domain/catalog-detail";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";

import type { DeckEntry } from "../deck-contract.ts";

export const manaTypes = ["W", "U", "B", "R", "G", "C"] as const;

/** A modal land back is a land option; a transform back is not. */
export function deckCardTypes(card: CatalogCardIdentity) {
  const types = (card.faces[0]?.typeLine ?? "").split("—")[0]!.split(/\s+/u);
  if (
    !types.includes("Land") &&
    card.layout === "modal_dfc" &&
    card.faces.slice(1).some((face) => /\bLand\b/u.test(face.typeLine.split("—")[0]!))
  )
    types.push("Land");
  return types;
}

/** Curve and costs include commanders. Sources and draw odds use only the library. */
export function analyzeDeckMana(
  entries: readonly DeckEntry[],
  printings: ReadonlyMap<string, CatalogPrintingResult | null>,
) {
  const curve = Array.from({ length: 9 }, (_, value) => ({
    value,
    permanents: 0,
    nonpermanents: 0,
    total: 0,
  }));
  const colors = manaTypes.map((value) => ({ value, pips: 0, landSources: 0, sources: 0 }));
  const cards = new Map<string, { id: string; name: string; quantity: number }>();
  let librarySize = 0;
  let lands = 0;
  let modalLands = 0;
  let nonlandSources = 0;
  let unknown = 0;
  let unknownLibrary = 0;
  let unknownManaValue = 0;
  let manaTotal = 0;
  let spellCount = 0;
  let manaCount = 0;
  let landCount = 0;
  for (const entry of entries) {
    if (entry.section !== "mainboard" && entry.section !== "commander") continue;
    const inLibrary = entry.section === "mainboard";
    if (inLibrary) librarySize += entry.quantity;
    const printing = printings.get(entry.printingId);
    if (printing?.status !== "visible") {
      unknown += entry.quantity;
      if (inLibrary) unknownLibrary += entry.quantity;
      continue;
    }
    const card = printing.detail.card;
    const front = card.faces[0]!;
    const isLand = deckCardTypes(card).includes("Land");
    const modalLand = isLand && !/\bLand\b/u.test(front.typeLine.split("—")[0]!);
    if (inLibrary) {
      const existing = cards.get(card.id);
      cards.set(card.id, {
        id: card.id,
        name: card.name,
        quantity: (existing?.quantity ?? 0) + entry.quantity,
      });
      if (isLand) lands += entry.quantity;
      if (modalLand) modalLands += entry.quantity;
      if (!isLand && card.producedMana.length) nonlandSources += entry.quantity;
      for (const color of colors) {
        if (!card.producedMana.includes(color.value)) continue;
        color.sources += entry.quantity;
        if (isLand) color.landSources += entry.quantity;
      }
    }
    if (isLand) {
      landCount += entry.quantity;
      continue;
    }
    spellCount += entry.quantity;
    if (card.manaValue !== undefined) {
      manaTotal += card.manaValue * entry.quantity;
      manaCount += entry.quantity;
      const bucket = curve[Math.min(8, Math.floor(card.manaValue))]!;
      const nonpermanent = /\b(Instant|Sorcery)\b/u.test(front.typeLine);
      bucket[nonpermanent ? "nonpermanents" : "permanents"] += entry.quantity;
      bucket.total += entry.quantity;
    } else {
      unknownManaValue += entry.quantity;
    }
    // Split cards use both costs. Adventures and double-faced cards use the front cost.
    const costFaces = card.layout === "split" ? card.faces : [front];
    for (const face of costFaces) {
      for (const match of (face.manaCost ?? "").matchAll(/\{([^}]+)\}/gu)) {
        const symbols = match[1]!.split("/");
        const payable = colors.filter((color) => symbols.includes(color.value));
        for (const color of payable) color.pips += entry.quantity / payable.length;
      }
    }
  }
  return {
    curve,
    colors,
    librarySize,
    lands,
    modalLands,
    nonlandSources,
    unknown,
    unknownLibrary,
    unknownManaValue,
    manaTotal,
    spellCount,
    averageMana: manaCount ? manaTotal / manaCount : null,
    averageWithLands: manaCount + landCount ? manaTotal / (manaCount + landCount) : null,
    cards: [...cards.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type DeckManaAnalysis = ReturnType<typeof analyzeDeckMana>;

export type DrawComparison = "at-least" | "exactly" | "at-most";
/** Hypergeometric probability: random draws without replacement, before mulligans. */
export function drawProbability(
  population: number,
  successes: number,
  draws: number,
  wanted: number,
  comparison: DrawComparison = "at-least",
) {
  if (
    ![population, successes, draws, wanted].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    population === 0 ||
    successes > population ||
    draws > population
  )
    return null;
  const lower = Math.max(0, draws - (population - successes));
  const upper = Math.min(draws, successes);
  const start =
    comparison === "at-least"
      ? Math.max(lower, wanted)
      : comparison === "exactly"
        ? Math.max(lower, wanted)
        : lower;
  const end =
    comparison === "at-most" || comparison === "exactly" ? Math.min(upper, wanted) : upper;
  if (start > end) return 0;
  if (start === lower && end === upper) return 1;
  const denominator = logChoose(population, draws);
  let probability = 0;
  for (let count = start; count <= end; count++) {
    probability += Math.exp(
      logChoose(successes, count) + logChoose(population - successes, draws - count) - denominator,
    );
  }
  return Math.min(1, Math.max(0, probability));
}

function logChoose(n: number, k: number) {
  let result = 0;
  for (let i = 1; i <= Math.min(k, n - k); i++) result += Math.log((n - i + 1) / i);
  return result;
}

export function manaDrawStats(analysis: DeckManaAnalysis, drawOnFirstTurn: boolean) {
  const { librarySize, lands, unknownLibrary } = analysis;
  const handSize = Math.min(7, librarySize);
  const ready = librarySize > 0 && unknownLibrary === 0;
  return {
    handSize,
    expectedLands: ready ? (handSize * lands) / librarySize : null,
    opening: Array.from({ length: handSize + 1 }, (_, count) => ({
      count,
      probability: ready ? drawProbability(librarySize, lands, handSize, count, "exactly") : null,
    })),
    turns: Array.from({ length: 8 }, (_, index) => {
      const turn = index + 1;
      const seen = Math.min(librarySize, handSize + turn - (drawOnFirstTurn ? 0 : 1));
      return {
        turn,
        seen,
        probability: ready ? drawProbability(librarySize, lands, seen, turn) : null,
      };
    }),
  };
}
