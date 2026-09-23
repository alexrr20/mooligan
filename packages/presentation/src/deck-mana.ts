import type { ManaType } from "@mooligan/domain/catalog";
import type { DeckManaAnalysis, DrawComparison } from "@mooligan/workspace/client/deck-mana";

export const manaTypeStyles = {
  W: { label: "White", color: "#e7dcae" },
  U: { label: "Blue", color: "#89bddb" },
  B: { label: "Black", color: "#b6a1c8" },
  R: { label: "Red", color: "#e79781" },
  G: { label: "Green", color: "#92bf99" },
  C: { label: "Colorless", color: "#b2b6af" },
} as const satisfies Record<ManaType, { label: string; color: string }>;

export function manaCurveLabel(value: number) {
  return value === 8 ? "8+" : String(value);
}

export const drawComparisons = [
  { value: "at-least", label: "At least" },
  { value: "exactly", label: "Exactly" },
  { value: "at-most", label: "At most" },
] as const satisfies readonly { value: DrawComparison; label: string }[];

export function manaDrawTargets(analysis: DeckManaAnalysis) {
  return [
    { value: "lands", label: "Lands", quantity: analysis.lands },
    ...analysis.colors.map((color) => ({
      value: `mana:${color.value}`,
      label: `${manaTypeStyles[color.value].label} land sources`,
      quantity: color.landSources,
    })),
    ...analysis.cards.map((card) => ({
      value: `card:${card.id}`,
      label: card.name,
      quantity: card.quantity,
    })),
  ];
}

export function formatProbability(value: number | null) {
  return value === null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
}
