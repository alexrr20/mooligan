import { Events, queryDb, Schema, State } from "@livestore/livestore";

import {
  DeckEntrySchema,
  DeckMetadataSchema,
  DeckSchema,
  deckEntryMaxQuantity,
} from "./deck-contract.ts";
import { IdentifierSchema as Identifier, TimestampSchema as Timestamp } from "./primitives.ts";

const { name: Name, formatId: Format, notes: Notes, tags: Tags } = DeckMetadataSchema.fields;
const { quantity: Quantity, finish: Finish, section: Section } = DeckEntrySchema.fields;
const DeckRecordSchema = DeckSchema.omit("entries");

export const deckTables = {
  deckEntryIds: State.SQLite.table({
    name: "deck_entry_ids",
    indexes: [{ name: "deck_entry_ids_target", columns: ["entryId"] }],
    schema: Schema.Struct({
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      deckId: Identifier,
      entryId: Identifier,
    }),
  }),
  decks: State.SQLite.table({
    name: "decks",
    schema: Schema.Struct({
      ...DeckRecordSchema.fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      tags: Schema.String,
      deleted: Schema.Boolean,
    }),
  }),
  deckEntries: State.SQLite.table({
    name: "deck_entries",
    indexes: [
      { name: "deck_entries_slot", columns: ["deckId", "printingId", "finish", "section"] },
    ],
    schema: Schema.Struct({
      ...DeckEntrySchema.fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      deckId: Identifier,
    }),
  }),
};

export const deckEvents = {
  deckCreated: Events.synced({
    name: "v1.DeckCreated",
    schema: Schema.Struct({ deck: DeckRecordSchema }),
  }),
  deckChanged: Events.synced({
    name: "v1.DeckChanged",
    schema: Schema.Struct({
      deckId: Identifier,
      updatedAt: Timestamp,
      name: Schema.optional(Name),
      formatId: Schema.optional(Format),
      notes: Schema.optional(Notes),
      tags: Schema.optional(Tags),
      archived: Schema.optional(Schema.Boolean),
    }),
  }),
  deckDeleted: Events.synced({
    name: "v1.DeckDeleted",
    schema: Schema.Struct({ deckId: Identifier, updatedAt: Timestamp }),
  }),
  deckEntryAdded: Events.synced({
    name: "v1.DeckEntryAdded",
    schema: Schema.Struct({ deckId: Identifier, entry: DeckEntrySchema, updatedAt: Timestamp }),
  }),
  deckEntryChanged: Events.synced({
    name: "v1.DeckEntryChanged",
    schema: Schema.Struct({
      deckId: Identifier,
      entryId: Identifier,
      updatedAt: Timestamp,
      quantity: Schema.optional(Quantity),
      section: Schema.optional(Section),
      finish: Schema.optional(Finish),
      printingId: Schema.optional(Identifier),
    }),
  }),
  deckEntryRemoved: Events.synced({
    name: "v1.DeckEntryRemoved",
    schema: Schema.Struct({ deckId: Identifier, entryId: Identifier, updatedAt: Timestamp }),
  }),
} as const;

const deckWrites = new Set(["decks"]);
const entryWrites = new Set(["deck_entries"]);
const entryIdWrites = new Set(["deck_entry_ids"]);
// An offline addition may be merged into a slot created by another device.
// Keep its ID addressable so subsequent offline moves, edits and removals still apply.
const resolvedEntryId =
  '(SELECT "entryId" FROM "deck_entry_ids" WHERE "id" = $entryId AND "deckId" = $deckId)';
const activeDeck = 'EXISTS (SELECT 1 FROM "decks" WHERE "id" = $deckId AND "deleted" = 0)';

function touchDeck(deckId: string, updatedAt: string) {
  return {
    sql: 'UPDATE "decks" SET "updatedAt" = MAX("updatedAt", $updatedAt) WHERE "id" = $deckId AND "deleted" = 0',
    bindValues: { deckId, updatedAt },
    writeTables: deckWrites,
  };
}

export const deckMaterializers = {
  "v1.DeckCreated": ({ deck }: typeof deckEvents.deckCreated.schema.Type) =>
    deckTables.decks
      .insert({ ...deck, tags: JSON.stringify(deck.tags), deleted: false })
      .onConflict("id", "ignore"),
  "v1.DeckChanged": (change: typeof deckEvents.deckChanged.schema.Type) => ({
    sql: `UPDATE "decks" SET
      "name" = COALESCE($name, "name"), "formatId" = COALESCE($formatId, "formatId"),
      "notes" = COALESCE($notes, "notes"), "tags" = COALESCE($tags, "tags"),
      "archived" = COALESCE($archived, "archived"), "updatedAt" = MAX("updatedAt", $updatedAt)
      WHERE "id" = $deckId AND "deleted" = 0`,
    bindValues: {
      deckId: change.deckId,
      updatedAt: change.updatedAt,
      name: change.name ?? null,
      formatId: change.formatId ?? null,
      notes: change.notes ?? null,
      tags: change.tags === undefined ? null : JSON.stringify(change.tags),
      archived: change.archived === undefined ? null : Number(change.archived),
    },
    writeTables: deckWrites,
  }),
  "v1.DeckDeleted": ({ deckId, updatedAt }: typeof deckEvents.deckDeleted.schema.Type) => [
    deckTables.decks.update({ deleted: true, updatedAt }).where({ id: deckId }),
    deckTables.deckEntries.delete().where({ deckId }),
    {
      sql: 'DELETE FROM "tag_assignments" WHERE "tagId" IN (SELECT "id" FROM "card_tags" WHERE "deckId" = $deckId)',
      bindValues: { deckId },
      writeTables: new Set(["tag_assignments"]),
    },
    {
      sql: 'UPDATE "card_tags" SET "deleted" = 1 WHERE "deckId" = $deckId',
      bindValues: { deckId },
      writeTables: new Set(["card_tags"]),
    },
  ],
  "v1.DeckEntryAdded": ({
    deckId,
    entry,
    updatedAt,
  }: typeof deckEvents.deckEntryAdded.schema.Type) => {
    const bindValues = { ...entry, deckId };
    return [
      {
        sql: `UPDATE "deck_entries" SET "quantity" = "quantity" + $quantity
          WHERE "deckId" = $deckId AND "printingId" = $printingId AND "finish" = $finish AND "section" = $section
          AND "quantity" <= ${deckEntryMaxQuantity} - $quantity AND ${activeDeck}`,
        bindValues,
        writeTables: entryWrites,
      },
      {
        sql: `INSERT INTO "deck_entries" ("id", "deckId", "printingId", "finish", "quantity", "section")
          SELECT $id, $deckId, $printingId, $finish, $quantity, $section
          WHERE ${activeDeck} AND NOT EXISTS (
            SELECT 1 FROM "deck_entries" WHERE "deckId" = $deckId AND "printingId" = $printingId AND "finish" = $finish AND "section" = $section
          ) ON CONFLICT("id") DO NOTHING`,
        bindValues,
        writeTables: entryWrites,
      },
      {
        sql: `INSERT INTO "deck_entry_ids" ("id", "deckId", "entryId")
          SELECT $id, $deckId, "id" FROM "deck_entries"
          WHERE "deckId" = $deckId AND "printingId" = $printingId AND "finish" = $finish AND "section" = $section
          ON CONFLICT("id") DO NOTHING`,
        bindValues,
        writeTables: entryIdWrites,
      },
      touchDeck(deckId, updatedAt),
    ];
  },
  "v1.DeckEntryChanged": (change: typeof deckEvents.deckEntryChanged.schema.Type) => {
    const bindValues = {
      deckId: change.deckId,
      entryId: change.entryId,
      quantity: change.quantity ?? null,
      section: change.section ?? null,
      finish: change.finish ?? null,
      printingId: change.printingId ?? null,
    };
    return [
      {
        sql: `UPDATE "deck_entries" AS source SET "quantity" = COALESCE($quantity, "quantity"),
          "section" = COALESCE($section, "section"), "finish" = COALESCE($finish, "finish"), "printingId" = COALESCE($printingId, "printingId")
          WHERE "id" = ${resolvedEntryId} AND "deckId" = $deckId AND ${activeDeck} AND NOT EXISTS (
            SELECT 1 FROM "deck_entries" AS destination WHERE destination."deckId" = $deckId AND destination."id" <> source."id"
            AND destination."printingId" = COALESCE($printingId, source."printingId")
            AND destination."finish" = COALESCE($finish, source."finish") AND destination."section" = COALESCE($section, source."section")
            AND destination."quantity" > ${deckEntryMaxQuantity} - COALESCE($quantity, source."quantity")
          )`,
        bindValues,
        writeTables: entryWrites,
      },
      {
        sql: `WITH source AS MATERIALIZED (
          SELECT * FROM "deck_entries" WHERE "id" = ${resolvedEntryId} AND "deckId" = $deckId
        ), target AS MATERIALIZED (
          SELECT destination."id" FROM "deck_entries" AS destination JOIN source
          ON destination."deckId" = source."deckId" AND destination."id" <> source."id"
          AND destination."printingId" = source."printingId" AND destination."finish" = source."finish" AND destination."section" = source."section"
        ) UPDATE "deck_entries" SET "quantity" = CASE WHEN "id" = (SELECT "id" FROM source) THEN 0
          ELSE "quantity" + (SELECT "quantity" FROM source) END
          WHERE ${activeDeck} AND EXISTS (SELECT 1 FROM target) AND ("id" = (SELECT "id" FROM source) OR "id" IN (SELECT "id" FROM target))`,
        bindValues,
        writeTables: entryWrites,
      },
      {
        sql: `WITH merged AS MATERIALIZED (
          SELECT source."id" AS oldId, destination."id" AS newId FROM "deck_entries" AS source JOIN "deck_entries" AS destination
          ON destination."deckId" = source."deckId" AND destination."id" <> source."id"
          AND destination."printingId" = source."printingId" AND destination."finish" = source."finish" AND destination."section" = source."section"
          WHERE source."deckId" = $deckId AND source."quantity" = 0 AND destination."quantity" > 0
        ) UPDATE "deck_entry_ids" SET "entryId" = (SELECT newId FROM merged WHERE oldId = "entryId")
          WHERE "deckId" = $deckId AND "entryId" IN (SELECT oldId FROM merged)`,
        bindValues,
        writeTables: entryIdWrites,
      },
      {
        sql: 'DELETE FROM "deck_entries" WHERE "deckId" = $deckId AND "quantity" = 0',
        bindValues,
        writeTables: entryWrites,
      },
      touchDeck(change.deckId, change.updatedAt),
    ];
  },
  "v1.DeckEntryRemoved": ({
    deckId,
    entryId,
    updatedAt,
  }: typeof deckEvents.deckEntryRemoved.schema.Type) => [
    {
      sql: `DELETE FROM "deck_entries" WHERE "deckId" = $deckId AND "id" = ${resolvedEntryId}`,
      bindValues: { deckId, entryId },
      writeTables: entryWrites,
    },
    touchDeck(deckId, updatedAt),
  ],
};

export const decksQuery = queryDb(deckTables.decks.where({ deleted: false }).orderBy("id", "asc"), {
  label: "decks",
});
export const deckEntriesQuery = queryDb(deckTables.deckEntries.orderBy("id", "asc"), {
  label: "deck-entries",
});
