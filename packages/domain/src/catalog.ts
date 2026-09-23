import * as z from "zod";

const dateTimeSchema = z.iso.datetime({ offset: true });

export const ColorSchema = z.enum(["W", "U", "B", "R", "G"]);
export type Color = z.infer<typeof ColorSchema>;

export const ManaTypeSchema = z.enum(["W", "U", "B", "R", "G", "C"]);
export type ManaType = z.infer<typeof ManaTypeSchema>;

export const finishes = ["nonfoil", "foil", "etched", "glossy"] as const;
export type Finish = (typeof finishes)[number];
export const FinishSchema = z.enum(finishes);
export const finishLabels = {
  nonfoil: "Nonfoil",
  foil: "Foil",
  etched: "Etched",
  glossy: "Glossy",
} as const satisfies Record<Finish, string>;

export const RaritySchema = z.enum(["common", "uncommon", "rare", "mythic", "special", "bonus"]);
export type Rarity = z.infer<typeof RaritySchema>;

export const LegalityStatusSchema = z.enum(["legal", "not-legal", "restricted", "banned"]);
export type LegalityStatus = z.infer<typeof LegalityStatusSchema>;

export const CatalogSnapshotSchema = z.object({
  cardCount: z.number().int().nonnegative(),
  updatedAt: dateTimeSchema,
});
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
