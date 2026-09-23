import { Schema } from "effect";

import { FinishSchema } from "./catalog.ts";
import { IsoOffsetDateTimeSchema } from "./schema.ts";

export const DesiredPrintingSchema = Schema.Struct({
  finish: Schema.optional(FinishSchema),
  printingId: Schema.NonEmptyString,
});
export type DesiredPrinting = typeof DesiredPrintingSchema.Type;

export const CardListEntrySchema = Schema.Struct({
  cardId: Schema.NonEmptyString,
  desiredPrinting: Schema.optional(DesiredPrintingSchema),
  id: Schema.NonEmptyString,
  notes: Schema.optional(Schema.String),
  quantity: Schema.Int.pipe(Schema.positive()),
});
export type CardListEntry = typeof CardListEntrySchema.Type;

export const CardListSchema = Schema.Struct({
  createdAt: IsoOffsetDateTimeSchema,
  entries: Schema.Array(CardListEntrySchema),
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  notes: Schema.optional(Schema.String),
  updatedAt: IsoOffsetDateTimeSchema,
});
export type CardList = typeof CardListSchema.Type;
