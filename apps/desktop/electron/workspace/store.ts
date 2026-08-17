import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CollectionLot } from "@mooligan/domain/collection";
import type { Deck } from "@mooligan/domain/decks";
import type { CardList } from "@mooligan/domain/lists";
import * as z from "zod";
import type { JSONType } from "zod";

import {
  MotionPreferenceSchema,
  preferenceDefinitions,
  type MotionPreference,
  type Preferences,
  type PreferencesUpdate,
  validatePreferences,
} from "./preferences.ts";
import {
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  validateCardList,
  validateCollectionLot,
  validateDeck,
} from "./backup.ts";

export type RemoteMotionPreference = {
  updatedAt: string;
  value: MotionPreference;
  version: number;
};

export type PreferenceSyncState = {
  motion: {
    conflict: RemoteMotionPreference | null;
    pending: boolean;
    remoteVersion: number | null;
  };
};

type WorkspaceMetadata = {
  boundUserId: string | null;
  remoteWorkspaceId: string | null;
  workspaceId: string;
};

const PreferenceRowSchema = z.object({ key: z.string(), value: z.string() });
const PreferenceSyncRowSchema = z.object({
  pending: z.union([z.literal(0), z.literal(1)]),
  remoteUpdatedAt: z.string().nullable(),
  remoteValue: z.string().nullable(),
  remoteVersion: z.number().int().positive().nullable(),
});
const WorkspaceMetadataSchema = z.object({
  boundUserId: z.string().nullable(),
  remoteWorkspaceId: z.string().nullable(),
  workspaceId: z.string(),
});
const WorkspaceIdSchema = z.uuidv4();
const WorkspaceRegistryRowSchema = z.object({ workspaceId: WorkspaceIdSchema });
const EntityRowSchema = z.object({ id: z.string(), payload: z.string() });
export const RemoteMotionPreferenceSchema = z.strictObject({
  updatedAt: z.iso.datetime({ offset: true }),
  value: MotionPreferenceSchema,
  version: z.number().int().positive(),
});

export class WorkspaceStore {
  readonly #database: DatabaseSync;
  readonly #databasePath: string;
  #metadata: WorkspaceMetadata;

  constructor(
    path: string,
    initialMetadata: Pick<WorkspaceMetadata, "boundUserId" | "workspaceId"> = {
      boundUserId: null,
      workspaceId: randomUUID(),
    },
  ) {
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
          created_at TEXT NOT NULL,
          bound_user_id TEXT,
          remote_workspace_id TEXT,
          CHECK (remote_workspace_id IS NULL OR bound_user_id IS NOT NULL)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL CHECK (json_valid(value)),
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS preference_sync_state (
          key TEXT PRIMARY KEY REFERENCES preferences(key) ON DELETE CASCADE,
          remote_version INTEGER CHECK (remote_version IS NULL OR remote_version > 0),
          pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1)),
          remote_value TEXT CHECK (remote_value IS NULL OR json_valid(remote_value)),
          remote_updated_at TEXT,
          CHECK ((remote_value IS NULL) = (remote_updated_at IS NULL))
        ) STRICT;

        CREATE TABLE IF NOT EXISTS collection_lots (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL CHECK (json_valid(payload))
        ) STRICT;

        CREATE TABLE IF NOT EXISTS decks (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL CHECK (json_valid(payload))
        ) STRICT;

        CREATE TABLE IF NOT EXISTS card_lists (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL CHECK (json_valid(payload))
        ) STRICT;
      `);
      this.#database
        .prepare(
          `INSERT OR IGNORE INTO workspace_metadata
           (singleton, workspace_id, created_at, bound_user_id)
           VALUES (1, ?, ?, ?)`,
        )
        .run(initialMetadata.workspaceId, now, initialMetadata.boundUserId);

      const insertPreference = this.#database.prepare(
        `INSERT OR IGNORE INTO preferences (key, value, updated_at)
         VALUES (?, ?, ?)`,
      );

      for (const [key, definition] of Object.entries(preferenceDefinitions)) {
        insertPreference.run(key, JSON.stringify(definition.defaultValue), now);
      }

      this.#database
        .prepare(
          `INSERT OR IGNORE INTO preference_sync_state (key)
           VALUES ('motion')`,
        )
        .run();
      this.#metadata = this.#readMetadata();
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  get boundUserId() {
    return this.#metadata.boundUserId;
  }

  get databasePath() {
    return this.#databasePath;
  }

  get remoteWorkspaceId() {
    return this.#metadata.remoteWorkspaceId;
  }

  get workspaceId() {
    return this.#metadata.workspaceId;
  }

  bind(userId: string, remoteWorkspaceId: string | null = null) {
    assertIdentifier(userId, "user ID");

    if (remoteWorkspaceId !== null) {
      assertIdentifier(remoteWorkspaceId, "remote workspace ID");
    }

    const result = this.#database
      .prepare(
        `UPDATE workspace_metadata
         SET bound_user_id = ?, remote_workspace_id = COALESCE(?, remote_workspace_id)
         WHERE singleton = 1
           AND (bound_user_id IS NULL OR bound_user_id = ?)`,
      )
      .run(userId, remoteWorkspaceId, userId);

    if (result.changes !== 1) {
      throw new Error("The local workspace is already bound to another user.");
    }

    this.#metadata = this.#readMetadata();
  }

  close() {
    this.#database.close();
  }

  createBackup(): string {
    const cardLists = this.readCardLists().map((value) => ({ id: value.id, value }));
    const collectionLots = this.readCollectionLots().map((value) => ({ id: value.id, value }));
    const decks = this.readDecks().map((value) => ({ id: value.id, value }));

    return serializeWorkspaceBackup({
      cardLists,
      collectionLots,
      decks,
      preferences: this.readPreferences(),
    });
  }

  importBackup(serialized: string) {
    const backup = parseWorkspaceBackup(serialized);
    const now = new Date().toISOString();

    transact(this.#database, () => {
      replaceEntities(
        this.#database,
        "collection_lots",
        backup.collectionLots.map(({ value }) => value),
      );
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

      const result = this.#database
        .prepare(
          `UPDATE preferences
           SET value = ?, updated_at = ?
           WHERE key = 'motion'`,
        )
        .run(JSON.stringify(backup.preferences.motion), now);

      if (result.changes !== 1) {
        throw new Error("The local preferences are invalid.");
      }

      const syncResult = this.#database
        .prepare(
          `UPDATE preference_sync_state
           SET pending = 1, remote_value = NULL, remote_updated_at = NULL
           WHERE key = 'motion'`,
        )
        .run();

      if (syncResult.changes !== 1) {
        throw new Error("The local preference sync state is invalid.");
      }
    });
  }

  putCollectionLot(value: CollectionLot): CollectionLot {
    return putEntity(this.#database, "collection_lots", value);
  }

  readCollectionLots(): CollectionLot[] {
    return readEntities(this.#database, "collection_lots", validateCollectionLot);
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
      this.#database
        .prepare(
          `UPDATE preferences
           SET value = ?, updated_at = ?
           WHERE key = 'motion'`,
        )
        .run(JSON.stringify(update.motion), new Date().toISOString());
      this.#database
        .prepare(
          `UPDATE preference_sync_state
           SET pending = 1
           WHERE key = 'motion'`,
        )
        .run();
    });

    return this.readPreferences();
  }

  readPreferenceSyncState(): PreferenceSyncState {
    const row = PreferenceSyncRowSchema.parse(
      this.#database
        .prepare(
          `SELECT remote_version AS remoteVersion,
                pending,
                remote_value AS remoteValue,
                remote_updated_at AS remoteUpdatedAt
         FROM preference_sync_state
         WHERE key = 'motion'`,
        )
        .get(),
    );

    let conflict: RemoteMotionPreference | null = null;

    if (row.remoteValue !== null && row.remoteUpdatedAt !== null && row.remoteVersion !== null) {
      try {
        conflict = validateRemoteMotionPreference({
          updatedAt: row.remoteUpdatedAt,
          value: JSON.parse(row.remoteValue),
          version: row.remoteVersion,
        });
      } catch {
        throw new Error("The local preference sync state is invalid.");
      }
    } else if (row.remoteValue !== null || row.remoteUpdatedAt !== null) {
      throw new Error("The local preference sync state is invalid.");
    }

    return {
      motion: {
        conflict,
        pending: row.pending === 1,
        remoteVersion: row.remoteVersion,
      },
    };
  }

  applyRemotePreference(preference: RemoteMotionPreference): "applied" | "conflict" {
    const remote = validateRemoteMotionPreference(preference);

    return transact(this.#database, () => {
      const local = this.readPreferences().motion;
      const sync = this.readPreferenceSyncState().motion;

      if (sync.pending && local !== remote.value) {
        this.#database
          .prepare(
            `UPDATE preference_sync_state
             SET remote_version = ?, remote_value = ?, remote_updated_at = ?
             WHERE key = 'motion'`,
          )
          .run(remote.version, JSON.stringify(remote.value), remote.updatedAt);
        return "conflict";
      }

      this.#database
        .prepare(
          `UPDATE preferences
           SET value = ?, updated_at = ?
           WHERE key = 'motion'`,
        )
        .run(JSON.stringify(remote.value), remote.updatedAt);
      this.#database
        .prepare(
          `UPDATE preference_sync_state
           SET remote_version = ?, pending = 0,
               remote_value = NULL, remote_updated_at = NULL
           WHERE key = 'motion'`,
        )
        .run(remote.version);
      return "applied";
    });
  }

  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference): boolean {
    validatePreferences({ motion: pushedValue });
    const remote = validateRemoteMotionPreference(preference);

    if (remote.value !== pushedValue) {
      throw new TypeError("The synced preference does not match the pushed value.");
    }

    return transact(this.#database, () => {
      const unchanged = this.readPreferences().motion === pushedValue;

      this.#database
        .prepare(
          `UPDATE preference_sync_state
           SET remote_version = ?, pending = ?,
               remote_value = NULL, remote_updated_at = NULL
           WHERE key = 'motion'`,
        )
        .run(remote.version, unchanged ? 0 : 1);

      if (unchanged) {
        this.#database
          .prepare(
            `UPDATE preferences
             SET updated_at = ?
             WHERE key = 'motion'`,
          )
          .run(remote.updatedAt);
      }

      return unchanged;
    });
  }

  #readMetadata(): WorkspaceMetadata {
    return WorkspaceMetadataSchema.parse(
      this.#database
        .prepare(
          `SELECT workspace_id AS workspaceId,
                bound_user_id AS boundUserId,
                remote_workspace_id AS remoteWorkspaceId
         FROM workspace_metadata
         WHERE singleton = 1`,
        )
        .get(),
    );
  }
}

export class WorkspaceManager {
  readonly #database: DatabaseSync;
  readonly #workspacesDirectory: string;
  #active: WorkspaceStore;

  constructor(userDataRoot: string) {
    mkdirSync(userDataRoot, { recursive: true });
    this.#workspacesDirectory = join(userDataRoot, "workspaces");
    this.#database = new DatabaseSync(join(userDataRoot, "workspace-registry.sqlite"), {
      timeout: 5_000,
    });

    try {
      this.#database.exec(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS workspaces (
          workspace_id TEXT PRIMARY KEY,
          active INTEGER NOT NULL CHECK (active IN (0, 1))
        ) STRICT;

        CREATE UNIQUE INDEX IF NOT EXISTS one_active_workspace
          ON workspaces(active) WHERE active = 1;
      `);

      const active = this.#database
        .prepare("SELECT workspace_id AS workspaceId FROM workspaces WHERE active = 1")
        .get();

      if (active === undefined) {
        this.#active = this.#createWorkspace(null);
      } else {
        this.#active = this.#openWorkspace(WorkspaceRegistryRowSchema.parse(active).workspaceId);
      }
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  get boundUserId() {
    return this.#active.boundUserId;
  }

  get databasePath() {
    return this.#active.databasePath;
  }

  get remoteWorkspaceId() {
    return this.#active.remoteWorkspaceId;
  }

  get workspaceId() {
    return this.#active.workspaceId;
  }

  bindActiveWorkspace(userId: string, remoteWorkspaceId: string) {
    this.#active.bind(userId, remoteWorkspaceId);
  }

  close() {
    this.#active.close();
    this.#database.close();
  }

  createBackup() {
    return this.#active.createBackup();
  }

  importBackup(serialized: string) {
    this.#active.importBackup(serialized);
  }

  putCollectionLot(value: CollectionLot) {
    return this.#active.putCollectionLot(value);
  }

  readCollectionLots() {
    return this.#active.readCollectionLots();
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

  readPreferenceSyncState() {
    return this.#active.readPreferenceSyncState();
  }

  applyRemotePreference(preference: RemoteMotionPreference) {
    return this.#active.applyRemotePreference(preference);
  }

  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference) {
    return this.#active.markPreferenceSynced(pushedValue, preference);
  }

  selectForUser(userId: string): WorkspaceStore {
    assertIdentifier(userId, "user ID");

    if (this.#active.boundUserId === userId) {
      return this.#active;
    }

    const rows = this.#database
      .prepare(
        `SELECT workspace_id AS workspaceId
         FROM workspaces
         WHERE workspace_id <> ?`,
      )
      .all(this.#active.workspaceId);

    for (const rawRow of rows) {
      const row = WorkspaceRegistryRowSchema.parse(rawRow);

      const candidate = this.#openWorkspace(row.workspaceId);

      if (candidate.boundUserId === userId) {
        this.#select(candidate);
        return this.#active;
      }

      candidate.close();
    }

    if (this.#active.boundUserId === null) {
      this.#active.bind(userId);
      return this.#active;
    }

    const workspace = this.#createWorkspace(userId);
    this.#active.close();
    this.#active = workspace;
    return workspace;
  }

  #createWorkspace(boundUserId: string | null): WorkspaceStore {
    const workspaceId = randomUUID();
    const workspace = new WorkspaceStore(this.#workspacePath(workspaceId), {
      boundUserId,
      workspaceId,
    });

    try {
      transact(this.#database, () => {
        this.#database.prepare("UPDATE workspaces SET active = 0 WHERE active = 1").run();
        this.#database
          .prepare("INSERT INTO workspaces (workspace_id, active) VALUES (?, 1)")
          .run(workspaceId);
      });
      return workspace;
    } catch (error) {
      workspace.close();
      throw error;
    }
  }

  #openWorkspace(workspaceId: string) {
    const path = this.#workspacePath(workspaceId);

    if (!existsSync(path)) {
      throw new Error("The local workspace registry is invalid.");
    }

    const workspace = new WorkspaceStore(path);

    if (workspace.workspaceId !== workspaceId) {
      workspace.close();
      throw new Error("The local workspace registry is invalid.");
    }

    return workspace;
  }

  #select(workspace: WorkspaceStore) {
    try {
      transact(this.#database, () => {
        this.#database.prepare("UPDATE workspaces SET active = 0 WHERE active = 1").run();
        const result = this.#database
          .prepare("UPDATE workspaces SET active = 1 WHERE workspace_id = ?")
          .run(workspace.workspaceId);

        if (result.changes !== 1) {
          throw new Error("The local workspace registry is invalid.");
        }
      });
    } catch (error) {
      workspace.close();
      throw error;
    }

    this.#active.close();
    this.#active = workspace;
  }

  #workspacePath(workspaceId: string) {
    return join(this.#workspacesDirectory, `${workspaceId}.sqlite`);
  }
}

function validateRemoteMotionPreference(
  value: RemoteMotionPreference | JSONType,
): RemoteMotionPreference {
  return RemoteMotionPreferenceSchema.parse(value);
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

type EntityTable = "card_lists" | "collection_lots" | "decks";

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

function assertIdentifier(value: string, name: string) {
  if (value.length === 0) {
    throw new TypeError(`Invalid ${name}.`);
  }
}
