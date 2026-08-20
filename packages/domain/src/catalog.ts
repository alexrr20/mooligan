import * as z from "zod";

const idSchema = z.string().min(1);
const textSchema = z.string().min(1);
const dateSchema = z.iso.date();
const dateTimeSchema = z.iso.datetime({ offset: true });

export const ColorSchema = z.enum(["W", "U", "B", "R", "G"]);
export type Color = z.infer<typeof ColorSchema>;

export const FinishSchema = z.enum(["nonfoil", "foil", "etched"]);
export type Finish = z.infer<typeof FinishSchema>;

export const RaritySchema = z.enum(["common", "uncommon", "rare", "mythic", "special", "bonus"]);
export type Rarity = z.infer<typeof RaritySchema>;

export const CardImageUrisSchema = z.object({
  art: z.url().optional(),
  crop: z.url().optional(),
  display: z.url().optional(),
  grid: z.url().optional(),
  png: z.url().optional(),
  thumb: z.url().optional(),
});
export type CardImageUris = z.infer<typeof CardImageUrisSchema>;

export const CardFaceSchema = z.object({
  defense: z.string().optional(),
  loyalty: z.string().optional(),
  manaCost: z.string().optional(),
  name: textSchema,
  oracleText: z.string().optional(),
  power: z.string().optional(),
  toughness: z.string().optional(),
  typeLine: textSchema,
});
export type CardFace = z.infer<typeof CardFaceSchema>;

/** A card's rules identity, shared by all of its printings. */
export const CardSchema = z.object({
  colorIdentity: z.array(ColorSchema),
  faces: z.array(CardFaceSchema).min(1),
  id: idSchema,
  keywords: z.array(textSchema),
  manaValue: z.number().nonnegative(),
  name: textSchema,
});
export type Card = z.infer<typeof CardSchema>;

/** A specific physical or digital edition of a card. */
export const CardPrintingSchema = z.object({
  artists: z.array(textSchema),
  cardId: idSchema.nullable(),
  collectorNumber: textSchema,
  finishes: z.array(FinishSchema).min(1),
  id: idSchema,
  images: z.array(CardImageUrisSchema),
  isDigital: z.boolean(),
  isPromo: z.boolean(),
  language: textSchema,
  rarity: RaritySchema,
  releasedOn: dateSchema,
  setId: idSchema,
});
export type CardPrinting = z.infer<typeof CardPrintingSchema>;

export const CardRulingSchema = z.object({
  cardId: idSchema,
  comment: textSchema,
  publishedOn: dateSchema,
  source: textSchema,
});
export type CardRuling = z.infer<typeof CardRulingSchema>;

export const FormatSchema = z.object({
  id: idSchema,
  name: textSchema,
});
export type Format = z.infer<typeof FormatSchema>;

export const LegalityStatusSchema = z.enum(["legal", "not-legal", "restricted", "banned"]);
export type LegalityStatus = z.infer<typeof LegalityStatusSchema>;

export const CardLegalitySchema = z.object({
  cardId: idSchema,
  formatId: idSchema,
  status: LegalityStatusSchema,
  updatedAt: dateTimeSchema,
});
export type CardLegality = z.infer<typeof CardLegalitySchema>;

export const CatalogSnapshotSchema = z.object({
  cardCount: z.number().int().nonnegative(),
  updatedAt: dateTimeSchema,
});
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
