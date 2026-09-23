import type { CatalogDatabase as DatabaseSync } from "./database.ts";

import type { CollectionLot } from "@mooligan/workspace/collection-contract";
import { type JsonValue, StrictStruct } from "@mooligan/domain/schema";
import { CollectionLotSchema } from "@mooligan/workspace/collection-contract";
import { IdentifierSchema } from "@mooligan/workspace/primitives";
import { Option, Schema } from "effect";
const CollectionProjectionWorkerOperationSchema = Schema.Union(
  StrictStruct({
    lots: Schema.Array(CollectionLotSchema).pipe(Schema.maxItems(100_000)),
    type: Schema.Literal("collection-projection-replace"),
  }),
  StrictStruct({
    deletedLotIds: Schema.Array(IdentifierSchema).pipe(Schema.maxItems(1_000)),
    type: Schema.Literal("collection-projection-apply"),
    upserts: Schema.Array(CollectionLotSchema).pipe(Schema.maxItems(1_000)),
  }),
);
export type CollectionProjectionWorkerOperation =
  typeof CollectionProjectionWorkerOperationSchema.Type;

const workerRequestIdSchema = Schema.Int.pipe(Schema.positive());
const CollectionProjectionWorkerRequestSchema = StrictStruct({
  id: workerRequestIdSchema,
  operation: CollectionProjectionWorkerOperationSchema,
});
export type CollectionProjectionWorkerRequest = typeof CollectionProjectionWorkerRequestSchema.Type;

const collectionProjectionOperationTypeSchema = Schema.Literal(
  "collection-projection-replace",
  "collection-projection-apply",
);
const CollectionProjectionWorkerResponseSchema = Schema.Union(
  StrictStruct({
    id: workerRequestIdSchema,
    operation: collectionProjectionOperationTypeSchema,
    status: Schema.Literal("applied"),
  }),
  StrictStruct({
    error: Schema.NonEmptyString,
    id: workerRequestIdSchema,
    operation: collectionProjectionOperationTypeSchema,
  }),
);

const decodeWorkerRequest = Schema.decodeUnknownOption(CollectionProjectionWorkerRequestSchema);
const decodeWorkerResponse = Schema.decodeUnknownOption(CollectionProjectionWorkerResponseSchema);

export function parseCollectionProjectionWorkerRequest(value: JsonValue) {
  return Option.getOrNull(decodeWorkerRequest(value));
}

export function parseCollectionProjectionWorkerResponse(
  value: JsonValue,
  expectedOperation: CollectionProjectionWorkerOperation["type"],
) {
  const response = Option.getOrNull(decodeWorkerResponse(value));
  return response?.operation === expectedOperation ? response : null;
}

export function createCollectionProjection(database: DatabaseSync) {
  database.exec(`
    CREATE TEMP TABLE collection_lots (
      id TEXT PRIMARY KEY,
      printing_id TEXT NOT NULL,
      finish TEXT NOT NULL,
      language TEXT NOT NULL,
      condition TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      acquired_at TEXT,
      unit_cost_amount_minor INTEGER,
      unit_cost_currency TEXT,
      location_id TEXT,
      notes TEXT
    ) STRICT;
    CREATE INDEX collection_lots_holding
      ON collection_lots (printing_id, finish, language, condition);
  `);
  const insert = database.prepare(
    `INSERT INTO collection_lots
       (id, printing_id, finish, language, condition, quantity, acquired_at,
        unit_cost_amount_minor, unit_cost_currency, location_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       printing_id = excluded.printing_id,
       finish = excluded.finish,
       language = excluded.language,
       condition = excluded.condition,
       quantity = excluded.quantity,
       acquired_at = excluded.acquired_at,
       unit_cost_amount_minor = excluded.unit_cost_amount_minor,
       unit_cost_currency = excluded.unit_cost_currency,
       location_id = excluded.location_id,
       notes = excluded.notes`,
  );
  const remove = database.prepare("DELETE FROM collection_lots WHERE id = ?");
  const clear = database.prepare("DELETE FROM collection_lots");

  return {
    apply({
      deletedLotIds,
      upserts,
    }: {
      deletedLotIds: readonly string[];
      upserts: readonly CollectionLot[];
    }) {
      transact(database, () => {
        for (const lotId of deletedLotIds) remove.run(lotId);
        for (const lot of upserts) insert.run(...collectionLotArguments(lot));
      });
    },
    replace(lots: readonly CollectionLot[]) {
      transact(database, () => {
        clear.run();
        for (const lot of lots) insert.run(...collectionLotArguments(lot));
      });
    },
  };
}

function collectionLotArguments(lot: CollectionLot) {
  return [
    lot.id,
    lot.printingId,
    lot.finish,
    lot.language,
    lot.condition,
    lot.quantity,
    lot.acquiredAt,
    lot.unitCost?.amountMinor ?? null,
    lot.unitCost?.currency ?? null,
    lot.locationId,
    lot.notes,
  ];
}

function transact(database: DatabaseSync, callback: () => void) {
  database.exec("BEGIN");
  try {
    callback();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
