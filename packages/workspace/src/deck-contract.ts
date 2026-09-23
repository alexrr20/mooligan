import { deckSections } from "@mooligan/domain/decks";
import { Schema } from "effect";

import {
  FinishSchema,
  IdentifierSchema,
  TimestampSchema,
  trimmedTextSchema,
} from "./primitives.ts";

export const DeckSectionSchema = Schema.Literal(...deckSections);
export const deckEntryMaxQuantity = 1_000_000;

/** The user-editable details of a Deck. */
export const DeckMetadataSchema = Schema.Struct({
  archived: Schema.Boolean,
  formatId: trimmedTextSchema(64),
  name: trimmedTextSchema(200),
  notes: Schema.String.pipe(Schema.maxLength(50_000)),
  tags: Schema.Array(trimmedTextSchema(80)).pipe(Schema.maxItems(50)),
});
export type DeckMetadata = typeof DeckMetadataSchema.Type;

/** A deck slot using an exact printing and finish. */
export const DeckEntrySchema = Schema.Struct({
  finish: FinishSchema,
  id: IdentifierSchema,
  printingId: IdentifierSchema,
  quantity: Schema.Int.pipe(Schema.positive(), Schema.lessThanOrEqualTo(deckEntryMaxQuantity)),
  section: DeckSectionSchema,
});
export type DeckEntry = typeof DeckEntrySchema.Type;

export const NewDeckEntrySchema = DeckEntrySchema.omit("id");
export type NewDeckEntry = typeof NewDeckEntrySchema.Type;

export const DeckSchema = Schema.Struct({
  ...DeckMetadataSchema.fields,
  createdAt: TimestampSchema,
  entries: Schema.Array(DeckEntrySchema).pipe(
    Schema.maxItems(10_000),
    Schema.filter(
      (entries) =>
        new Set(entries.map(({ id }) => id)).size === entries.length &&
        new Set(entries.map(deckSlotKey)).size === entries.length,
      { message: () => "Deck entry IDs and slots must be unique." },
    ),
  ),
  id: IdentifierSchema,
  updatedAt: TimestampSchema,
});
export type Deck = typeof DeckSchema.Type;

export function deckSlotKey(entry: Pick<DeckEntry, "printingId" | "finish" | "section">) {
  return [entry.printingId, entry.finish, entry.section].join("\0");
}
