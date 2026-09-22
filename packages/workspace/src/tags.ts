import { Events, queryDb, Schema, State } from "@livestore/livestore";
import { tagNameKey } from "@mooligan/domain/tags";

import { cardTagSchema, tagAssignmentSchema, tagTemplateSchema } from "./tag-contract.ts";

const { id: Identifier, name: Name, color: Color } = cardTagSchema.fields;

export const tagTables = {
  cardTags: State.SQLite.table({
    name: "card_tags",
    schema: Schema.Struct({
      ...cardTagSchema.fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      nameKey: Schema.String,
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
      nameKey: Schema.String,
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

// The first name claim in LiveStore's shared event order wins. Conflicting writes
// are no-ops, including when offline events are rebased into that order.
export const tagMaterializers = {
  "v1.CardTagCreated": (tag: typeof tagEvents.cardTagCreated.schema.Type) => ({
    sql: `INSERT INTO "card_tags" ("id", "name", "nameKey", "color", "deckId", "deleted")
      SELECT $id, $name, $nameKey, $color, $deckId, 0
      WHERE ($deckId IS NULL OR EXISTS (SELECT 1 FROM "decks" WHERE "id" = $deckId AND "deleted" = 0))
        AND NOT EXISTS (SELECT 1 FROM "card_tags" WHERE "deckId" IS $deckId AND "nameKey" = $nameKey AND "deleted" = 0)
      ON CONFLICT("id") DO NOTHING`,
    bindValues: { ...tag, nameKey: tagNameKey(tag.name) },
    writeTables: tagWrites,
  }),
  "v1.CardTagChanged": (change: typeof tagEvents.cardTagChanged.schema.Type) => ({
    sql: `UPDATE "card_tags" SET "name" = COALESCE($name, "name"), "nameKey" = COALESCE($nameKey, "nameKey"), "color" = COALESCE($color, "color")
      WHERE "id" = $id AND "deleted" = 0
        AND NOT EXISTS (SELECT 1 FROM "card_tags" AS other
          WHERE other."id" != $id AND other."deckId" IS "card_tags"."deckId"
            AND other."nameKey" = COALESCE($nameKey, "card_tags"."nameKey") AND other."deleted" = 0)`,
    bindValues: {
      id: change.id,
      name: change.name ?? null,
      nameKey: change.name === undefined ? null : tagNameKey(change.name),
      color: change.color ?? null,
    },
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
    sql: `INSERT INTO "tag_templates" ("id", "name", "nameKey", "categories", "deleted")
      SELECT $id, $name, $nameKey, $categories, 0
      WHERE NOT EXISTS (SELECT 1 FROM "tag_templates" WHERE "id" != $id AND "nameKey" = $nameKey AND "deleted" = 0)
      ON CONFLICT("id") DO UPDATE SET "name" = $name, "nameKey" = $nameKey, "categories" = $categories WHERE "deleted" = 0`,
    bindValues: {
      ...template,
      nameKey: tagNameKey(template.name),
      categories: JSON.stringify(template.categories),
    },
    writeTables: templateWrites,
  }),
  "v1.TagTemplateDeleted": ({ id }: typeof tagEvents.tagTemplateDeleted.schema.Type) =>
    tagTables.tagTemplates.update({ deleted: true }).where({ id }),
};

export const cardTagsQuery = queryDb(
  tagTables.cardTags
    .select("id", "name", "color", "deckId", "deleted")
    .where({ deleted: false })
    .orderBy("id", "asc"),
  { label: "card-tags" },
);
export const tagAssignmentsQuery = queryDb(tagTables.tagAssignments.orderBy("id", "asc"), {
  label: "tag-assignments",
});
export const tagTemplatesQuery = queryDb(
  tagTables.tagTemplates
    .select("id", "name", "categories", "deleted")
    .where({ deleted: false })
    .orderBy("id", "asc"),
  { label: "tag-templates" },
);
