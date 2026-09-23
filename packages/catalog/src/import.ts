import type { CatalogDatabase } from "./database.ts";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "@mooligan/domain/catalog";
import {
  ScryfallCardDownloadSchema,
  type CatalogRelease,
  type ScryfallSetDownload,
} from "@mooligan/domain/catalog-download";
import { Either, Option, ParseResult, Schema } from "effect";

const transactionSize = 500;
export const catalogSchemaVersion = 7;
const decodeIntegrityCheck = Schema.decodeUnknownOption(
  Schema.Struct({ quick_check: Schema.Literal("ok") }),
);
const decodeCatalogCount = Schema.decodeUnknownOption(
  Schema.Struct({ cardCount: Schema.NonNegativeInt }),
);
const decodeCatalogSetCount = Schema.decodeUnknownOption(
  Schema.Struct({ setCount: Schema.Int.pipe(Schema.positive()) }),
);
const decodeInvalidRootCount = Schema.decodeUnknownOption(
  Schema.Struct({ invalidRootCount: Schema.NonNegativeInt }),
);
const decodeCatalogMetadata = Schema.decodeUnknownOption(
  Schema.Struct({
    ...CatalogSnapshotSchema.fields,
    schemaVersion: Schema.Int,
    setCount: Schema.Int.pipe(Schema.positive()),
  }),
);
const decodeScryfallCard = Schema.decodeUnknownEither(ScryfallCardDownloadSchema);

export type ResolvedCatalogSet = ScryfallSetDownload & { rootSetId: string };
export async function importCatalogData(
  database: CatalogDatabase,
  release: CatalogRelease,
  sets: readonly ScryfallSetDownload[],
  lines: AsyncIterable<string>,
  onProgress: (completedCards: number) => void,
): Promise<CatalogSnapshot> {
  const resolvedSets = resolveCatalogSets(sets);
  const setsById = new Map(resolvedSets.map((set) => [set.id, set]));
  let completedCards = 0;
  let pendingCards = 0;
  let transactionOpen = false;

  try {
    database.exec("PRAGMA foreign_keys = ON");
    createCatalogSchema(database);
    insertCatalogSets(database, resolvedSets);
    const insert = database.prepare(
      `INSERT INTO cards
       (id, oracle_id, identity_id, name, compact_name, set_id, root_set_id, set_code, set_name,
        collector_number, type_line, oracle_text, mana_cost, artist, flavor_text, rarity, released_at,
        effective_released_at, json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

      const decoded = decodeScryfallCard(value);

      if (Either.isLeft(decoded)) {
        const issue = ParseResult.ArrayFormatter.formatErrorSync(decoded.left)[0];
        throw new Error(
          `Card record ${completedCards + 1} is invalid (${issue?.path.join(".") || "record"}: ${issue?.message}).`,
        );
      }
      const card = decoded.right;

      const cardSet = setsById.get(card.set_id);
      if (!cardSet) {
        throw new Error(`Card record ${completedCards + 1} references missing set ${card.set_id}.`);
      }
      if (cardSet.code !== card.set) {
        throw new Error(
          `Card record ${completedCards + 1} set code ${card.set} does not match set ${card.set_id}.`,
        );
      }

      insert.run(
        card.id,
        card.oracle_id ?? null,
        card.oracle_id ?? card.id,
        card.name,
        compactCatalogName(card.name),
        card.set_id,
        cardSet.rootSetId,
        card.set,
        card.set_name,
        card.collector_number,
        card.type_line,
        combinedCardText(
          card.oracle_text,
          card.card_faces?.map((face) => face.oracle_text),
        ),
        combinedCardText(
          card.mana_cost,
          card.card_faces?.map((face) => face.mana_cost),
        ),
        combinedCardText(
          card.artist,
          card.card_faces?.map((face) => face.artist),
        ),
        combinedCardText(
          card.flavor_text,
          card.card_faces?.map((face) => face.flavor_text),
        ),
        card.rarity,
        card.released_at ?? null,
        card.released_at ?? cardSet.released_at ?? null,
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
        `INSERT INTO catalog_meta (singleton, schema_version, card_count, set_count, updated_at)
         VALUES (1, ?, ?, ?, ?)`,
      )
      .run(catalogSchemaVersion, completedCards, resolvedSets.length, release.updatedAt);
    createCatalogIndexes(database);
    onProgress(completedCards);
  } catch (error) {
    if (transactionOpen) {
      database.exec("ROLLBACK");
    }

    throw error;
  }

  const snapshot = Schema.decodeUnknownSync(CatalogSnapshotSchema)({
    cardCount: completedCards,
    updatedAt: release.updatedAt,
  });

  validateCatalog(database, snapshot, resolvedSets.length);
  return snapshot;
}

export function resolveCatalogSets(sets: readonly ScryfallSetDownload[]): ResolvedCatalogSet[] {
  if (sets.length === 0) {
    throw new Error("The downloaded set catalog was empty.");
  }

  const setsByCode = new Map<string, ScryfallSetDownload>();
  const setIds = new Set<string>();

  for (const set of sets) {
    if (setsByCode.has(set.code)) {
      throw new Error(`The downloaded set catalog contains duplicate code ${set.code}.`);
    }
    if (setIds.has(set.id)) {
      throw new Error(`The downloaded set catalog contains duplicate ID ${set.id}.`);
    }

    setsByCode.set(set.code, set);
    setIds.add(set.id);
  }

  const roots = new Map<string, string>();
  const visiting = new Set<string>();

  function resolveRoot(set: ScryfallSetDownload): string {
    const resolved = roots.get(set.code);
    if (resolved) {
      return resolved;
    }
    if (visiting.has(set.code)) {
      throw new Error(`The downloaded set catalog contains a parent cycle at ${set.code}.`);
    }

    visiting.add(set.code);
    let rootSetId = set.id;

    if (set.parent_set_code) {
      const parent = setsByCode.get(set.parent_set_code);
      if (!parent) {
        throw new Error(`Set ${set.code} references missing parent ${set.parent_set_code}.`);
      }
      rootSetId = resolveRoot(parent);
    }

    visiting.delete(set.code);
    roots.set(set.code, rootSetId);
    return rootSetId;
  }

  return sets.map((set) => ({ ...set, rootSetId: resolveRoot(set) }));
}

export function createCatalogSchema(database: CatalogDatabase) {
  database.exec(`
    CREATE TABLE catalog_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      schema_version INTEGER NOT NULL,
      card_count INTEGER NOT NULL CHECK (card_count >= 0),
      set_count INTEGER NOT NULL CHECK (set_count > 0),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE sets (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      set_type TEXT NOT NULL,
      released_at TEXT,
      parent_set_code TEXT,
      root_set_id TEXT NOT NULL,
      card_count INTEGER NOT NULL CHECK (card_count >= 0),
      digital INTEGER NOT NULL CHECK (digital IN (0, 1)),
      symbol_uri TEXT NOT NULL,
      FOREIGN KEY (parent_set_code) REFERENCES sets(code) DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY (root_set_id) REFERENCES sets(id) DEFERRABLE INITIALLY DEFERRED
    );

    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      oracle_id TEXT,
      identity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      compact_name TEXT NOT NULL,
      set_id TEXT NOT NULL,
      root_set_id TEXT NOT NULL,
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      collector_number TEXT NOT NULL,
      type_line TEXT NOT NULL,
      oracle_text TEXT NOT NULL,
      mana_cost TEXT NOT NULL,
      artist TEXT NOT NULL,
      flavor_text TEXT NOT NULL,
      rarity TEXT NOT NULL,
      released_at TEXT,
      effective_released_at TEXT,
      json TEXT NOT NULL CHECK (json_valid(json)),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (set_id) REFERENCES sets(id),
      FOREIGN KEY (root_set_id) REFERENCES sets(id)
    );

    CREATE VIRTUAL TABLE card_search USING fts5(
      name,
      compact_name,
      set_code,
      collector_number,
      set_name,
      type_line,
      oracle_text,
      mana_cost,
      artist,
      flavor_text,
      content = 'cards',
      content_rowid = 'rowid',
      prefix = '2 3 4'
    );
  `);
}

function combinedCardText(
  cardValue: null | string | undefined,
  faceValues: readonly (null | string | undefined)[] = [],
) {
  return [cardValue, ...faceValues].filter((value): value is string => Boolean(value)).join("\n");
}

function insertCatalogSets(database: CatalogDatabase, sets: readonly ResolvedCatalogSet[]) {
  const insert = database.prepare(
    `INSERT INTO sets
     (id, code, name, set_type, released_at, parent_set_code, root_set_id, card_count, digital, symbol_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  database.exec("BEGIN");
  try {
    for (const set of sets) {
      insert.run(
        set.id,
        set.code,
        set.name,
        set.set_type,
        set.released_at ?? null,
        set.parent_set_code ?? null,
        set.rootSetId,
        set.card_count,
        Number(set.digital),
        set.icon_svg_uri,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function compactCatalogName(name: string) {
  return (name.normalize("NFKD").match(/[\p{L}\p{N}]+/gu) ?? []).join("").toLowerCase();
}

function createCatalogIndexes(database: CatalogDatabase) {
  database.exec(`
    CREATE INDEX cards_recent_order
      ON cards (
        effective_released_at DESC,
        name COLLATE NOCASE,
        set_code COLLATE NOCASE,
        collector_number COLLATE NOCASE,
        id
      );
    CREATE INDEX cards_oracle_id ON cards (oracle_id);
    CREATE INDEX cards_identity_recent
      ON cards (
        identity_id,
        effective_released_at DESC,
        set_code COLLATE NOCASE,
        collector_number COLLATE NOCASE,
        id
      );
    CREATE INDEX cards_set_id_release ON cards (set_id, released_at);
    CREATE INDEX cards_root_set_release ON cards (root_set_id, effective_released_at);
    CREATE INDEX sets_root_release ON sets (root_set_id, released_at);
    INSERT INTO card_search(card_search) VALUES ('rebuild');
  `);
}

export function validateCatalog(
  database: CatalogDatabase,
  expected: CatalogSnapshot,
  expectedSetCount: number,
) {
  const check = database.prepare("PRAGMA quick_check").get();
  const metadata = database
    .prepare(
      `SELECT schema_version AS schemaVersion,
                card_count AS cardCount,
                set_count AS setCount,
                updated_at AS updatedAt
         FROM catalog_meta
         WHERE singleton = 1`,
    )
    .get();
  const count = database.prepare("SELECT COUNT(*) AS cardCount FROM cards").get();
  const setCount = database.prepare("SELECT COUNT(*) AS setCount FROM sets").get();
  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  const invalidRoots = database
    .prepare(
      `SELECT COUNT(*) AS invalidRootCount
         FROM sets AS child
         LEFT JOIN sets AS root ON root.id = child.root_set_id
         WHERE root.id IS NULL
            OR root.parent_set_code IS NOT NULL
            OR root.root_set_id <> root.id`,
    )
    .get();
  const snapshot = decodeCatalogMetadata(metadata);
  const integrity = decodeIntegrityCheck(check);
  const catalogCount = decodeCatalogCount(count);
  const catalogSetCount = decodeCatalogSetCount(setCount);
  const invalidRootCount = decodeInvalidRootCount(invalidRoots);

  if (
    Option.isNone(integrity) ||
    Option.isNone(snapshot) ||
    Option.isNone(catalogCount) ||
    Option.isNone(catalogSetCount) ||
    Option.isNone(invalidRootCount) ||
    snapshot.value.schemaVersion !== catalogSchemaVersion ||
    catalogCount.value.cardCount !== expected.cardCount ||
    catalogSetCount.value.setCount !== expectedSetCount ||
    snapshot.value.setCount !== expectedSetCount ||
    foreignKeyFailures.length > 0 ||
    invalidRootCount.value.invalidRootCount > 0 ||
    snapshot.value.updatedAt !== expected.updatedAt
  ) {
    throw new Error("The downloaded card database failed validation.");
  }
}
