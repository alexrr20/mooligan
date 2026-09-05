import * as z from "zod";

import { FinishSchema } from "./catalog.ts";

export const DeckSectionSchema = z.enum([
  "mainboard",
  "sideboard",
  "commander",
  "companion",
  "maybeboard",
]);
export type DeckSection = z.infer<typeof DeckSectionSchema>;

export const deckSections = [
  { value: "mainboard", label: "Main deck" },
  { value: "sideboard", label: "Sideboard" },
  { value: "commander", label: "Commander" },
  { value: "companion", label: "Companion" },
  { value: "maybeboard", label: "Maybeboard" },
] as const;

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

export const DeckMetadataSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  formatId: z.string().trim().min(1).max(64),
  notes: z.string().max(50_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(50),
  archived: z.boolean(),
});
export type DeckMetadata = z.infer<typeof DeckMetadataSchema>;

/** A deck slot using an exact printing and finish. */
export const DeckEntrySchema = z.object({
  finish: FinishSchema,
  id: z.string().min(1).max(128),
  printingId: z.string().min(1).max(128),
  quantity: z.number().int().positive().max(1_000_000),
  section: DeckSectionSchema,
});
export type DeckEntry = z.infer<typeof DeckEntrySchema>;

export const DeckSchema = DeckMetadataSchema.extend({
  createdAt: z.iso.datetime({ offset: true }),
  entries: z.array(DeckEntrySchema),
  id: z.string().min(1).max(128),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Deck = z.infer<typeof DeckSchema>;

/** Derived by deck validation rather than parsed from storage or transport. */
export type DeckValidationIssue = {
  code: string;
  entryId?: string;
  message: string;
  severity: "error" | "warning";
};
