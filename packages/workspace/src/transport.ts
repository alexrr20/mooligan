import { CollectionProjectionConnectionSchema } from "@mooligan/domain/collection";
import { ExchangeRatesSchema, priceCurrencies, priceProviders } from "@mooligan/domain/market";
import { Schema } from "effect";
import * as z from "zod";

import { CollectionLotSchema } from "./collection-contract.ts";
import { DeckEntrySchema } from "./deck-contract.ts";
import { IdentifierSchema } from "./primitives.ts";

/**
 * Embeds a persisted Workspace model in a Zod transport contract. The Effect definition stays the
 * only field list; excess properties are rejected like a strict Zod object.
 */
export function zodFromEffect<A, I>(schema: Schema.Schema<A, I>) {
  const matches = Schema.is(schema, { onExcessProperty: "error" });
  return z.custom<A>((value) => matches(value), { error: "Invalid Workspace model." });
}

export const CollectionLotTransportSchema = zodFromEffect(CollectionLotSchema);
export const CollectionLotIdTransportSchema = zodFromEffect(IdentifierSchema);

const CollectionProjectionIdentitySchema = CollectionProjectionConnectionSchema.extend({
  revision: z.number().int().positive(),
});

export const CollectionProjectionSnapshotSchema = CollectionProjectionIdentitySchema.extend({
  lots: z.array(CollectionLotTransportSchema).max(100_000),
});
export type CollectionProjectionSnapshot = z.infer<typeof CollectionProjectionSnapshotSchema>;

export const CollectionProjectionDeltaSchema = CollectionProjectionIdentitySchema.extend({
  deletedLotIds: z.array(CollectionLotIdTransportSchema).max(1_000),
  upserts: z.array(CollectionLotTransportSchema).max(1_000),
}).refine(({ deletedLotIds, upserts }) => deletedLotIds.length + upserts.length > 0, {
  message: "A collection projection delta must contain a change.",
});
export type CollectionProjectionDelta = z.infer<typeof CollectionProjectionDeltaSchema>;

export const DeckCostRequestSchema = z.strictObject({
  currency: z.enum(priceCurrencies),
  entries: z.array(zodFromEffect(DeckEntrySchema)).max(100_000),
  providers: z.array(z.enum(priceProviders)).max(priceProviders.length),
  rates: ExchangeRatesSchema.nullable(),
});
export type DeckCostRequest = z.infer<typeof DeckCostRequestSchema>;
