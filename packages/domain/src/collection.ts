import * as z from "zod";

import { FinishSchema } from "./catalog.ts";
import { CatalogImageDescriptorSchema } from "./catalog-detail.ts";

const identifierSchema = z.string().trim().min(1).max(128);
const quantitySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const cardLanguages = [
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
] as const;
export type CardLanguage = (typeof cardLanguages)[number];
export const CardLanguageSchema = z.enum(cardLanguages);
export const cardLanguageLabels = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  zhs: "Simplified Chinese",
  zht: "Traditional Chinese",
  he: "Hebrew",
  la: "Latin",
  grc: "Ancient Greek",
  ar: "Arabic",
  sa: "Sanskrit",
  ph: "Phyrexian",
} as const satisfies Record<CardLanguage, string>;

export const cardConditions = [
  "near-mint",
  "lightly-played",
  "moderately-played",
  "heavily-played",
  "damaged",
] as const;
export type CardCondition = (typeof cardConditions)[number];
export const CardConditionSchema = z.enum(cardConditions);
export const cardConditionLabels = {
  "near-mint": "Near Mint",
  "lightly-played": "Lightly Played",
  "moderately-played": "Moderately Played",
  "heavily-played": "Heavily Played",
  damaged: "Damaged",
} as const satisfies Record<CardCondition, string>;

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

const CollectionHoldingCommonSchema = z.strictObject({
  condition: CardConditionSchema,
  editableLotId: identifierSchema.nullable(),
  finish: FinishSchema,
  language: CardLanguageSchema,
  printingId: identifierSchema,
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

export const CollectionListResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("not-ready") }),
  z.strictObject({ page: CollectionListPageSchema, status: z.literal("ready") }),
]);
export type CollectionListResult = z.infer<typeof CollectionListResultSchema>;

export const CollectionPrintingValidationRequestSchema = z.strictObject({
  existingFinish: FinishSchema.optional(),
  finish: FinishSchema,
  printingId: identifierSchema,
});
export type CollectionPrintingValidationRequest = z.infer<
  typeof CollectionPrintingValidationRequestSchema
>;

export const CollectionProjectionConnectionSchema = z.strictObject({
  sessionId: z.uuidv4(),
  workspaceId: z.uuid(),
});
export type CollectionProjectionConnection = z.infer<typeof CollectionProjectionConnectionSchema>;

export const CollectionProjectionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ revision: z.number().int().positive(), status: z.literal("applied") }),
  z.strictObject({ status: z.literal("resync-required") }),
]);
export type CollectionProjectionResult = z.infer<typeof CollectionProjectionResultSchema>;
