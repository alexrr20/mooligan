import type { CatalogDatabase as DatabaseSync } from "./database.ts";
import type { CollectionLot } from "@mooligan/workspace/collection-contract";

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
    apply(
      this: void,
      {
        deletedLotIds,
        upserts,
      }: { deletedLotIds: readonly string[]; upserts: readonly CollectionLot[] },
    ) {
      transact(database, () => {
        for (const lotId of deletedLotIds) remove.run(lotId);
        for (const lot of upserts) insert.run(...collectionLotArguments(lot));
      });
    },
    replace(this: void, lots: readonly CollectionLot[]) {
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
    lot.acquiredAt ?? null,
    lot.unitCost?.amountMinor ?? null,
    lot.unitCost?.currency ?? null,
    lot.locationId ?? null,
    lot.notes ?? null,
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
