import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

import { CatalogSnapshotSchema, type CatalogSnapshot } from "@mooligan/domain/catalog";
import { ScryfallCardDownloadSchema, type CatalogRelease } from "@mooligan/domain/catalog-sync";
import * as z from "zod";

const transactionSize = 500;
export const catalogSchemaVersion = 2;
const IntegrityCheckSchema = z.object({ quick_check: z.literal("ok") });
const CatalogCountSchema = z.object({ cardCount: z.number().int().nonnegative() });
const CatalogMetadataSchema = CatalogSnapshotSchema.extend({ schemaVersion: z.number().int() });

export function readGzipJsonLines(input: Readable) {
  return createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity });
}

export async function importCatalog(
  path: string,
  release: CatalogRelease,
  lines: AsyncIterable<string>,
  onProgress: (completedCards: number) => void,
): Promise<CatalogSnapshot> {
  const database = new DatabaseSync(path);
  let completedCards = 0;
  let pendingCards = 0;
  let transactionOpen = false;

  try {
    createCatalogSchema(database);
    const insert = database.prepare(
      `INSERT INTO cards
       (id, oracle_id, name, set_code, set_name, collector_number, type_line, rarity, json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    database.exec("BEGIN");
    transactionOpen = true;

    for await (const line of lines) {
      if (!line) {
        continue;
      }

      let value;

      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`Card record ${completedCards + 1} is not valid JSON.`);
      }

      const card = ScryfallCardDownloadSchema.safeParse(value);

      if (!card.success) {
        const issue = card.error.issues[0];
        throw new Error(
          `Card record ${completedCards + 1} is invalid (${issue.path.join(".") || "record"}: ${issue.message}).`,
        );
      }

      insert.run(
        card.data.id,
        card.data.oracle_id ?? null,
        card.data.name,
        card.data.set,
        card.data.set_name,
        card.data.collector_number,
        card.data.type_line,
        card.data.rarity,
        line,
        release.updatedAt,
      );
      completedCards += 1;
      pendingCards += 1;

      if (pendingCards === transactionSize) {
        database.exec("COMMIT");
        transactionOpen = false;
        onProgress(completedCards);
        database.exec("BEGIN");
        transactionOpen = true;
        pendingCards = 0;
      }
    }

    database.exec("COMMIT");
    transactionOpen = false;

    if (completedCards === 0) {
      throw new Error("The downloaded card catalog was empty.");
    }

    database
      .prepare(
        `INSERT INTO catalog_meta (singleton, schema_version, card_count, updated_at)
         VALUES (1, ?, ?, ?)`,
      )
      .run(catalogSchemaVersion, completedCards, release.updatedAt);
    createCatalogIndexes(database);
    onProgress(completedCards);
  } catch (error) {
    if (transactionOpen) {
      database.exec("ROLLBACK");
    }

    throw error;
  } finally {
    database.close();
  }

  const snapshot = CatalogSnapshotSchema.parse({
    cardCount: completedCards,
    updatedAt: release.updatedAt,
  });

  validateCatalog(path, snapshot);
  return snapshot;
}

function createCatalogSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE catalog_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      schema_version INTEGER NOT NULL,
      card_count INTEGER NOT NULL CHECK (card_count >= 0),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      oracle_id TEXT,
      name TEXT NOT NULL,
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      collector_number TEXT NOT NULL,
      type_line TEXT NOT NULL,
      rarity TEXT NOT NULL,
      json TEXT NOT NULL CHECK (json_valid(json)),
      updated_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE card_search USING fts5(
      name,
      set_code,
      collector_number,
      set_name,
      type_line,
      content = 'cards',
      content_rowid = 'rowid',
      prefix = '2 3 4'
    );
  `);
}

function createCatalogIndexes(database: DatabaseSync) {
  database.exec(`
    CREATE INDEX cards_browse_order
      ON cards (
        name COLLATE NOCASE,
        set_code COLLATE NOCASE,
        collector_number COLLATE NOCASE
      );
    CREATE INDEX cards_oracle_id ON cards (oracle_id);
    INSERT INTO card_search(card_search) VALUES ('rebuild');
  `);
}

function validateCatalog(path: string, expected: CatalogSnapshot) {
  const database = new DatabaseSync(path, { readOnly: true });

  try {
    const check = database.prepare("PRAGMA quick_check").get();
    const metadata = database
      .prepare(
        `SELECT schema_version AS schemaVersion,
                card_count AS cardCount,
                updated_at AS updatedAt
         FROM catalog_meta
         WHERE singleton = 1`,
      )
      .get();
    const count = database.prepare("SELECT COUNT(*) AS cardCount FROM cards").get();
    const snapshot = CatalogMetadataSchema.safeParse(metadata);
    const integrity = IntegrityCheckSchema.safeParse(check);
    const catalogCount = CatalogCountSchema.safeParse(count);

    if (
      !integrity.success ||
      !snapshot.success ||
      !catalogCount.success ||
      snapshot.data.schemaVersion !== catalogSchemaVersion ||
      catalogCount.data.cardCount !== expected.cardCount ||
      snapshot.data.updatedAt !== expected.updatedAt
    ) {
      throw new Error("The downloaded card database failed validation.");
    }
  } finally {
    database.close();
  }
}
