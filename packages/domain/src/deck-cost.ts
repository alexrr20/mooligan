import * as z from "zod";

import { MoneySchema } from "./market.ts";

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
