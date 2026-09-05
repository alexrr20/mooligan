import { Schema } from "effect";

const Identifier = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const Name = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200), Schema.pattern(/\S/u));
const Format = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64), Schema.pattern(/\S/u));
const Notes = Schema.String.pipe(Schema.maxLength(50_000));
const Tags = Schema.Array(
  Schema.String.pipe(Schema.minLength(1), Schema.maxLength(80), Schema.pattern(/\S/u)),
).pipe(Schema.maxItems(50));
const Timestamp = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  Schema.filter((value) => Number.isFinite(Date.parse(value))),
);
const Quantity = Schema.Int.pipe(Schema.positive(), Schema.lessThanOrEqualTo(1_000_000));
const Finish = Schema.Literal("nonfoil", "foil", "etched", "glossy");
const Section = Schema.Literal("mainboard", "sideboard", "commander", "companion", "maybeboard");

export const deckMetadataSchema = Schema.Struct({
  archived: Schema.Boolean,
  createdAt: Timestamp,
  formatId: Format,
  id: Identifier,
  name: Name,
  notes: Notes,
  tags: Tags,
  updatedAt: Timestamp,
});

export const deckEntrySchema = Schema.Struct({
  finish: Finish,
  id: Identifier,
  printingId: Identifier,
  quantity: Quantity,
  section: Section,
});
