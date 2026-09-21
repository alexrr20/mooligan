import * as z from "zod";

import { DeckEntrySchema } from "./decks.ts";
import { ExchangeRatesSchema, MoneySchema } from "./market.ts";

export const DeckCostRequestSchema = MoneySchema.pick({ currency: true })
  .extend({
    entries: z.array(DeckEntrySchema).max(100_000),
    providers: z.array(z.string().regex(/^[a-z0-9_-]+$/)).max(20),
    rates: ExchangeRatesSchema.nullable(),
  })
  .strict();
export type DeckCostRequest = z.infer<typeof DeckCostRequestSchema>;

const DeckCostTotalSchema = z.object({
  amount: z.number().finite().nonnegative(),
  pricedQuantity: z.number().int().nonnegative(),
  priceDate: z.iso.date().nullable(),
  rateDate: z.iso.date().nullable(),
  missingRates: z.boolean(),
});
export const DeckCostSchema = MoneySchema.pick({ currency: true }).extend({
  quantity: z.number().int().nonnegative(),
  current: DeckCostTotalSchema,
  cheapest: DeckCostTotalSchema,
});
export type DeckCost = z.infer<typeof DeckCostSchema>;
