import { Schema } from "effect";

import { MoneySchema } from "./market.ts";
import { IsoDateSchema } from "./schema.ts";

const DeckCostTotalSchema = Schema.Struct({
  amount: Schema.Finite.pipe(Schema.nonNegative()),
  pricedQuantity: Schema.NonNegativeInt,
  priceDate: Schema.NullOr(IsoDateSchema),
  rateDate: Schema.NullOr(IsoDateSchema),
  missingRates: Schema.Boolean,
});
export const DeckCostSchema = Schema.Struct({
  ...MoneySchema.pick("currency").fields,
  quantity: Schema.NonNegativeInt,
  current: DeckCostTotalSchema,
  cheapest: DeckCostTotalSchema,
});
export type DeckCost = typeof DeckCostSchema.Type;
