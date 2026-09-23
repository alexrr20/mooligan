import type { CatalogPrintingResult } from "./spoilers.ts";
import { Schema } from "effect";

import { FinishSchema } from "./catalog.ts";
import { CatalogImageDescriptorSchema } from "./catalog-detail.ts";
import { UuidSchema, StrictStruct, UuidV4Schema } from "./schema.ts";

const identifierSchema = Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(128));
const quantitySchema = Schema.Int.pipe(Schema.positive());
const countSchema = Schema.NonNegativeInt;

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
export const CardLanguageSchema = Schema.Literal(...cardLanguages);
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
export const CardConditionSchema = Schema.Literal(...cardConditions);
export const cardConditionLabels = {
  "near-mint": "Near Mint",
  "lightly-played": "Lightly Played",
  "moderately-played": "Moderately Played",
  "heavily-played": "Heavily Played",
  damaged: "Damaged",
} as const satisfies Record<CardCondition, string>;

export const CollectionSortSchema = Schema.Literal("name", "set", "quantity");
export type CollectionSort = typeof CollectionSortSchema.Type;

export const CollectionListRequestSchema = StrictStruct({
  condition: Schema.optional(CardConditionSchema),
  finish: Schema.optional(FinishSchema),
  language: Schema.optional(CardLanguageSchema),
  limit: Schema.optional(Schema.Int.pipe(Schema.between(1, 100))),
  offset: Schema.optional(countSchema),
  query: Schema.optional(Schema.Trim.pipe(Schema.maxLength(500))),
  setCode: Schema.optional(Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(16))),
  sort: Schema.optional(CollectionSortSchema),
});
export type CollectionListRequest = typeof CollectionListRequestSchema.Type;

const collectionHoldingCommonFields = {
  condition: CardConditionSchema,
  editableLotId: Schema.NullOr(identifierSchema),
  finish: FinishSchema,
  language: CardLanguageSchema,
  printingId: identifierSchema,
  quantity: quantitySchema,
};

export const VisibleCollectionHoldingSchema = StrictStruct({
  ...collectionHoldingCommonFields,
  availableFinishes: Schema.Array(FinishSchema),
  cardId: identifierSchema,
  collectorNumber: Schema.String,
  gridImage: Schema.NullOr(CatalogImageDescriptorSchema),
  image: Schema.NullOr(CatalogImageDescriptorSchema),
  name: Schema.NonEmptyString,
  setCode: Schema.NonEmptyString,
  setName: Schema.NonEmptyString,
  status: Schema.Literal("visible"),
});
export type VisibleCollectionHolding = typeof VisibleCollectionHoldingSchema.Type;

export const UnavailableCollectionHoldingSchema = StrictStruct({
  ...collectionHoldingCommonFields,
  label: Schema.Literal("Unavailable printing"),
  status: Schema.Literal("unavailable"),
});
export type UnavailableCollectionHolding = typeof UnavailableCollectionHoldingSchema.Type;

export const ProtectedCollectionHoldingSchema = StrictStruct({
  label: Schema.Literal("Protected preview"),
  quantity: quantitySchema,
  routePrintingId: identifierSchema,
  status: Schema.Literal("protected"),
});
export type ProtectedCollectionHolding = typeof ProtectedCollectionHoldingSchema.Type;

export const CollectionHoldingSchema = Schema.Union(
  VisibleCollectionHoldingSchema,
  UnavailableCollectionHoldingSchema,
  ProtectedCollectionHoldingSchema,
);
export type CollectionHolding = typeof CollectionHoldingSchema.Type;

export const CollectionCountsSchema = StrictStruct({
  cards: countSchema,
  copies: countSchema,
  holdings: countSchema,
});
export type CollectionCounts = typeof CollectionCountsSchema.Type;

export const CollectionSetOptionSchema = StrictStruct({
  code: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
});
export type CollectionSetOption = typeof CollectionSetOptionSchema.Type;

export const CollectionListPageSchema = StrictStruct({
  filtered: CollectionCountsSchema,
  hasMore: Schema.Boolean,
  holdings: Schema.Array(CollectionHoldingSchema),
  protectedCopies: countSchema,
  sets: Schema.Array(CollectionSetOptionSchema),
  total: CollectionCountsSchema,
});
export type CollectionListPage = typeof CollectionListPageSchema.Type;

export const CollectionListResultSchema = Schema.Union(
  StrictStruct({ status: Schema.Literal("not-ready") }),
  StrictStruct({ page: CollectionListPageSchema, status: Schema.Literal("ready") }),
);
export type CollectionListResult = typeof CollectionListResultSchema.Type;

export const CollectionPrintingValidationRequestSchema = StrictStruct({
  existingFinish: Schema.optional(FinishSchema),
  finish: FinishSchema,
  printingId: identifierSchema,
});
export type CollectionPrintingValidationRequest =
  typeof CollectionPrintingValidationRequestSchema.Type;

export const CollectionProjectionConnectionSchema = StrictStruct({
  sessionId: UuidV4Schema,
  workspaceId: UuidSchema,
});
export type CollectionProjectionConnection = typeof CollectionProjectionConnectionSchema.Type;

export const CollectionProjectionResultSchema = Schema.Union(
  StrictStruct({ revision: Schema.Int.pipe(Schema.positive()), status: Schema.Literal("applied") }),
  StrictStruct({ status: Schema.Literal("resync-required") }),
);
export type CollectionProjectionResult = typeof CollectionProjectionResultSchema.Type;

export function assertPrintingCanUseFinish(
  result: CatalogPrintingResult | null,
  request: {
    existingFinish?: typeof FinishSchema.Type;
    finish: typeof FinishSchema.Type;
  },
) {
  if (!result) {
    if (request.existingFinish === request.finish) return;
    throw new Error("This printing is not present in the installed catalog.");
  }
  if (result.status === "protected") {
    throw new Error("Reveal this printing before adding it to the Collection.");
  }
  if (result.detail.selectedPrinting.isDigital) {
    throw new Error("Digital printings cannot be added to the Collection.");
  }
  if (!result.detail.selectedPrinting.finishes?.includes(request.finish)) {
    throw new Error("This finish is not available for the selected printing.");
  }
}
