import { tagColors } from "@mooligan/domain/tags";
import { Schema } from "effect";

import { IdentifierSchema, trimmedTextSchema } from "./primitives.ts";

const TagNameSchema = trimmedTextSchema(80);

/** Tag names are stored trimmed, so one case-insensitive key decides uniqueness. */
export function tagNameKey(name: string) {
  return name.toLowerCase();
}

export const TagStyleSchema = Schema.Struct({
  name: TagNameSchema,
  color: Schema.Literal(...tagColors),
});
export type TagStyle = typeof TagStyleSchema.Type;

export const CardTagSchema = Schema.Struct({
  ...TagStyleSchema.fields,
  id: IdentifierSchema,
  deckId: Schema.NullOr(IdentifierSchema),
});
export type CardTag = typeof CardTagSchema.Type;

export const TagAssignmentSchema = Schema.Struct({
  tagId: IdentifierSchema,
  cardId: IdentifierSchema,
});
export type TagAssignment = typeof TagAssignmentSchema.Type;

export const TagTemplateSchema = Schema.Struct({
  id: IdentifierSchema,
  name: TagNameSchema,
  categories: Schema.Array(TagStyleSchema).pipe(
    Schema.minItems(1),
    Schema.maxItems(100),
    Schema.filter(
      (categories) =>
        new Set(categories.map(({ name }) => tagNameKey(name))).size === categories.length,
      { message: () => "Category names must be unique." },
    ),
  ),
});
export type TagTemplate = typeof TagTemplateSchema.Type;

export const starterCategories: readonly TagStyle[] = [
  { name: "Ramp", color: "sage" },
  { name: "Card draw", color: "blue" },
  { name: "Removal", color: "rose" },
  { name: "Board wipes", color: "amber" },
  { name: "Protection", color: "violet" },
  { name: "Finishers", color: "slate" },
];
