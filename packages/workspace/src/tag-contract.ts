import { Schema } from "effect";

const Identifier = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const Name = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(80),
  Schema.filter((name) => name.trim() === name && name.length > 0),
);
export const tagStyleSchema = Schema.Struct({
  name: Name,
  color: Schema.Literal("sage", "blue", "rose", "amber", "violet", "slate"),
});
export const cardTagSchema = Schema.Struct({
  ...tagStyleSchema.fields,
  id: Identifier,
  deckId: Schema.NullOr(Identifier),
});
export const tagAssignmentSchema = Schema.Struct({ tagId: Identifier, cardId: Identifier });
export const tagTemplateSchema = Schema.Struct({
  id: Identifier,
  name: Name,
  categories: Schema.Array(tagStyleSchema).pipe(
    Schema.minItems(1),
    Schema.maxItems(100),
    Schema.filter(
      (categories) =>
        new Set(categories.map(({ name }) => name.toLowerCase())).size === categories.length,
    ),
  ),
});
