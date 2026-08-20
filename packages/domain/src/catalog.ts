import * as z from "zod";

const dateTimeSchema = z.iso.datetime({ offset: true });

export const ColorSchema = z.enum(["W", "U", "B", "R", "G"]);
export type Color = z.infer<typeof ColorSchema>;

export const FinishSchema = z.enum(["nonfoil", "foil", "etched"]);
export type Finish = z.infer<typeof FinishSchema>;

export const RaritySchema = z.enum(["common", "uncommon", "rare", "mythic", "special", "bonus"]);
export type Rarity = z.infer<typeof RaritySchema>;

export const LegalityStatusSchema = z.enum(["legal", "not-legal", "restricted", "banned"]);
export type LegalityStatus = z.infer<typeof LegalityStatusSchema>;

export const CatalogSnapshotSchema = z.object({
  cardCount: z.number().int().nonnegative(),
  updatedAt: dateTimeSchema,
});
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
