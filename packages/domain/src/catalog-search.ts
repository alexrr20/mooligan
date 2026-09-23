import { Schema } from "effect";

import { CatalogImageDescriptorSchema } from "./catalog-detail.ts";
import { IsoDateSchema, StrictStruct } from "./schema.ts";
import { CatalogReleaseSummarySchema } from "./spoilers.ts";

const catalogPrintingIdSchema = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const pageLimitSchema = Schema.Int.pipe(Schema.between(1, 250));

export const CatalogCardSummarySchema = Schema.Struct({
  collectorNumber: Schema.String,
  gridImage: Schema.NullOr(CatalogImageDescriptorSchema),
  id: catalogPrintingIdSchema,
  image: Schema.NullOr(CatalogImageDescriptorSchema),
  isDigital: Schema.Boolean,
  name: Schema.String,
  rarity: Schema.String,
  setCode: Schema.String,
  setName: Schema.String,
  typeLine: Schema.String,
});
export type CatalogCardSummary = typeof CatalogCardSummarySchema.Type;

export const CatalogListRequestSchema = StrictStruct({
  includeAdCards: Schema.optional(Schema.Boolean),
  includeArtSeries: Schema.optional(Schema.Boolean),
  includeDigital: Schema.optional(Schema.Boolean),
  includeTokens: Schema.optional(Schema.Boolean),
  limit: Schema.optional(pageLimitSchema),
  offset: Schema.optional(Schema.NonNegativeInt),
  query: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
  uniqueCards: Schema.optional(Schema.Boolean),
  universe: Schema.optional(Schema.Literal("beyond", "within")),
});
export type CatalogListRequest = typeof CatalogListRequestSchema.Type;

export const CatalogListPageSchema = Schema.Struct({
  cards: Schema.Array(CatalogCardSummarySchema),
  hasMore: Schema.Boolean,
  queryError: Schema.optional(Schema.NonEmptyString),
  total: Schema.NullOr(Schema.NonNegativeInt),
});
export type CatalogListPage = typeof CatalogListPageSchema.Type;

export const CatalogUpcomingPrintingRequestSchema = StrictStruct({
  limit: Schema.optional(pageLimitSchema),
  offset: Schema.optional(Schema.NonNegativeInt),
});
export type CatalogUpcomingPrintingRequest = typeof CatalogUpcomingPrintingRequestSchema.Type;

export const CatalogUpcomingPrintingSchema = Schema.Union(
  StrictStruct({
    card: CatalogCardSummarySchema,
    release: CatalogReleaseSummarySchema,
    releasedOn: IsoDateSchema,
    status: Schema.Literal("visible"),
  }),
  StrictStruct({
    printingId: catalogPrintingIdSchema,
    release: CatalogReleaseSummarySchema,
    releasedOn: IsoDateSchema,
    status: Schema.Literal("protected"),
  }),
);
export type CatalogUpcomingPrinting = typeof CatalogUpcomingPrintingSchema.Type;

export const CatalogUpcomingPrintingPageSchema = StrictStruct({
  hasMore: Schema.Boolean,
  printings: Schema.Array(CatalogUpcomingPrintingSchema),
  total: Schema.NonNegativeInt,
});
export type CatalogUpcomingPrintingPage = typeof CatalogUpcomingPrintingPageSchema.Type;
