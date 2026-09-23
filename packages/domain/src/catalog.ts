import { Schema } from "effect";

import { IsoOffsetDateTimeSchema } from "./schema.ts";

const colors = ["W", "U", "B", "R", "G"] as const;
export const ColorSchema = Schema.Literal(...colors);
export type Color = typeof ColorSchema.Type;

export const ManaTypeSchema = Schema.Literal(...colors, "C");
export type ManaType = typeof ManaTypeSchema.Type;

export const finishes = ["nonfoil", "foil", "etched", "glossy"] as const;
export type Finish = (typeof finishes)[number];
export const FinishSchema = Schema.Literal(...finishes);
export const finishLabels = {
  nonfoil: "Nonfoil",
  foil: "Foil",
  etched: "Etched",
  glossy: "Glossy",
} as const satisfies Record<Finish, string>;

export const RaritySchema = Schema.Literal(
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
);
export type Rarity = typeof RaritySchema.Type;

export const LegalityStatusSchema = Schema.Literal("legal", "not-legal", "restricted", "banned");
export type LegalityStatus = typeof LegalityStatusSchema.Type;

export const CatalogSnapshotSchema = Schema.Struct({
  cardCount: Schema.NonNegativeInt,
  updatedAt: IsoOffsetDateTimeSchema,
});
export type CatalogSnapshot = typeof CatalogSnapshotSchema.Type;
