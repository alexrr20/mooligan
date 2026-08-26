import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Deck } from "@mooligan/domain/decks";
import type { CardList } from "@mooligan/domain/lists";
import * as z from "zod";
import type { JSONType } from "zod";

import {
  validateWorkspaceBootstrap,
  type Preferences,
  type PreferencesUpdate,
  type WorkspaceLegacyBackupSnapshot,
} from "../../shared/desktop-api.ts";
import { preferenceDefinitions, validatePreferences } from "./preferences.ts";
import { validateCardList, validateDeck } from "./backup.ts";
import type { WorkspaceRegistry } from "./registry.ts";

type WorkspaceMetadata = {
  workspaceId: string;
};

const PreferenceRowSchema = z.object({ key: z.string(), value: z.string() });
const WorkspaceMetadataSchema = z.object({
  workspaceId: z.string(),
});
const EntityRowSchema = z.object({ id: z.string(), payload: z.string() });

export class WorkspaceStore {
  readonly #database: DatabaseSync;
  readonly #databasePath: string;
  #metadata: WorkspaceMetadata;

  constructor(path: string, initialMetadata: WorkspaceMetadata = { workspaceId: randomUUID() }) {
    mkdirSync(dirname(path), { recursive: true });
    this.#databasePath = path;
    this.#database = new DatabaseSync(path, { timeout: 5_000 });

    try {
      const now = new Date().toISOString();

      this.#database.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS workspace_metadata (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          workspace_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL CHECK (json_valid(value)),
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS decks (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL CHECK (json_valid(payload))
        ) STRICT;

        CREATE TABLE IF NOT EXISTS card_lists (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL CHECK (json_valid(payload))
        ) STRICT;

        DROP TABLE IF EXISTS spoiler_decisions;
        DROP TABLE IF EXISTS spoiler_state;
        DELETE FROM preferences WHERE key = 'spoilerPolicy';
      `);
      this.#database
        .prepare(
          `INSERT OR IGNORE INTO workspace_metadata
           (singleton, workspace_id, created_at)
           VALUES (1, ?, ?)`,
        )
        .run(initialMetadata.workspaceId, now);

      const insertPreference = this.#database.prepare(
        `INSERT OR IGNORE INTO preferences (key, value, updated_at)
         VALUES (?, ?, ?)`,
      );

      for (const [key, definition] of Object.entries(preferenceDefinitions)) {
        insertPreference.run(key, JSON.stringify(definition.defaultValue), now);
      }

      this.#metadata = this.#readMetadata();
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  get databasePath() {
    return this.#databasePath;
  }

  get workspaceId() {
    return this.#metadata.workspaceId;
  }

  close() {
    this.#database.close();
  }

  createLegacyBackupSnapshot(): WorkspaceLegacyBackupSnapshot {
    const cardLists = this.readCardLists().map((value) => ({ id: value.id, value }));
    const decks = this.readDecks().map((value) => ({ id: value.id, value }));

    return {
      cardLists,
      decks,
      motion: this.readPreferences().motion,
    };
  }

  importLegacyBackupSnapshot(backup: WorkspaceLegacyBackupSnapshot) {
    const now = new Date().toISOString();

    transact(this.#database, () => {
      replaceEntities(
        this.#database,
        "decks",
        backup.decks.map(({ value }) => value),
      );
      replaceEntities(
        this.#database,
        "card_lists",
        backup.cardLists.map(({ value }) => value),
      );

      const updatePreference = this.#database.prepare(
        `UPDATE preferences
         SET value = ?, updated_at = ?
         WHERE key = ?`,
      );
      const motionResult = updatePreference.run(JSON.stringify(backup.motion), now, "motion");

      if (motionResult.changes !== 1) {
        throw new Error("The local preferences are invalid.");
      }
    });
  }

  putDeck(value: Deck): Deck {
    return putEntity(this.#database, "decks", value);
  }

  readDecks(): Deck[] {
    return readEntities(this.#database, "decks", validateDeck);
  }

  putCardList(value: CardList): CardList {
    return putEntity(this.#database, "card_lists", value);
  }

  readCardLists(): CardList[] {
    return readEntities(this.#database, "card_lists", validateCardList);
  }

  readPreferences(): Preferences {
    const rows = this.#database.prepare("SELECT key, value FROM preferences").all();
    const values: Record<string, JSONType> = {};

    for (const rawRow of rows) {
      const row = PreferenceRowSchema.parse(rawRow);

      try {
        values[row.key] = JSON.parse(row.value);
      } catch {
        throw new Error("The local preferences are invalid.");
      }
    }

    try {
      return validatePreferences(values);
    } catch {
      throw new Error("The local preferences are invalid.");
    }
  }

  updatePreferences(update: PreferencesUpdate): Preferences {
    if (update.motion === undefined) {
      return this.readPreferences();
    }

    transact(this.#database, () => {
      const now = new Date().toISOString();

      if (update.motion !== undefined) {
        this.#database
          .prepare(
            `UPDATE preferences
             SET value = ?, updated_at = ?
             WHERE key = 'motion'`,
          )
          .run(JSON.stringify(update.motion), now);
      }
    });

    return this.readPreferences();
  }

  #readMetadata(): WorkspaceMetadata {
    return WorkspaceMetadataSchema.parse(
      this.#database
        .prepare(
          `SELECT workspace_id AS workspaceId
         FROM workspace_metadata
         WHERE singleton = 1`,
        )
        .get(),
    );
  }
}

export class WorkspaceManager {
  readonly #registry: WorkspaceRegistry;
  #active: WorkspaceStore;
  #pendingRestore: WorkspaceStore | undefined;

  constructor(registry: WorkspaceRegistry) {
    this.#registry = registry;
    this.#active = this.#openWorkspace(registry.bootstrap().workspaceId);
  }

  get workspaceId() {
    return this.#active.workspaceId;
  }

  close() {
    this.#pendingRestore?.close();
    this.#active.close();
  }

  createLegacyBackupSnapshot() {
    return this.#active.createLegacyBackupSnapshot();
  }

  importLegacyBackupSnapshot(backup: WorkspaceLegacyBackupSnapshot) {
    this.#active.importLegacyBackupSnapshot(backup);
  }

  beginRestore(backup: WorkspaceLegacyBackupSnapshot) {
    if (this.#pendingRestore) {
      throw new Error("A workspace restore is already in progress.");
    }

    const workspaceId = this.#registry.createWorkspace();
    const path = this.#registry.workspacePath(workspaceId);

    let pending: WorkspaceStore | undefined;
    try {
      pending = new WorkspaceStore(path, { workspaceId });
      pending.importLegacyBackupSnapshot(backup);
      if (!legacySnapshotsEqual(pending.createLegacyBackupSnapshot(), backup)) {
        throw new Error("The restored workspace could not be verified.");
      }
      this.#pendingRestore = pending;
      return validateWorkspaceBootstrap({ ...this.#registry.bootstrap(), workspaceId });
    } catch (error) {
      pending?.close();
      this.#registry.removeWorkspace(workspaceId);
      removeWorkspaceFiles(path);
      throw error;
    }
  }

  activateRestore(workspaceId: string) {
    if (this.#pendingRestore?.workspaceId !== workspaceId) {
      throw new Error("The workspace restore is no longer active.");
    }

    this.#pendingRestore.close();
    this.#active.close();
    this.#registry.activateWorkspace(workspaceId);
    this.#active = this.#openWorkspace(workspaceId);
    this.#pendingRestore = undefined;
  }

  cancelRestore(workspaceId: string) {
    if (this.#pendingRestore?.workspaceId !== workspaceId) {
      return;
    }

    const path = this.#pendingRestore.databasePath;
    this.#pendingRestore.close();
    this.#pendingRestore = undefined;
    this.#registry.removeWorkspace(workspaceId);
    removeWorkspaceFiles(path);
  }

  putDeck(value: Deck) {
    return this.#active.putDeck(value);
  }

  readDecks() {
    return this.#active.readDecks();
  }

  putCardList(value: CardList) {
    return this.#active.putCardList(value);
  }

  readCardLists() {
    return this.#active.readCardLists();
  }

  readPreferences() {
    return this.#active.readPreferences();
  }

  updatePreferences(update: PreferencesUpdate) {
    return this.#active.updatePreferences(update);
  }

  #openWorkspace(workspaceId: string) {
    const path = this.#registry.workspacePath(workspaceId);

    if (!existsSync(path)) {
      if (this.#registry.isNewWorkspace(workspaceId)) {
        return new WorkspaceStore(path, { workspaceId });
      }
      throw new Error("The local workspace registry is invalid.");
    }

    const workspace = new WorkspaceStore(path);

    if (workspace.workspaceId !== workspaceId) {
      workspace.close();
      throw new Error("The local workspace registry is invalid.");
    }

    return workspace;
  }
}

function removeWorkspaceFiles(path: string) {
  for (const file of [path, `${path}-shm`, `${path}-wal`]) {
    rmSync(file, { force: true });
  }
}

function legacySnapshotsEqual(
  left: WorkspaceLegacyBackupSnapshot,
  right: WorkspaceLegacyBackupSnapshot,
) {
  const normalize = (snapshot: WorkspaceLegacyBackupSnapshot) => ({
    ...snapshot,
    cardLists: [...snapshot.cardLists].sort((a, b) => a.id.localeCompare(b.id)),
    decks: [...snapshot.decks].sort((a, b) => a.id.localeCompare(b.id)),
  });
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function transact<Result>(database: DatabaseSync, callback: () => Result): Result {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

type EntityTable = "card_lists" | "decks";

function putEntity<Entity extends { id: string }>(
  database: DatabaseSync,
  table: EntityTable,
  entity: Entity,
): Entity {
  database
    .prepare(
      `INSERT INTO ${table} (id, payload)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
    )
    .run(entity.id, JSON.stringify(entity));

  return entity;
}

function readEntities<Entity extends { id: string }>(
  database: DatabaseSync,
  table: EntityTable,
  validate: (value: JSONType) => Entity,
): Entity[] {
  return database
    .prepare(`SELECT id, payload FROM ${table} ORDER BY id`)
    .all()
    .map((rawRow) => {
      const row = EntityRowSchema.parse(rawRow);

      let entity: Entity;

      try {
        entity = validate(JSON.parse(row.payload));
      } catch {
        throw new Error("The local workspace data is invalid.");
      }

      if (entity.id !== row.id) {
        throw new Error("The local workspace data is invalid.");
      }

      return entity;
    });
}

function replaceEntities<Entity extends { id: string }>(
  database: DatabaseSync,
  table: EntityTable,
  entities: Entity[],
) {
  database.prepare(`DELETE FROM ${table}`).run();
  const insert = database.prepare(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`);

  for (const entity of entities) {
    insert.run(entity.id, JSON.stringify(entity));
  }
}
