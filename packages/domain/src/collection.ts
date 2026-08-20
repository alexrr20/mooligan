import * as z from "zod";

import { FinishSchema } from "./catalog.ts";
import { MoneySchema } from "./market.ts";

export const CardConditionSchema = z.enum([
  "near-mint",
  "lightly-played",
  "moderately-played",
  "heavily-played",
  "damaged",
]);
export type CardCondition = z.infer<typeof CardConditionSchema>;

/** Copies of one printing that share the same physical properties. */
export const CollectionLotSchema = z.object({
  acquiredAt: z.iso.datetime({ offset: true }).optional(),
  condition: CardConditionSchema,
  finish: FinishSchema,
  id: z.string().min(1),
  language: z.string().min(1),
  locationId: z.string().min(1).optional(),
  notes: z.string().optional(),
  printingId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitCost: MoneySchema.optional(),
});
export type CollectionLot = z.infer<typeof CollectionLotSchema>;
