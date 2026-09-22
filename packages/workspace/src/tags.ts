import { Events, queryDb, Schema, State } from "@livestore/livestore";

import { cardTagSchema, tagAssignmentSchema, tagTemplateSchema } from "./tag-contract.ts";

const { id: Identifier, name: Name, color: Color } = cardTagSchema.fields;

export const tagTables = {
  cardTags: State.SQLite.table({
    name: "card_tags",
    schema: Schema.Struct({
      ...cardTagSchema.fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      deleted: Schema.Boolean,
    }),
  }),
  tagAssignments: State.SQLite.table({
    name: "tag_assignments",
    indexes: [{ name: "tag_assignments_tag", columns: ["tagId"] }],
    schema: Schema.Struct({
      ...tagAssignmentSchema.fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
    }),
  }),
  tagTemplates: State.SQLite.table({
    name: "tag_templates",
    schema: Schema.Struct({
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      name: Name,
      categories: Schema.String,
      deleted: Schema.Boolean,
    }),
  }),
};

export const tagEvents = {
  cardTagCreated: Events.synced({ name: "v1.CardTagCreated", schema: cardTagSchema }),
  cardTagChanged: Events.synced({
    name: "v1.CardTagChanged",
    schema: Schema.Struct({
      id: Identifier,
      name: Schema.optional(Name),
      color: Schema.optional(Color),
    }),
  }),
  cardTagDeleted: Events.synced({
    name: "v1.CardTagDeleted",
    schema: Schema.Struct({ id: Identifier }),
  }),
  cardsTagged: Events.synced({
    name: "v1.CardsTagged",
    schema: Schema.Struct({
      tagId: Identifier,
      cardIds: Schema.Array(Identifier).pipe(Schema.minItems(1), Schema.maxItems(10_000)),
      assigned: Schema.Boolean,
    }),
  }),
  tagTemplateSaved: Events.synced({ name: "v1.TagTemplateSaved", schema: tagTemplateSchema }),
  tagTemplateDeleted: Events.synced({
    name: "v1.TagTemplateDeleted",
    schema: Schema.Struct({ id: Identifier }),
  }),
} as const;

const tagWrites = new Set(["card_tags"]);
const assignmentWrites = new Set(["tag_assignments"]);
const templateWrites = new Set(["tag_templates"]);

export const tagMaterializers = {
  "v1.CardTagCreated": (tag: typeof tagEvents.cardTagCreated.schema.Type) => ({
    sql: `INSERT INTO "card_tags" ("id", "name", "color", "deckId", "deleted")
      SELECT $id, $name, $color, $deckId, 0
      WHERE ($deckId IS NULL OR EXISTS (SELECT 1 FROM "decks" WHERE "id" = $deckId AND "deleted" = 0))
      ON CONFLICT("id") DO NOTHING`,
    bindValues: { ...tag },
    writeTables: tagWrites,
  }),
  "v1.CardTagChanged": (change: typeof tagEvents.cardTagChanged.schema.Type) => ({
    sql: `UPDATE "card_tags" SET "name" = COALESCE($name, "name"), "color" = COALESCE($color, "color")
      WHERE "id" = $id AND "deleted" = 0`,
    bindValues: { id: change.id, name: change.name ?? null, color: change.color ?? null },
    writeTables: tagWrites,
  }),
  "v1.CardTagDeleted": ({ id }: typeof tagEvents.cardTagDeleted.schema.Type) => [
    tagTables.cardTags.update({ deleted: true }).where({ id }),
    tagTables.tagAssignments.delete().where({ tagId: id }),
  ],
  "v1.CardsTagged": ({ tagId, cardIds, assigned }: typeof tagEvents.cardsTagged.schema.Type) => ({
    sql: assigned
      ? `INSERT INTO "tag_assignments" ("id", "tagId", "cardId")
          SELECT json_array($tagId, value), $tagId, value FROM json_each($cardIds)
          WHERE EXISTS (SELECT 1 FROM "card_tags" WHERE "id" = $tagId AND "deleted" = 0)
          ON CONFLICT("id") DO NOTHING`
      : `DELETE FROM "tag_assignments" WHERE "tagId" = $tagId AND "cardId" IN (SELECT value FROM json_each($cardIds))`,
    bindValues: { tagId, cardIds: JSON.stringify(cardIds) },
    writeTables: assignmentWrites,
  }),
  "v1.TagTemplateSaved": (template: typeof tagEvents.tagTemplateSaved.schema.Type) => ({
    sql: `INSERT INTO "tag_templates" ("id", "name", "categories", "deleted") VALUES ($id, $name, $categories, 0)
      ON CONFLICT("id") DO UPDATE SET "name" = $name, "categories" = $categories WHERE "deleted" = 0`,
    bindValues: { ...template, categories: JSON.stringify(template.categories) },
    writeTables: templateWrites,
  }),
  "v1.TagTemplateDeleted": ({ id }: typeof tagEvents.tagTemplateDeleted.schema.Type) =>
    tagTables.tagTemplates.update({ deleted: true }).where({ id }),
};

export const cardTagsQuery = queryDb(
  tagTables.cardTags.where({ deleted: false }).orderBy("id", "asc"),
  { label: "card-tags" },
);
export const tagAssignmentsQuery = queryDb(tagTables.tagAssignments.orderBy("id", "asc"), {
  label: "tag-assignments",
});
export const tagTemplatesQuery = queryDb(
  tagTables.tagTemplates.where({ deleted: false }).orderBy("id", "asc"),
  { label: "tag-templates" },
);
