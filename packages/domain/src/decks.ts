export const deckSections = [
  "mainboard",
  "sideboard",
  "commander",
  "companion",
  "maybeboard",
] as const;
export type DeckSection = (typeof deckSections)[number];
export const deckSectionLabels = {
  mainboard: "Main deck",
  sideboard: "Sideboard",
  commander: "Commander",
  companion: "Companion",
  maybeboard: "Maybeboard",
} as const satisfies Record<DeckSection, string>;

export const deckFormats = [
  "casual",
  "commander",
  "standard",
  "pioneer",
  "modern",
  "pauper",
  "legacy",
  "vintage",
  "premodern",
  "historic",
  "timeless",
  "explorer",
  "alchemy",
  "brawl",
  "standardbrawl",
  "duel",
  "paupercommander",
  "oathbreaker",
  "limited",
] as const;
