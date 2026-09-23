import { Events, queryDb, Schema, State } from "@livestore/livestore";

import {
  CollectionLotSchema,
  CollectionMoneySchema,
  isUnattributedLot,
  type CollectionLot,
} from "./collection-contract.ts";
import { IdentifierSchema } from "./primitives.ts";

const { condition, finish, language, quantity } = CollectionLotSchema.fields;

export const collectionTables = {
  collectionLots: State.SQLite.table({
    indexes: [
      {
        columns: ["printingId", "finish", "language", "condition"],
        name: "collection_lots_holding",
      },
    ],
    name: "collection_lots",
    schema: Schema.Struct({
      ...CollectionLotSchema.omit("id", "unitCost").fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
      unitCostAmountMinor: Schema.NullOr(CollectionMoneySchema.fields.amountMinor),
      unitCostCurrency: Schema.NullOr(CollectionMoneySchema.fields.currency),
    }),
  }),
};

export const collectionEvents = {
  collectionCopiesAdded: Events.synced({
    name: "v1.CollectionCopiesAdded",
    schema: Schema.Struct({ additionId: IdentifierSchema, lot: CollectionLotSchema }),
  }),
  collectionLotChanged: Events.synced({
    name: "v1.CollectionLotChanged",
    schema: Schema.Struct({
      changeId: IdentifierSchema,
      condition,
      finish,
      language,
      lotId: IdentifierSchema,
      quantity,
    }),
  }),
  collectionLotRemoved: Events.synced({
    name: "v1.CollectionLotRemoved",
    schema: Schema.Struct({ lotId: IdentifierSchema, removalId: IdentifierSchema }),
  }),
} as const;

const collectionLotsWriteTables = new Set([collectionTables.collectionLots.sqliteDef.name]);

// SQL form of `isUnattributedLot`, for materializers that must match rows inside SQLite.
const unattributedCollectionLotSql = (alias: string) => `
  ${alias}."acquiredAt" IS NULL
  AND ${alias}."locationId" IS NULL
  AND ${alias}."notes" IS NULL
  AND ${alias}."unitCostAmountMinor" IS NULL
  AND ${alias}."unitCostCurrency" IS NULL
`;

const matchingCollectionLotSql = (alias: string) => `
  ${alias}."condition" = $condition
  AND ${alias}."finish" = $finish
  AND ${alias}."language" = $language
`;

export const collectionMaterializers = {
  "v1.CollectionCopiesAdded": ({
    lot,
  }: typeof collectionEvents.collectionCopiesAdded.schema.Type) => {
    if (!isUnattributedLot(lot)) {
      return collectionTables.collectionLots
        .insert(toCollectionLotRow(lot))
        .onConflict("id", "ignore");
    }

    const bindValues = {
      condition: lot.condition,
      finish: lot.finish,
      language: lot.language,
      lotId: lot.id,
      maxQuantity: Number.MAX_SAFE_INTEGER,
      printingId: lot.printingId,
      quantity: lot.quantity,
    };

    return [
      {
        sql: `
          INSERT INTO "collection_lots" (
            "acquiredAt", "condition", "finish", "id", "language", "locationId", "notes",
            "printingId", "quantity", "unitCostAmountMinor", "unitCostCurrency"
          )
          SELECT
            NULL, $condition, $finish, $lotId, $language, NULL, NULL,
            $printingId, $quantity, NULL, NULL
          WHERE NOT EXISTS (
            SELECT 1
            FROM "collection_lots" AS existing
            WHERE ${unattributedCollectionLotSql("existing")}
              AND ${matchingCollectionLotSql("existing")}
              AND existing."printingId" = $printingId
          )
          ON CONFLICT("id") DO NOTHING
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
      {
        sql: `
          UPDATE "collection_lots"
          SET "quantity" = "quantity" + $quantity
          WHERE "id" = (
            SELECT existing."id"
            FROM "collection_lots" AS existing
            WHERE ${unattributedCollectionLotSql("existing")}
              AND ${matchingCollectionLotSql("existing")}
              AND existing."printingId" = $printingId
            ORDER BY existing."id" ASC
            LIMIT 1
          )
            AND "id" <> $lotId
            AND "quantity" <= $maxQuantity - $quantity
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
    ];
  },
  "v1.CollectionLotChanged": (change: typeof collectionEvents.collectionLotChanged.schema.Type) => {
    const bindValues = {
      condition: change.condition,
      finish: change.finish,
      language: change.language,
      lotId: change.lotId,
      maxQuantity: Number.MAX_SAFE_INTEGER,
      quantity: change.quantity,
    };

    return [
      {
        sql: `
          WITH merge_target AS MATERIALIZED (
            SELECT candidate."id"
            FROM (
              SELECT target."id", target."quantity"
              FROM "collection_lots" AS target
              JOIN "collection_lots" AS source ON source."id" = $lotId
              WHERE target."id" <> source."id"
                AND ${unattributedCollectionLotSql("source")}
                AND ${unattributedCollectionLotSql("target")}
                AND ${matchingCollectionLotSql("target")}
                AND target."printingId" = source."printingId"
              ORDER BY target."id" ASC
              LIMIT 1
            ) AS candidate
            WHERE candidate."quantity" <= $maxQuantity - $quantity
          )
          UPDATE "collection_lots"
          SET "quantity" = CASE
            WHEN "id" = $lotId THEN 0
            ELSE "quantity" + $quantity
          END
          WHERE EXISTS (SELECT 1 FROM merge_target)
            AND (
              "id" = $lotId
              OR "id" = (SELECT "id" FROM merge_target)
            )
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
      {
        sql: `
          DELETE FROM "collection_lots"
          WHERE "id" = $lotId AND "quantity" = 0
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
      {
        sql: `
          UPDATE "collection_lots" AS source
          SET
            "condition" = $condition,
            "finish" = $finish,
            "language" = $language,
            "quantity" = $quantity
          WHERE source."id" = $lotId
            AND ${unattributedCollectionLotSql("source")}
            AND NOT EXISTS (
              SELECT 1
              FROM "collection_lots" AS target
              WHERE target."id" <> source."id"
                AND ${unattributedCollectionLotSql("target")}
                AND ${matchingCollectionLotSql("target")}
                AND target."printingId" = source."printingId"
            )
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
    ];
  },
  "v1.CollectionLotRemoved": ({
    lotId,
  }: typeof collectionEvents.collectionLotRemoved.schema.Type) => ({
    sql: `
      DELETE FROM "collection_lots" AS source
      WHERE source."id" = $lotId
        AND ${unattributedCollectionLotSql("source")}
    `,
    bindValues: { lotId },
    writeTables: collectionLotsWriteTables,
  }),
};

type CollectionLotRow = typeof collectionTables.collectionLots.Type;

export const collectionLotsQuery = queryDb(collectionTables.collectionLots.orderBy("id", "asc"), {
  label: "collection-lots",
  map: (rows) => rows.map(toCollectionLot),
});

function toCollectionLot(row: CollectionLotRow): CollectionLot {
  return {
    acquiredAt: row.acquiredAt,
    condition: row.condition,
    finish: row.finish,
    id: row.id,
    language: row.language,
    locationId: row.locationId,
    notes: row.notes,
    printingId: row.printingId,
    quantity: row.quantity,
    unitCost:
      row.unitCostAmountMinor === null || row.unitCostCurrency === null
        ? null
        : { amountMinor: row.unitCostAmountMinor, currency: row.unitCostCurrency },
  };
}

function toCollectionLotRow({ unitCost, ...lot }: CollectionLot): CollectionLotRow {
  return {
    ...lot,
    unitCostAmountMinor: unitCost?.amountMinor ?? null,
    unitCostCurrency: unitCost?.currency ?? null,
  };
}
