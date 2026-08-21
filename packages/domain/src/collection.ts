import * as z from "zod";

import { FinishSchema } from "./catalog.ts";
import { CatalogImageDescriptorSchema } from "./catalog-detail.ts";
import { MoneySchema } from "./market.ts";

const identifierSchema = z.string().trim().min(1).max(128);
const quantitySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const CardLanguageSchema = z.enum([
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ja",
  "ko",
  "ru",
  "zhs",
  "zht",
  "he",
  "la",
  "grc",
  "ar",
  "sa",
  "ph",
]);
export type CardLanguage = z.infer<typeof CardLanguageSchema>;

export const cardLanguages: readonly Readonly<{ label: string; value: CardLanguage }>[] = [
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "Russian", value: "ru" },
  { label: "Simplified Chinese", value: "zhs" },
  { label: "Traditional Chinese", value: "zht" },
  { label: "Hebrew", value: "he" },
  { label: "Latin", value: "la" },
  { label: "Ancient Greek", value: "grc" },
  { label: "Arabic", value: "ar" },
  { label: "Sanskrit", value: "sa" },
  { label: "Phyrexian", value: "ph" },
];

export const CardConditionSchema = z.enum([
  "near-mint",
  "lightly-played",
  "moderately-played",
  "heavily-played",
  "damaged",
]);
export type CardCondition = z.infer<typeof CardConditionSchema>;

export const cardConditions: readonly Readonly<{ label: string; value: CardCondition }>[] = [
  { label: "Near Mint", value: "near-mint" },
  { label: "Lightly Played", value: "lightly-played" },
  { label: "Moderately Played", value: "moderately-played" },
  { label: "Heavily Played", value: "heavily-played" },
  { label: "Damaged", value: "damaged" },
];

const CollectionMoneySchema = MoneySchema.extend({
  amountMinor: z.number().int().nonnegative(),
});

/** Copies of one printing that share the same physical properties. */
export const CollectionLotSchema = z.object({
  acquiredAt: z.iso.datetime({ offset: true }).optional(),
  condition: CardConditionSchema,
  finish: FinishSchema,
  id: identifierSchema,
  language: CardLanguageSchema,
  locationId: identifierSchema.optional(),
  notes: z.string().optional(),
  printingId: identifierSchema,
  quantity: quantitySchema,
  unitCost: CollectionMoneySchema.optional(),
});
export type CollectionLot = z.infer<typeof CollectionLotSchema>;

export const CollectionHoldingKeySchema = z.strictObject({
  condition: CardConditionSchema,
  finish: FinishSchema,
  language: CardLanguageSchema,
  printingId: identifierSchema,
});
export type CollectionHoldingKey = z.infer<typeof CollectionHoldingKeySchema>;

export const CollectionSortSchema = z.enum(["name", "set", "quantity"]);
export type CollectionSort = z.infer<typeof CollectionSortSchema>;

export const CollectionListRequestSchema = z.strictObject({
  condition: CardConditionSchema.optional(),
  finish: FinishSchema.optional(),
  language: CardLanguageSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
  query: z.string().trim().max(500).optional(),
  setCode: z.string().trim().min(1).max(16).optional(),
  sort: CollectionSortSchema.optional(),
});
export type CollectionListRequest = z.infer<typeof CollectionListRequestSchema>;

const CollectionHoldingCommonSchema = CollectionHoldingKeySchema.extend({
  editableLotId: identifierSchema.nullable(),
  quantity: quantitySchema,
});

export const VisibleCollectionHoldingSchema = CollectionHoldingCommonSchema.extend({
  availableFinishes: z.array(FinishSchema),
  cardId: identifierSchema,
  collectorNumber: z.string(),
  gridImage: CatalogImageDescriptorSchema.nullable(),
  image: CatalogImageDescriptorSchema.nullable(),
  name: z.string().min(1),
  setCode: z.string().min(1),
  setName: z.string().min(1),
  status: z.literal("visible"),
});
export type VisibleCollectionHolding = z.infer<typeof VisibleCollectionHoldingSchema>;

export const UnavailableCollectionHoldingSchema = CollectionHoldingCommonSchema.extend({
  label: z.literal("Unavailable printing"),
  status: z.literal("unavailable"),
});
export type UnavailableCollectionHolding = z.infer<typeof UnavailableCollectionHoldingSchema>;

export const ProtectedCollectionHoldingSchema = z.strictObject({
  label: z.literal("Protected preview"),
  quantity: quantitySchema,
  routePrintingId: identifierSchema,
  status: z.literal("protected"),
});
export type ProtectedCollectionHolding = z.infer<typeof ProtectedCollectionHoldingSchema>;

export const CollectionHoldingSchema = z.discriminatedUnion("status", [
  VisibleCollectionHoldingSchema,
  UnavailableCollectionHoldingSchema,
  ProtectedCollectionHoldingSchema,
]);
export type CollectionHolding = z.infer<typeof CollectionHoldingSchema>;

export const CollectionCountsSchema = z.strictObject({
  cards: z.number().int().nonnegative(),
  copies: z.number().int().nonnegative(),
  holdings: z.number().int().nonnegative(),
});
export type CollectionCounts = z.infer<typeof CollectionCountsSchema>;

export const CollectionSetOptionSchema = z.strictObject({
  code: z.string().min(1),
  name: z.string().min(1),
});
export type CollectionSetOption = z.infer<typeof CollectionSetOptionSchema>;

export const CollectionListPageSchema = z.strictObject({
  filtered: CollectionCountsSchema,
  hasMore: z.boolean(),
  holdings: z.array(CollectionHoldingSchema),
  protectedCopies: z.number().int().nonnegative(),
  sets: z.array(CollectionSetOptionSchema),
  total: CollectionCountsSchema,
});
export type CollectionListPage = z.infer<typeof CollectionListPageSchema>;

export const AddCollectionHoldingRequestSchema = CollectionHoldingKeySchema.extend({
  quantity: quantitySchema,
});
export type AddCollectionHoldingRequest = z.infer<typeof AddCollectionHoldingRequestSchema>;

export const UpdateCollectionHoldingRequestSchema = z.strictObject({
  condition: CardConditionSchema,
  finish: FinishSchema,
  language: CardLanguageSchema,
  lotId: identifierSchema,
  quantity: quantitySchema,
});
export type UpdateCollectionHoldingRequest = z.infer<typeof UpdateCollectionHoldingRequestSchema>;

export const RemoveCollectionHoldingRequestSchema = z.strictObject({
  lotId: identifierSchema,
});
export type RemoveCollectionHoldingRequest = z.infer<typeof RemoveCollectionHoldingRequestSchema>;

export const CollectionMutationResultSchema = z.strictObject({
  holdingQuantity: quantitySchema,
  lotId: identifierSchema,
});
export type CollectionMutationResult = z.infer<typeof CollectionMutationResultSchema>;
