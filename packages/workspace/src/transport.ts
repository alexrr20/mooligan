import { CollectionProjectionConnectionSchema } from "@mooligan/domain/collection";
import { ExchangeRatesSchema, priceCurrencies, priceProviders } from "@mooligan/domain/market";
import { StrictStruct } from "@mooligan/domain/schema";
import { Schema } from "effect";

import { CollectionLotSchema } from "./collection-contract.ts";
import { DeckEntrySchema } from "./deck-contract.ts";
import { IdentifierSchema } from "./primitives.ts";

const collectionProjectionIdentityFields = {
  ...CollectionProjectionConnectionSchema.fields,
  revision: Schema.Int.pipe(Schema.positive()),
};

export const CollectionProjectionSnapshotSchema = StrictStruct({
  ...collectionProjectionIdentityFields,
  lots: Schema.Array(CollectionLotSchema).pipe(Schema.maxItems(100_000)),
});
export type CollectionProjectionSnapshot = typeof CollectionProjectionSnapshotSchema.Type;

export const CollectionProjectionDeltaSchema = StrictStruct({
  ...collectionProjectionIdentityFields,
  deletedLotIds: Schema.Array(IdentifierSchema).pipe(Schema.maxItems(1_000)),
  upserts: Schema.Array(CollectionLotSchema).pipe(Schema.maxItems(1_000)),
}).pipe(
  Schema.filter(({ deletedLotIds, upserts }) => deletedLotIds.length + upserts.length > 0, {
    message: () => "A collection projection delta must contain a change.",
  }),
);
export type CollectionProjectionDelta = typeof CollectionProjectionDeltaSchema.Type;

export const DeckCostRequestSchema = StrictStruct({
  currency: Schema.Literal(...priceCurrencies),
  entries: Schema.Array(DeckEntrySchema).pipe(Schema.maxItems(100_000)),
  providers: Schema.Array(Schema.Literal(...priceProviders)).pipe(
    Schema.maxItems(priceProviders.length),
  ),
  rates: Schema.NullOr(ExchangeRatesSchema),
});
export type DeckCostRequest = typeof DeckCostRequestSchema.Type;
