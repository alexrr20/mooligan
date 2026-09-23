import { cardConditions, cardLanguages } from "@mooligan/domain/collection";
import { Schema } from "effect";

import { FinishSchema, IdentifierSchema, TimestampSchema } from "./primitives.ts";

export const CardLanguageSchema = Schema.Literal(...cardLanguages);
export const CardConditionSchema = Schema.Literal(...cardConditions);
export const CollectionQuantitySchema = Schema.Int.pipe(Schema.positive());

export const CollectionMoneySchema = Schema.Struct({
  amountMinor: Schema.Int.pipe(Schema.nonNegative()),
  currency: Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/u)),
});

/** A positive quantity of copies within one Holding that shares acquisition details and storage. */
export const CollectionLotSchema = Schema.Struct({
  acquiredAt: Schema.NullOr(TimestampSchema),
  condition: CardConditionSchema,
  finish: FinishSchema,
  id: IdentifierSchema,
  language: CardLanguageSchema,
  locationId: Schema.NullOr(IdentifierSchema),
  notes: Schema.NullOr(Schema.String),
  printingId: IdentifierSchema,
  quantity: CollectionQuantitySchema,
  unitCost: Schema.NullOr(CollectionMoneySchema),
});
export type CollectionLot = typeof CollectionLotSchema.Type;

export const AddCollectionHoldingRequestSchema = CollectionLotSchema.pick(
  "condition",
  "finish",
  "language",
  "printingId",
  "quantity",
);
export type AddCollectionHoldingRequest = typeof AddCollectionHoldingRequestSchema.Type;

export const UpdateCollectionHoldingRequestSchema = Schema.Struct({
  ...CollectionLotSchema.pick("condition", "finish", "language", "quantity").fields,
  lotId: IdentifierSchema,
});
export type UpdateCollectionHoldingRequest = typeof UpdateCollectionHoldingRequestSchema.Type;

export const RemoveCollectionHoldingRequestSchema = Schema.Struct({ lotId: IdentifierSchema });
export type RemoveCollectionHoldingRequest = typeof RemoveCollectionHoldingRequestSchema.Type;

export type CollectionMutationResult = { holdingQuantity: number; lotId: string };

/** An Unattributed collection lot has no acquisition details, cost, storage location, or notes. */
export function isUnattributedLot(
  lot: Pick<CollectionLot, "acquiredAt" | "locationId" | "notes" | "unitCost">,
) {
  return (
    lot.acquiredAt === null &&
    lot.locationId === null &&
    lot.notes === null &&
    lot.unitCost === null
  );
}

export function collectionHoldingKey(
  lot: Pick<CollectionLot, "condition" | "finish" | "language" | "printingId">,
) {
  return [lot.printingId, lot.finish, lot.language, lot.condition].join("\0");
}
