import type { CatalogDatabase as DatabaseSync } from "./database.ts";

import type { CollectionLot } from "@mooligan/workspace/collection-contract";
import {
  CollectionLotIdTransportSchema,
  CollectionLotTransportSchema,
} from "@mooligan/workspace/transport";
import * as z from "zod";
import type { JSONType } from "zod";
const CollectionProjectionWorkerOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    lots: z.array(CollectionLotTransportSchema).max(100_000),
    type: z.literal("collection-projection-replace"),
  }),
  z.strictObject({
    deletedLotIds: z.array(CollectionLotIdTransportSchema).max(1_000),
    type: z.literal("collection-projection-apply"),
    upserts: z.array(CollectionLotTransportSchema).max(1_000),
  }),
]);
export type CollectionProjectionWorkerOperation = z.infer<
  typeof CollectionProjectionWorkerOperationSchema
>;

const CollectionProjectionWorkerRequestSchema = z.strictObject({
  id: z.number().int().positive(),
  operation: CollectionProjectionWorkerOperationSchema,
});
export type CollectionProjectionWorkerRequest = z.infer<
  typeof CollectionProjectionWorkerRequestSchema
>;

const CollectionProjectionWorkerResponseSchema = z.union([
  z.strictObject({
    id: z.number().int().positive(),
    operation: z.enum(["collection-projection-replace", "collection-projection-apply"]),
    status: z.literal("applied"),
  }),
  z.strictObject({
    error: z.string().min(1),
    id: z.number().int().positive(),
    operation: z.enum(["collection-projection-replace", "collection-projection-apply"]),
  }),
]);

export function parseCollectionProjectionWorkerRequest(value: JSONType) {
  const result = CollectionProjectionWorkerRequestSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseCollectionProjectionWorkerResponse(
  value: JSONType,
  expectedOperation: CollectionProjectionWorkerOperation["type"],
) {
  const result = CollectionProjectionWorkerResponseSchema.safeParse(value);
  return result.success && result.data.operation === expectedOperation ? result.data : null;
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
