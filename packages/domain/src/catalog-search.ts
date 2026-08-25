import * as z from "zod";

import { CatalogImageDescriptorSchema } from "./catalog-detail.ts";
import { CatalogReleaseSummarySchema } from "./spoilers.ts";

const catalogPrintingIdSchema = z.string().min(1).max(128);

export const CatalogCardSummarySchema = z.object({
  collectorNumber: z.string(),
  gridImage: CatalogImageDescriptorSchema.nullable(),
  id: catalogPrintingIdSchema,
  image: CatalogImageDescriptorSchema.nullable(),
  isDigital: z.boolean(),
  name: z.string(),
  rarity: z.string(),
  setCode: z.string(),
  setName: z.string(),
  typeLine: z.string(),
});
export type CatalogCardSummary = z.infer<typeof CatalogCardSummarySchema>;

export const CatalogListRequestSchema = z.strictObject({
  includeAdCards: z.boolean().optional(),
  includeArtSeries: z.boolean().optional(),
  includeDigital: z.boolean().optional(),
  includeTokens: z.boolean().optional(),
  limit: z.number().int().min(1).max(250).optional(),
  offset: z.number().int().nonnegative().optional(),
  query: z.string().max(500).optional(),
  uniqueCards: z.boolean().optional(),
  universe: z.enum(["beyond", "within"]).optional(),
});
export type CatalogListRequest = z.infer<typeof CatalogListRequestSchema>;

export const CatalogListPageSchema = z.object({
  cards: z.array(CatalogCardSummarySchema),
  hasMore: z.boolean(),
  queryError: z.string().min(1).optional(),
  total: z.number().int().nonnegative().nullable(),
});
export type CatalogListPage = z.infer<typeof CatalogListPageSchema>;

export const CatalogUpcomingPrintingRequestSchema = z.strictObject({
  limit: z.number().int().min(1).max(250).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type CatalogUpcomingPrintingRequest = z.infer<typeof CatalogUpcomingPrintingRequestSchema>;

export const CatalogUpcomingPrintingSchema = z.discriminatedUnion("status", [
  z.strictObject({
    card: CatalogCardSummarySchema,
    release: CatalogReleaseSummarySchema,
    releasedOn: z.iso.date(),
    status: z.literal("visible"),
  }),
  z.strictObject({
    printingId: catalogPrintingIdSchema,
    release: CatalogReleaseSummarySchema,
    releasedOn: z.iso.date(),
    status: z.literal("protected"),
  }),
]);
export type CatalogUpcomingPrinting = z.infer<typeof CatalogUpcomingPrintingSchema>;

export const CatalogUpcomingPrintingPageSchema = z.strictObject({
  hasMore: z.boolean(),
  printings: z.array(CatalogUpcomingPrintingSchema),
  total: z.number().int().nonnegative(),
});
export type CatalogUpcomingPrintingPage = z.infer<typeof CatalogUpcomingPrintingPageSchema>;
