import {
  MarketPriceSchema,
  PriceSnapshotSchema,
  type PrintingPrices,
} from "@mooligan/domain/market";
import { Schema } from "effect";

import type { CatalogDatabase as DatabaseSync } from "./database.ts";
export function initializePriceDatabase(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS prices (
      printing_id TEXT NOT NULL,
      market TEXT NOT NULL,
      kind TEXT NOT NULL,
      finish TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
      price_date TEXT NOT NULL,
      PRIMARY KEY (printing_id, market, kind, finish, currency)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS identifiers (
      uuid TEXT PRIMARY KEY,
      printing_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS price_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  `);
}
const decodePriceMetadataRow = Schema.decodeUnknownSync(Schema.Struct({ value: Schema.String }));

export function readPriceMetadata(database: DatabaseSync, key: string) {
  const row = database.prepare("SELECT value FROM price_meta WHERE key = ?").get(key);
  return row ? decodePriceMetadataRow(row).value : null;
}

const decodePriceSnapshot = Schema.decodeUnknownSync(Schema.parseJson(PriceSnapshotSchema));

export function readPriceSnapshot(database: DatabaseSync) {
  const value = readPriceMetadata(database, "snapshot");
  return value ? decodePriceSnapshot(value) : null;
}

const decodeMarketPrice = Schema.decodeUnknownSync(MarketPriceSchema);

export function readPrintingPrices(database: DatabaseSync, printingId: string): PrintingPrices {
  // A single read transaction keeps the rows and their snapshot metadata consistent.
  database.exec("BEGIN");
  try {
    const prices = database
      .prepare(`
      SELECT 'mtgjson' AS supplier, market, kind, finish, currency,
             amount_minor AS amountMinor, price_date AS priceDate
      FROM prices WHERE printing_id = ? ORDER BY market, kind, finish
    `)
      .all(printingId)
      .map((row) =>
        decodeMarketPrice({
          ...row,
          money: { amountMinor: row.amountMinor, currency: row.currency },
        }),
      );
    const snapshot = readPriceSnapshot(database);
    database.exec("COMMIT");
    return { prices, snapshot };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
