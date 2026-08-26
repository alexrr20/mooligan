import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  CardConditionSchema,
  CardLanguageSchema,
  type AddCollectionHoldingRequest,
  type CollectionHoldingKey,
  type CollectionLot,
  type CollectionMutationResult,
  type UpdateCollectionHoldingRequest,
} from "@mooligan/domain/collection";
import { FinishSchema } from "@mooligan/domain/catalog";
import type { Deck } from "@mooligan/domain/decks";
import type { CardList } from "@mooligan/domain/lists";
import {
  SpoilerDecisionStateSchema,
  SpoilerRevealScopeSchema,
  SpoilerTargetIdSchema,
  type SpoilerDecisionState,
  type SpoilerPolicy,
  type SpoilerRevealScope,
  type SpoilerState,
} from "@mooligan/domain/spoilers";
import * as z from "zod";
import type { JSONType } from "zod";

import type { Preferences, PreferencesUpdate } from "../../shared/desktop-api.ts";
import { preferenceDefinitions, validatePreferences } from "./preferences.ts";
import {
  serializeWorkspaceBackup,
  validateCardList,
  validateCollectionLot,
  validateDeck,
  type WorkspaceBackup,
  type WorkspaceBackupSpoilerDecision,
} from "./backup.ts";
import type { WorkspaceRegistry } from "./registry.ts";

type WorkspaceMetadata = {
  workspaceId: string;
};

const PreferenceRowSchema = z.object({ key: z.string(), value: z.string() });
const WorkspaceMetadataSchema = z.object({
  workspaceId: z.string(),
});
const EntityRowSchema = z.object({ id: z.string(), payload: z.string() });
const CollectionLotRowSchema = z.object({
  acquiredAt: z.string().nullable(),
  condition: CardConditionSchema,
  finish: FinishSchema,
  id: z.string(),
  language: CardLanguageSchema,
  locationId: z.string().nullable(),
  notes: z.string().nullable(),
  printingId: z.string(),
  quantity: z.number().int().positive(),
  unitCostAmountMinor: z.number().int().nonnegative().nullable(),
  unitCostCurrency: z.string().nullable(),
});
const SpoilerStateRowSchema = z.object({
  resetGeneration: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const SpoilerDecisionRowSchema = z.object({
  generation: z.number().int().nonnegative(),
  localRevision: z.number().int().positive(),
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: SpoilerTargetIdSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});

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

        CREATE TABLE IF NOT EXISTS spoiler_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          reset_generation INTEGER NOT NULL DEFAULT 0 CHECK (reset_generation >= 0),
          revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS spoiler_decisions (
          scope TEXT NOT NULL CHECK (scope IN ('printing', 'release')),
          target_id TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('protect', 'reveal')),
          reset_generation INTEGER NOT NULL CHECK (reset_generation >= 0),
          local_revision INTEGER NOT NULL CHECK (local_revision > 0),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (scope, target_id)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS collection_lots (
          id TEXT PRIMARY KEY,
          printing_id TEXT NOT NULL,
          finish TEXT NOT NULL CHECK (finish IN ('nonfoil', 'foil', 'etched', 'glossy')),
          language TEXT NOT NULL CHECK (
            language IN ('en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht',
                         'he', 'la', 'grc', 'ar', 'sa', 'ph')
          ),
          condition TEXT NOT NULL CHECK (
            condition IN ('near-mint', 'lightly-played', 'moderately-played',
                          'heavily-played', 'damaged')
          ),
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          acquired_at TEXT,
          unit_cost_amount_minor INTEGER CHECK (
            unit_cost_amount_minor IS NULL OR unit_cost_amount_minor >= 0
          ),
          unit_cost_currency TEXT CHECK (
            unit_cost_currency IS NULL OR unit_cost_currency GLOB '[A-Z][A-Z][A-Z]'
          ),
          location_id TEXT CHECK (location_id IS NULL OR length(location_id) > 0),
          notes TEXT,
          CHECK ((unit_cost_amount_minor IS NULL) = (unit_cost_currency IS NULL))
        ) STRICT;

        CREATE UNIQUE INDEX IF NOT EXISTS collection_lots_unattributed_holding
          ON collection_lots (printing_id, finish, language, condition)
          WHERE acquired_at IS NULL
            AND unit_cost_amount_minor IS NULL
            AND unit_cost_currency IS NULL
            AND location_id IS NULL
            AND notes IS NULL;

        CREATE INDEX IF NOT EXISTS collection_lots_holding
          ON collection_lots (printing_id, finish, language, condition);

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

      this.#database
        .prepare(
          `INSERT OR IGNORE INTO spoiler_state
           (singleton, reset_generation, revision, updated_at)
           VALUES (1, 0, 0, ?)`,
        )
        .run(now);
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

  createBackup(): string {
    const cardLists = this.readCardLists().map((value) => ({ id: value.id, value }));
    const collectionLots = this.readCollectionLots().map((value) => ({ id: value.id, value }));
    const decks = this.readDecks().map((value) => ({ id: value.id, value }));

    return serializeWorkspaceBackup({
      cardLists,
      collectionLots,
      decks,
      preferences: this.readPreferences(),
      spoilerDecisions: this.#readBackupSpoilerDecisions(),
    });
  }

  importBackup(backup: WorkspaceBackup) {
    const now = new Date().toISOString();

    transact(this.#database, () => {
      replaceCollectionLots(
        this.#database,
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

      const updatePreference = this.#database.prepare(
        `UPDATE preferences
         SET value = ?, updated_at = ?
         WHERE key = ?`,
      );
      const motionResult = updatePreference.run(
        JSON.stringify(backup.preferences.motion),
        now,
        "motion",
      );
      const spoilerPolicyResult = updatePreference.run(
        JSON.stringify(backup.preferences.spoilerPolicy),
        now,
        "spoilerPolicy",
      );

      if (motionResult.changes !== 1 || spoilerPolicyResult.changes !== 1) {
        throw new Error("The local preferences are invalid.");
      }

      this.#replaceSpoilerDecisionsFromBackup(backup.spoilerDecisions, now);
    });
  }

  addCollectionHolding(request: AddCollectionHoldingRequest): CollectionMutationResult {
    return transact(this.#database, () => {
      const lotId = randomUUID();
      const row = z.object({ id: z.string(), quantity: z.number().int().positive() }).parse(
        this.#database
          .prepare(
            `INSERT INTO collection_lots
               (id, printing_id, finish, language, condition, quantity)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (printing_id, finish, language, condition)
                 WHERE acquired_at IS NULL
                   AND unit_cost_amount_minor IS NULL
                   AND unit_cost_currency IS NULL
                   AND location_id IS NULL
                   AND notes IS NULL
               DO UPDATE SET quantity = collection_lots.quantity + excluded.quantity
               RETURNING id, quantity`,
          )
          .get(
            lotId,
            request.printingId,
            request.finish,
            request.language,
            request.condition,
            request.quantity,
          ),
      );

      return { holdingQuantity: row.quantity, lotId: row.id };
    });
  }

  readCollectionLots(): CollectionLot[] {
    return this.#database
      .prepare(
        `SELECT id,
                printing_id AS printingId,
                finish,
                language,
                condition,
                quantity,
                acquired_at AS acquiredAt,
                unit_cost_amount_minor AS unitCostAmountMinor,
                unit_cost_currency AS unitCostCurrency,
                location_id AS locationId,
                notes
         FROM collection_lots
         ORDER BY id`,
      )
      .all()
      .map((row) => toCollectionLot(CollectionLotRowSchema.parse(row)));
  }

  readCollectionLot(lotId: string): CollectionLot | null {
    const row = this.#database
      .prepare(
        `SELECT id,
                printing_id AS printingId,
                finish,
                language,
                condition,
                quantity,
                acquired_at AS acquiredAt,
                unit_cost_amount_minor AS unitCostAmountMinor,
                unit_cost_currency AS unitCostCurrency,
                location_id AS locationId,
                notes
         FROM collection_lots
         WHERE id = ?`,
      )
      .get(lotId);

    return row === undefined ? null : toCollectionLot(CollectionLotRowSchema.parse(row));
  }

  updateCollectionHolding(request: UpdateCollectionHoldingRequest): CollectionMutationResult {
    return transact(this.#database, () => {
      const source = this.readCollectionLot(request.lotId);

      if (!source || !isUnattributedCollectionLot(source)) {
        throw new Error("This Collection holding cannot be edited.");
      }

      const targetKey: CollectionHoldingKey = {
        condition: request.condition,
        finish: request.finish,
        language: request.language,
        printingId: source.printingId,
      };

      if (sameHoldingKey(source, targetKey)) {
        this.#database
          .prepare("UPDATE collection_lots SET quantity = ? WHERE id = ?")
          .run(request.quantity, source.id);
        return { holdingQuantity: request.quantity, lotId: source.id };
      }

      const target = z
        .object({ id: z.string(), quantity: z.number().int().positive() })
        .nullable()
        .parse(
          this.#database
            .prepare(
              `SELECT id, quantity
               FROM collection_lots
               WHERE printing_id = ?
                 AND finish = ?
                 AND language = ?
                 AND condition = ?
                 AND acquired_at IS NULL
                 AND unit_cost_amount_minor IS NULL
                 AND unit_cost_currency IS NULL
                 AND location_id IS NULL
                 AND notes IS NULL`,
            )
            .get(targetKey.printingId, targetKey.finish, targetKey.language, targetKey.condition) ??
            null,
        );

      if (target) {
        const holdingQuantity = target.quantity + request.quantity;
        this.#database
          .prepare("UPDATE collection_lots SET quantity = ? WHERE id = ?")
          .run(holdingQuantity, target.id);
        this.#database.prepare("DELETE FROM collection_lots WHERE id = ?").run(source.id);
        return { holdingQuantity, lotId: target.id };
      }

      this.#database
        .prepare(
          `UPDATE collection_lots
           SET finish = ?, language = ?, condition = ?, quantity = ?
           WHERE id = ?`,
        )
        .run(request.finish, request.language, request.condition, request.quantity, source.id);

      return { holdingQuantity: request.quantity, lotId: source.id };
    });
  }

  removeCollectionHolding(lotId: string) {
    return transact(this.#database, () => {
      const result = this.#database
        .prepare(
          `DELETE FROM collection_lots
           WHERE id = ?
             AND acquired_at IS NULL
             AND unit_cost_amount_minor IS NULL
             AND unit_cost_currency IS NULL
             AND location_id IS NULL
             AND notes IS NULL`,
        )
        .run(lotId);

      if (result.changes !== 1) {
        throw new Error("This Collection holding cannot be removed.");
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
    if (update.motion === undefined && update.spoilerPolicy === undefined) {
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

      if (
        update.spoilerPolicy !== undefined &&
        this.readPreferences().spoilerPolicy !== update.spoilerPolicy
      ) {
        this.#database
          .prepare(
            `UPDATE preferences
             SET value = ?, updated_at = ?
             WHERE key = 'spoilerPolicy'`,
          )
          .run(JSON.stringify(update.spoilerPolicy), now);
        this.#advanceSpoilerRevision(now);
      }
    });

    return this.readPreferences();
  }

  readSpoilerState(): SpoilerState {
    const preferences = this.readPreferences();
    const state = this.#readSpoilerStateRow();
    const active = this.#readSpoilerDecisions(state.resetGeneration).filter(
      (decision) => decision.state === "reveal",
    );

    return {
      activePrintingIds: active
        .filter((decision) => decision.scope === "printing")
        .map((decision) => decision.targetId),
      activeRootSetIds: active
        .filter((decision) => decision.scope === "release")
        .map((decision) => decision.targetId),
      policy: preferences.spoilerPolicy,
      revision: state.revision,
    };
  }

  setSpoilerPolicy(policy: SpoilerPolicy): SpoilerState {
    this.updatePreferences({ spoilerPolicy: policy });
    return this.readSpoilerState();
  }

  revealSpoilerPrinting(printingId: string): SpoilerState {
    return this.#setSpoilerDecision("printing", printingId, "reveal");
  }

  protectSpoilerPrinting(printingId: string): SpoilerState {
    return this.#setSpoilerDecision("printing", printingId, "protect");
  }

  revealSpoilerRelease(rootSetId: string): SpoilerState {
    return this.#setSpoilerDecision("release", rootSetId, "reveal");
  }

  protectSpoilerRelease(rootSetId: string): SpoilerState {
    return this.#setSpoilerDecision("release", rootSetId, "protect");
  }

  protectAllSpoilers(): SpoilerState {
    const now = new Date().toISOString();

    transact(this.#database, () => {
      this.#database
        .prepare(
          `UPDATE preferences
           SET value = '"protect"', updated_at = ?
           WHERE key = 'spoilerPolicy'`,
        )
        .run(now);
      this.#database
        .prepare(
          `UPDATE spoiler_state
           SET reset_generation = reset_generation + 1,
               revision = revision + 1,
               updated_at = ?
           WHERE singleton = 1`,
        )
        .run(now);
    });

    return this.readSpoilerState();
  }

  #setSpoilerDecision(
    scope: SpoilerRevealScope,
    targetId: string,
    state: SpoilerDecisionState,
  ): SpoilerState {
    const now = new Date().toISOString();

    transact(this.#database, () => {
      const spoilerState = this.#readSpoilerStateRow();
      const current = this.#readSpoilerDecisionRow(scope, targetId);

      if (current?.generation === spoilerState.resetGeneration && current.state === state) {
        return;
      }

      const revision = this.#nextSpoilerRevision();
      this.#database
        .prepare(
          `INSERT INTO spoiler_decisions
           (scope, target_id, state, reset_generation, local_revision, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(scope, target_id) DO UPDATE SET
             state = excluded.state,
             reset_generation = excluded.reset_generation,
             local_revision = excluded.local_revision,
             updated_at = excluded.updated_at`,
        )
        .run(scope, targetId, state, spoilerState.resetGeneration, revision, now);
    });

    return this.readSpoilerState();
  }

  #readSpoilerStateRow() {
    return SpoilerStateRowSchema.parse(
      this.#database
        .prepare(
          `SELECT reset_generation AS resetGeneration,
                  revision,
                  updated_at AS updatedAt
           FROM spoiler_state
           WHERE singleton = 1`,
        )
        .get(),
    );
  }

  #readSpoilerDecisions(resetGeneration: number) {
    return z.array(SpoilerDecisionRowSchema).parse(
      this.#database
        .prepare(
          `SELECT scope,
                  target_id AS targetId,
                  state,
                  reset_generation AS generation,
                  local_revision AS localRevision,
                  updated_at AS updatedAt
           FROM spoiler_decisions
           WHERE reset_generation = ?
           ORDER BY scope, target_id`,
        )
        .all(resetGeneration),
    );
  }

  #readSpoilerDecisionRow(scope: SpoilerRevealScope, targetId: string) {
    const value = this.#database
      .prepare(
        `SELECT scope,
                target_id AS targetId,
                state,
                reset_generation AS generation,
                local_revision AS localRevision,
                updated_at AS updatedAt
         FROM spoiler_decisions
         WHERE scope = ? AND target_id = ?`,
      )
      .get(scope, targetId);

    return value === undefined ? null : SpoilerDecisionRowSchema.parse(value);
  }

  #nextSpoilerRevision() {
    const row = z.object({ revision: z.number().int().positive() }).parse(
      this.#database
        .prepare(
          `UPDATE spoiler_state
             SET revision = revision + 1
             WHERE singleton = 1
             RETURNING revision`,
        )
        .get(),
    );
    return row.revision;
  }

  #advanceSpoilerRevision(updatedAt: string) {
    this.#database
      .prepare(
        `UPDATE spoiler_state
         SET revision = revision + 1,
             updated_at = ?
         WHERE singleton = 1`,
      )
      .run(updatedAt);
  }

  #readBackupSpoilerDecisions(): WorkspaceBackupSpoilerDecision[] {
    const state = this.#readSpoilerStateRow();
    return this.#readSpoilerDecisions(state.resetGeneration).map((decision) => ({
      scope: decision.scope,
      state: decision.state,
      targetId: decision.targetId,
    }));
  }

  #replaceSpoilerDecisionsFromBackup(
    decisions: WorkspaceBackupSpoilerDecision[],
    updatedAt: string,
  ) {
    const current = this.#readSpoilerStateRow();
    const resetGeneration = current.resetGeneration + 1;
    let revision = current.revision + 1;

    this.#database.prepare("DELETE FROM spoiler_decisions").run();
    const insert = this.#database.prepare(
      `INSERT INTO spoiler_decisions
       (scope, target_id, state, reset_generation, local_revision, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const decision of decisions) {
      revision += 1;
      insert.run(
        decision.scope,
        decision.targetId,
        decision.state,
        resetGeneration,
        revision,
        updatedAt,
      );
    }

    this.#database
      .prepare(
        `UPDATE spoiler_state
         SET reset_generation = ?,
             revision = ?,
             updated_at = ?
         WHERE singleton = 1`,
      )
      .run(resetGeneration, revision, updatedAt);
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

  constructor(registry: WorkspaceRegistry) {
    this.#registry = registry;
    this.#active = this.#openWorkspace(registry.bootstrap().workspaceId);
  }

  get databasePath() {
    return this.#active.databasePath;
  }

  get workspaceId() {
    return this.#active.workspaceId;
  }

  close() {
    this.#active.close();
  }

  createBackup() {
    return this.#active.createBackup();
  }

  importBackup(backup: WorkspaceBackup) {
    this.#active.importBackup(backup);
  }

  addCollectionHolding(request: AddCollectionHoldingRequest) {
    return this.#active.addCollectionHolding(request);
  }

  readCollectionLots() {
    return this.#active.readCollectionLots();
  }

  readCollectionLot(lotId: string) {
    return this.#active.readCollectionLot(lotId);
  }

  updateCollectionHolding(request: UpdateCollectionHoldingRequest) {
    return this.#active.updateCollectionHolding(request);
  }

  removeCollectionHolding(lotId: string) {
    return this.#active.removeCollectionHolding(lotId);
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

  readSpoilerState() {
    return this.#active.readSpoilerState();
  }

  setSpoilerPolicy(policy: SpoilerPolicy) {
    return this.#active.setSpoilerPolicy(policy);
  }

  revealSpoilerPrinting(printingId: string) {
    return this.#active.revealSpoilerPrinting(printingId);
  }

  protectSpoilerPrinting(printingId: string) {
    return this.#active.protectSpoilerPrinting(printingId);
  }

  revealSpoilerRelease(rootSetId: string) {
    return this.#active.revealSpoilerRelease(rootSetId);
  }

  protectSpoilerRelease(rootSetId: string) {
    return this.#active.protectSpoilerRelease(rootSetId);
  }

  protectAllSpoilers() {
    return this.#active.protectAllSpoilers();
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

function replaceCollectionLots(database: DatabaseSync, lots: CollectionLot[]) {
  database.prepare("DELETE FROM collection_lots").run();
  const insert = database.prepare(
    `INSERT INTO collection_lots
     (id, printing_id, finish, language, condition, quantity, acquired_at,
      unit_cost_amount_minor, unit_cost_currency, location_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const lot of lots) {
    insert.run(...collectionLotArguments(lot));
  }
}

function collectionLotArguments(lot: CollectionLot) {
  const value = validateCollectionLot(lot);
  return [
    value.id,
    value.printingId,
    value.finish,
    value.language,
    value.condition,
    value.quantity,
    optionalText(value.acquiredAt),
    value.unitCost?.amountMinor ?? null,
    value.unitCost?.currency ?? null,
    optionalText(value.locationId),
    optionalText(value.notes),
  ] as const;
}

type CollectionLotRow = z.infer<typeof CollectionLotRowSchema>;

function toCollectionLot(row: CollectionLotRow): CollectionLot {
  const lot: CollectionLot = {
    condition: row.condition,
    finish: row.finish,
    id: row.id,
    language: row.language,
    printingId: row.printingId,
    quantity: row.quantity,
  };

  if (row.acquiredAt) lot.acquiredAt = row.acquiredAt;
  if (row.locationId) lot.locationId = row.locationId;
  if (row.notes) lot.notes = row.notes;
  if (row.unitCostAmountMinor !== null && row.unitCostCurrency !== null) {
    lot.unitCost = { amountMinor: row.unitCostAmountMinor, currency: row.unitCostCurrency };
  }

  return validateCollectionLot(lot);
}

function optionalText(value: string | undefined) {
  return value?.trim() ? value : null;
}

function isUnattributedCollectionLot(lot: CollectionLot) {
  return (
    lot.acquiredAt === undefined &&
    lot.unitCost === undefined &&
    lot.locationId === undefined &&
    lot.notes === undefined
  );
}

function sameHoldingKey(lot: CollectionLot, key: CollectionHoldingKey) {
  return (
    lot.printingId === key.printingId &&
    lot.finish === key.finish &&
    lot.language === key.language &&
    lot.condition === key.condition
  );
}
