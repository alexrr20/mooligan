import { deckSectionLabels, deckSections } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";

import type { DeckEntry } from "../deck-contract.ts";

export function summarizeDeck(
  entries: readonly DeckEntry[],
  lots: readonly { printingId: string; finish: string; quantity: number }[],
  printings: ReadonlyMap<string, CatalogPrintingResult | null>,
) {
  const owned = new Map<string, number>();
  for (const lot of lots) {
    const key = ownershipKey(lot);
    owned.set(key, (owned.get(key) ?? 0) + lot.quantity);
  }
  const required = new Map<string, number>();
  let lands = 0;
  let spells = 0;
  let manaTotal = 0;
  let manaCount = 0;
  let unknown = 0;
  const cardTypes = (
    [
      "Planeswalker",
      "Battle",
      "Creature",
      "Sorcery",
      "Instant",
      "Artifact",
      "Enchantment",
      "Land",
    ] as const
  ).map((type) => ({ type, quantity: 0 }));
  const mainboardGroups = ["Commander", ...cardTypes.map(({ type }) => type), "Other"].map(
    (type) => {
      const entries: DeckEntry[] = [];
      return { type, entries, quantity: 0 };
    },
  );
  for (const entry of entries) {
    if (entry.section !== "maybeboard") {
      const key = ownershipKey(entry);
      required.set(key, (required.get(key) ?? 0) + entry.quantity);
    }
    if (displaySection(entry) !== "mainboard") continue;
    const printing = printings.get(entry.printingId);
    const types =
      printing?.status === "visible"
        ? (printing.detail.card.faces[0]?.typeLine ?? "").split("—")[0]!.split(/\s+/u)
        : [];
    const groupType =
      entry.section === "commander"
        ? "Commander"
        : types.includes("Land")
          ? "Land"
          : (cardTypes.find(({ type }) => types.includes(type))?.type ?? "Other");
    const group = mainboardGroups.find(({ type }) => type === groupType)!;
    group.entries.push(entry);
    group.quantity += entry.quantity;
    if (printing?.status !== "visible") {
      unknown += entry.quantity;
      continue;
    }
    for (const count of cardTypes) {
      if (types.includes(count.type)) count.quantity += entry.quantity;
    }
    if (types.includes("Land")) lands += entry.quantity;
    else {
      spells += entry.quantity;
      if (printing.detail.card.manaValue !== undefined) {
        manaTotal += printing.detail.card.manaValue * entry.quantity;
        manaCount += entry.quantity;
      }
    }
  }
  const missing = [...required].reduce(
    (sum, [key, count]) => sum + Math.max(0, count - (owned.get(key) ?? 0)),
    0,
  );
  const total = [...required.values()].reduce((sum, count) => sum + count, 0);
  return {
    sections: deckSections
      .filter((value) => value !== "commander")
      .map((value) => {
        const sectionEntries = entries.filter((entry) => displaySection(entry) === value);
        return {
          value,
          label: deckSectionLabels[value],
          entries: sectionEntries,
          quantity: sectionEntries.reduce((sum, entry) => sum + entry.quantity, 0),
        };
      }),
    owned,
    required,
    missing,
    total,
    lands,
    spells,
    unknown,
    cardTypes,
    mainboardGroups: mainboardGroups.filter(({ quantity }) => quantity > 0),
    averageMana: manaCount ? manaTotal / manaCount : null,
  };
}

function displaySection(entry: DeckEntry) {
  return entry.section === "commander" ? "mainboard" : entry.section;
}

export function ownershipKey(entry: { printingId: string; finish: string }) {
  return `${entry.printingId}\0${entry.finish}`;
}
