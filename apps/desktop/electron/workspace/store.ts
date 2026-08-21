import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
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
  SpoilerDecisionSchema,
  SpoilerDecisionStateSchema,
  SpoilerPolicySchema,
  SpoilerRevealScopeSchema,
  SpoilerTargetIdSchema,
  type SpoilerDecision,
  type SpoilerDecisionState,
  type SpoilerPolicy,
  type SpoilerRevealScope,
  type SpoilerState,
} from "@mooligan/domain/spoilers";
import {
  RemoteMotionPreferenceSchema,
  RemoteSpoilerDecisionSchema,
  SPOILER_SYNC_BATCH_SIZE,
  type RemoteMotionPreference,
  type RemoteSpoilerDecision,
  type RemoteSpoilerState,
} from "@mooligan/domain/workspace-sync";
import * as z from "zod";
import type { JSONType } from "zod";

import {
  preferenceDefinitions,
  type MotionPreference,
  type Preferences,
  type PreferencesUpdate,
  validatePreferences,
} from "./preferences.ts";
import {
  serializeWorkspaceBackup,
  validateCardList,
  validateCollectionLot,
  validateDeck,
  type WorkspaceBackup,
  type WorkspaceBackupSpoilerDecision,
} from "./backup.ts";

export type PreferenceSyncState = {
  motion: {
    conflict: RemoteMotionPreference | null;
    pending: boolean;
    remoteVersion: number | null;
  };
};

export type SpoilerSyncState = {
  decisions: Array<{
    decision: SpoilerDecision;
    pending: boolean;
    remoteVersion: number | null;
  }>;
  global: {
    pending: boolean;
    policy: SpoilerPolicy;
    remoteVersion: number | null;
    resetGeneration: number;
    revision: number;
    updatedAt: string;
  };
};

export type SpoilerSyncBatch = {
  decisions: SpoilerSyncState["decisions"];
  global: SpoilerSyncState["global"] | null;
  operationId: string;
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
  pending: z.union([z.literal(0), z.literal(1)]),
  remoteVersion: z.number().int().positive().nullable(),
  resetGeneration: z.number().int().nonnegative(),
  resetPending: z.union([z.literal(0), z.literal(1)]),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const SpoilerGlobalSyncStateSchema = z.strictObject({
  pending: z.boolean(),
  policy: SpoilerPolicySchema,
  remoteVersion: z.number().int().positive().nullable(),
  resetGeneration: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const SpoilerDecisionSyncStateSchema = z.strictObject({
  decision: SpoilerDecisionSchema,
  pending: z.boolean(),
  remoteVersion: z.number().int().positive().nullable(),
});
const SpoilerSyncBatchSchema = z.strictObject({
  decisions: z.array(SpoilerDecisionSyncStateSchema).max(SPOILER_SYNC_BATCH_SIZE),
  global: SpoilerGlobalSyncStateSchema.nullable(),
  operationId: z.uuid(),
});
const SpoilerDecisionRowSchema = z.object({
  generation: z.number().int().nonnegative(),
  localRevision: z.number().int().positive(),
  pending: z.union([z.literal(0), z.literal(1)]),
  remoteVersion: z.number().int().positive().nullable(),
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: SpoilerTargetIdSchema,
  updatedAt: z.iso.datetime({ offset: true }),
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

        CREATE TABLE IF NOT EXISTS spoiler_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          reset_generation INTEGER NOT NULL DEFAULT 0 CHECK (reset_generation >= 0),
          revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
          pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1)),
          reset_pending INTEGER NOT NULL DEFAULT 0 CHECK (reset_pending IN (0, 1)),
          remote_version INTEGER CHECK (remote_version IS NULL OR remote_version > 0),
          updated_at TEXT NOT NULL,
          CHECK (reset_pending = 0 OR pending = 1)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS spoiler_decisions (
          scope TEXT NOT NULL CHECK (scope IN ('printing', 'release')),
          target_id TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('protect', 'reveal')),
          reset_generation INTEGER NOT NULL CHECK (reset_generation >= 0),
          local_revision INTEGER NOT NULL CHECK (local_revision > 0),
          pending INTEGER NOT NULL DEFAULT 1 CHECK (pending IN (0, 1)),
          remote_version INTEGER CHECK (remote_version IS NULL OR remote_version > 0),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (scope, target_id)
        ) STRICT;

        CREATE INDEX IF NOT EXISTS spoiler_decisions_pending
          ON spoiler_decisions (pending, scope, target_id);

        CREATE TABLE IF NOT EXISTS spoiler_sync_outbox (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          operation_id TEXT NOT NULL,
          payload TEXT NOT NULL CHECK (json_valid(payload)),
          created_at TEXT NOT NULL
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
          `INSERT OR IGNORE INTO spoiler_state
           (singleton, reset_generation, revision, pending, reset_pending, updated_at)
           VALUES (1, 0, 0, 0, 0, ?)`,
        )
        .run(now);

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
        this.#database
          .prepare(
            `UPDATE preference_sync_state
             SET pending = 1
             WHERE key = 'motion'`,
          )
          .run();
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
        this.#advanceSpoilerRevision(now, true);
      }
    });

    return this.readPreferences();
  }

  readSpoilerState(): SpoilerState {
    const sync = this.readSpoilerSyncState();
    const active = sync.decisions.filter(
      ({ decision }) =>
        decision.generation === sync.global.resetGeneration && decision.state === "reveal",
    );

    return {
      activePrintingIds: active
        .filter(({ decision }) => decision.scope === "printing")
        .map(({ decision }) => decision.targetId),
      activeRootSetIds: active
        .filter(({ decision }) => decision.scope === "release")
        .map(({ decision }) => decision.targetId),
      policy: sync.global.policy,
      revision: sync.global.revision,
    };
  }

  readSpoilerSyncState(): SpoilerSyncState {
    const preferences = this.readPreferences();
    const state = SpoilerStateRowSchema.parse(
      this.#database
        .prepare(
          `SELECT reset_generation AS resetGeneration,
                  revision,
                  pending,
                  reset_pending AS resetPending,
                  remote_version AS remoteVersion,
                  updated_at AS updatedAt
           FROM spoiler_state
           WHERE singleton = 1`,
        )
        .get(),
    );
    const decisions = z
      .array(SpoilerDecisionRowSchema)
      .parse(
        this.#database
          .prepare(
            `SELECT scope,
                    target_id AS targetId,
                    state,
                    reset_generation AS generation,
                    local_revision AS localRevision,
                    pending,
                    remote_version AS remoteVersion,
                    updated_at AS updatedAt
             FROM spoiler_decisions
             WHERE reset_generation = ?
             ORDER BY scope, target_id`,
          )
          .all(state.resetGeneration),
      )
      .map((row) => ({
        decision: {
          generation: row.generation,
          revision: row.localRevision,
          scope: row.scope,
          state: row.state,
          targetId: row.targetId,
          updatedAt: row.updatedAt,
        },
        pending: row.pending === 1,
        remoteVersion: row.remoteVersion,
      }));

    return {
      decisions,
      global: {
        pending: state.pending === 1,
        policy: preferences.spoilerPolicy,
        remoteVersion: state.remoteVersion,
        resetGeneration: state.resetGeneration,
        revision: state.revision,
        updatedAt: state.updatedAt,
      },
    };
  }

  prepareSpoilerSyncBatch(): SpoilerSyncBatch | null {
    return transact(this.#database, () => {
      const existing = this.#readSpoilerSyncBatch();
      if (existing) {
        return existing;
      }

      const sync = this.readSpoilerSyncState();
      const decisions = sync.decisions
        .filter(({ pending }) => pending)
        .slice(0, SPOILER_SYNC_BATCH_SIZE);
      const global = sync.global.pending ? sync.global : null;
      if (!global && decisions.length === 0) {
        return null;
      }

      const batch = {
        decisions,
        global,
        operationId: randomUUID(),
      } satisfies SpoilerSyncBatch;
      this.#database
        .prepare(
          `INSERT INTO spoiler_sync_outbox
           (singleton, operation_id, payload, created_at)
           VALUES (1, ?, ?, ?)`,
        )
        .run(
          batch.operationId,
          JSON.stringify({ decisions: batch.decisions, global: batch.global }),
          new Date().toISOString(),
        );
      return batch;
    });
  }

  completeSpoilerSyncBatch(operationId: string) {
    const result = this.#database
      .prepare("DELETE FROM spoiler_sync_outbox WHERE singleton = 1 AND operation_id = ?")
      .run(operationId);

    if (result.changes !== 1) {
      throw new Error("The spoiler sync operation is no longer current.");
    }
  }

  hasSpoilerSyncBatch() {
    return (
      this.#database.prepare("SELECT 1 FROM spoiler_sync_outbox WHERE singleton = 1").get() !==
      undefined
    );
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
               pending = 1,
               reset_pending = 1,
               updated_at = ?
           WHERE singleton = 1`,
        )
        .run(now);
      this.#database
        .prepare(
          `UPDATE spoiler_decisions
           SET pending = 0
           WHERE reset_generation < (
             SELECT reset_generation FROM spoiler_state WHERE singleton = 1
           )`,
        )
        .run();
    });

    return this.readSpoilerState();
  }

  applyRemoteSpoilerState(state: RemoteSpoilerState): "applied" | "pending" {
    return this.#applyRemoteSpoilerState(state);
  }

  markSpoilerStateSynced(
    pushedState: SpoilerSyncState["global"],
    state: RemoteSpoilerState,
  ): boolean {
    return this.#applyRemoteSpoilerState(state, pushedState.revision, pushedState) === "applied";
  }

  applyRemoteSpoilerDecisions(decisions: RemoteSpoilerDecision[]) {
    const validated = decisions.map((decision) => RemoteSpoilerDecisionSchema.parse(decision));
    const seen = new Set<string>();

    for (const decision of validated) {
      const key = spoilerDecisionKey(decision.scope, decision.targetId);

      if (seen.has(key)) {
        throw new TypeError("Remote spoiler decisions must be unique.");
      }
      seen.add(key);
    }

    transact(this.#database, () => {
      for (const decision of validated) {
        this.#applyRemoteSpoilerDecisionInTransaction(decision);
      }
    });
  }

  markSpoilerDecisionSynced(
    pushedDecision: SpoilerSyncState["decisions"][number],
    remote: RemoteSpoilerDecision,
  ): boolean {
    if (
      pushedDecision.decision.scope !== remote.scope ||
      pushedDecision.decision.targetId !== remote.targetId
    ) {
      throw new TypeError("The synced spoiler decision does not match the pushed target.");
    }

    return this.#applyRemoteSpoilerDecision(remote, pushedDecision) === "applied";
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
        conflict = RemoteMotionPreferenceSchema.parse({
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
    return transact(this.#database, () => {
      const local = this.readPreferences().motion;
      const sync = this.readPreferenceSyncState().motion;

      if (sync.pending && local !== preference.value) {
        this.#database
          .prepare(
            `UPDATE preference_sync_state
             SET remote_version = ?, remote_value = ?, remote_updated_at = ?
             WHERE key = 'motion'`,
          )
          .run(preference.version, JSON.stringify(preference.value), preference.updatedAt);
        return "conflict";
      }

      this.#database
        .prepare(
          `UPDATE preferences
           SET value = ?, updated_at = ?
           WHERE key = 'motion'`,
        )
        .run(JSON.stringify(preference.value), preference.updatedAt);
      this.#database
        .prepare(
          `UPDATE preference_sync_state
           SET remote_version = ?, pending = 0,
               remote_value = NULL, remote_updated_at = NULL
           WHERE key = 'motion'`,
        )
        .run(preference.version);
      return "applied";
    });
  }

  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference): boolean {
    if (preference.value !== pushedValue) {
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
        .run(preference.version, unchanged ? 0 : 1);

      if (unchanged) {
        this.#database
          .prepare(
            `UPDATE preferences
             SET updated_at = ?
             WHERE key = 'motion'`,
          )
          .run(preference.updatedAt);
      }

      return unchanged;
    });
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
           (scope, target_id, state, reset_generation, local_revision, pending, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(scope, target_id) DO UPDATE SET
             state = excluded.state,
             reset_generation = excluded.reset_generation,
             local_revision = excluded.local_revision,
             pending = 1,
             updated_at = excluded.updated_at`,
        )
        .run(scope, targetId, state, spoilerState.resetGeneration, revision, now);
    });

    return this.readSpoilerState();
  }

  #applyRemoteSpoilerState(
    remote: RemoteSpoilerState,
    expectedLocalRevision?: number,
    pushedState?: SpoilerSyncState["global"],
  ): "applied" | "pending" {
    return transact(this.#database, () => {
      const current = this.readSpoilerSyncState().global;
      const resetPending = this.#readSpoilerStateRow().resetPending === 1;

      if (current.remoteVersion !== null && remote.version < current.remoteVersion) {
        return current.pending ? "pending" : "applied";
      }
      if (
        pushedState?.remoteVersion !== null &&
        pushedState?.remoteVersion !== undefined &&
        remote.version <= pushedState.remoteVersion
      ) {
        return current.pending ? "pending" : "applied";
      }

      const acknowledgesPushedState =
        pushedState !== undefined &&
        remote.policy === pushedState.policy &&
        remote.resetGeneration === pushedState.resetGeneration &&
        remote.version === (pushedState.remoteVersion ?? 0) + 1;

      if (acknowledgesPushedState) {
        const globalChanged =
          current.policy !== pushedState.policy ||
          current.resetGeneration !== pushedState.resetGeneration;
        const keepResetPending =
          resetPending && current.resetGeneration > pushedState.resetGeneration;
        const updatedAt = globalChanged ? current.updatedAt : remote.updatedAt;

        this.#database
          .prepare(
            `UPDATE preferences
             SET value = ?, updated_at = ?
             WHERE key = 'spoilerPolicy'`,
          )
          .run(JSON.stringify(current.policy), updatedAt);
        this.#database
          .prepare(
            `UPDATE spoiler_state
             SET pending = ?,
                 reset_pending = ?,
                 remote_version = ?,
                 updated_at = ?
             WHERE singleton = 1`,
          )
          .run(Number(globalChanged), Number(keepResetPending), remote.version, updatedAt);

        return globalChanged ? "pending" : "applied";
      }

      const revisionChanged =
        expectedLocalRevision !== undefined && current.revision !== expectedLocalRevision;
      const resetAcknowledged =
        resetPending &&
        expectedLocalRevision !== undefined &&
        !revisionChanged &&
        remote.resetGeneration === current.resetGeneration &&
        remote.policy === current.policy &&
        current.remoteVersion !== null &&
        remote.version === current.remoteVersion + 1;
      const keepResetPending = resetPending && !resetAcknowledged;
      let policy: SpoilerPolicy;
      let resetGeneration: number;
      let pending: boolean;
      let updatedAt: string;

      if (keepResetPending && remote.resetGeneration >= current.resetGeneration) {
        policy = current.policy === "protect" || remote.policy === "protect" ? "protect" : "show";
        resetGeneration = remote.resetGeneration + 1;
        pending = true;
        updatedAt = current.updatedAt;
      } else if (
        current.remoteVersion !== null &&
        remote.version === current.remoteVersion &&
        (remote.policy !== current.policy || remote.resetGeneration !== current.resetGeneration)
      ) {
        policy = "protect";
        resetGeneration = Math.max(current.resetGeneration, remote.resetGeneration);
        pending = true;
        updatedAt = current.updatedAt;
      } else if (!current.pending) {
        ({ policy, resetGeneration, updatedAt } = remote);
        pending = false;
      } else if (current.policy !== remote.policy) {
        policy = "protect";
        resetGeneration = Math.max(current.resetGeneration, remote.resetGeneration);
        pending = remote.policy !== "protect" || remote.resetGeneration !== resetGeneration;
        updatedAt = pending ? current.updatedAt : remote.updatedAt;
      } else if (current.resetGeneration > remote.resetGeneration) {
        ({ policy, resetGeneration, updatedAt } = current);
        pending = true;
      } else if (remote.resetGeneration > current.resetGeneration) {
        ({ policy, resetGeneration, updatedAt } = remote);
        pending = false;
      } else if (revisionChanged) {
        ({ policy, resetGeneration, updatedAt } = current);
        pending = true;
      } else {
        ({ policy, resetGeneration, updatedAt } = remote);
        pending = false;
      }

      const changed = policy !== current.policy || resetGeneration !== current.resetGeneration;
      const revision = current.revision + Number(changed);

      this.#database
        .prepare(
          `UPDATE preferences
           SET value = ?, updated_at = ?
           WHERE key = 'spoilerPolicy'`,
        )
        .run(JSON.stringify(policy), updatedAt);
      this.#database
        .prepare(
          `UPDATE spoiler_state
           SET reset_generation = ?,
               revision = ?,
               pending = ?,
               reset_pending = ?,
               remote_version = ?,
               updated_at = ?
           WHERE singleton = 1`,
        )
        .run(
          resetGeneration,
          revision,
          Number(pending),
          Number(keepResetPending),
          remote.version,
          updatedAt,
        );
      if (keepResetPending && resetGeneration > current.resetGeneration) {
        this.#database
          .prepare(
            `UPDATE spoiler_decisions
             SET reset_generation = ?, pending = 1
             WHERE reset_generation = ? AND pending = 1 AND state = 'protect'`,
          )
          .run(resetGeneration, current.resetGeneration);
      }
      this.#database
        .prepare(
          `UPDATE spoiler_decisions
           SET pending = 0
           WHERE reset_generation < ?`,
        )
        .run(resetGeneration);

      return pending ? "pending" : "applied";
    });
  }

  #applyRemoteSpoilerDecision(
    remote: RemoteSpoilerDecision,
    pushedDecision?: SpoilerSyncState["decisions"][number],
  ): "applied" | "pending" {
    return transact(this.#database, () =>
      this.#applyRemoteSpoilerDecisionInTransaction(remote, pushedDecision),
    );
  }

  #applyRemoteSpoilerDecisionInTransaction(
    remote: RemoteSpoilerDecision,
    pushedDecision?: SpoilerSyncState["decisions"][number],
  ): "applied" | "pending" {
    const global = this.#readSpoilerStateRow();
    const current = this.#readSpoilerDecisionRow(remote.scope, remote.targetId);

    if (remote.generation > global.resetGeneration) {
      throw new TypeError("The remote spoiler decision uses an unknown reset generation.");
    }
    if (
      current?.remoteVersion !== null &&
      current?.remoteVersion !== undefined &&
      remote.version < current.remoteVersion
    ) {
      return current.pending === 1 ? "pending" : "applied";
    }
    if (
      pushedDecision?.remoteVersion !== null &&
      pushedDecision?.remoteVersion !== undefined &&
      remote.version <= pushedDecision.remoteVersion
    ) {
      return current?.pending === 1 && current.generation === global.resetGeneration
        ? "pending"
        : "applied";
    }

    const revisionChanged =
      pushedDecision !== undefined &&
      (current?.localRevision !== pushedDecision.decision.revision ||
        current?.generation !== pushedDecision.decision.generation ||
        current?.state !== pushedDecision.decision.state);
    const acknowledgesPushedDecision =
      pushedDecision !== undefined &&
      remote.generation === pushedDecision.decision.generation &&
      remote.state === pushedDecision.decision.state &&
      remote.version === (pushedDecision.remoteVersion ?? 0) + 1;

    if (acknowledgesPushedDecision && revisionChanged && current) {
      const remainsPending = current.generation === global.resetGeneration;
      this.#database
        .prepare(
          `UPDATE spoiler_decisions
           SET pending = ?, remote_version = ?
           WHERE scope = ? AND target_id = ?`,
        )
        .run(Number(remainsPending), remote.version, remote.scope, remote.targetId);
      return remainsPending ? "pending" : "applied";
    }

    if (remote.generation < global.resetGeneration) {
      if (acknowledgesPushedDecision && current) {
        this.#database
          .prepare(
            `UPDATE spoiler_decisions
             SET pending = 0, remote_version = ?
             WHERE scope = ? AND target_id = ?`,
          )
          .run(remote.version, remote.scope, remote.targetId);
      }
      return current?.pending === 1 && current.generation === global.resetGeneration
        ? "pending"
        : "applied";
    }

    const sameVersionConflict =
      current?.remoteVersion !== null &&
      current?.remoteVersion !== undefined &&
      remote.version === current.remoteVersion &&
      (remote.generation !== current.generation || remote.state !== current.state);
    let state: SpoilerDecisionState;
    let pending: boolean;
    let updatedAt: string;

    if (sameVersionConflict) {
      state = "protect";
      pending = true;
      updatedAt = current.updatedAt;
    } else if (!current || current.generation < remote.generation || current.pending === 0) {
      state = remote.state;
      pending = false;
      updatedAt = remote.updatedAt;
    } else if (current.generation > remote.generation) {
      state = current.state;
      pending = true;
      updatedAt = current.updatedAt;
    } else if (current.state !== remote.state) {
      state = "protect";
      pending = remote.state !== "protect";
      updatedAt = pending ? current.updatedAt : remote.updatedAt;
    } else if (revisionChanged) {
      state = current.state;
      pending = true;
      updatedAt = current.updatedAt;
    } else {
      state = remote.state;
      pending = false;
      updatedAt = remote.updatedAt;
    }

    const changed =
      current === null || current.generation !== remote.generation || current.state !== state;
    const localRevision = changed
      ? this.#nextSpoilerRevision()
      : (current?.localRevision ?? this.#nextSpoilerRevision());

    this.#database
      .prepare(
        `INSERT INTO spoiler_decisions
           (scope, target_id, state, reset_generation, local_revision, pending, remote_version, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(scope, target_id) DO UPDATE SET
             state = excluded.state,
             reset_generation = excluded.reset_generation,
             local_revision = excluded.local_revision,
             pending = excluded.pending,
             remote_version = excluded.remote_version,
             updated_at = excluded.updated_at`,
      )
      .run(
        remote.scope,
        remote.targetId,
        state,
        remote.generation,
        localRevision,
        Number(pending),
        remote.version,
        updatedAt,
      );

    return pending ? "pending" : "applied";
  }

  #readSpoilerStateRow() {
    return SpoilerStateRowSchema.parse(
      this.#database
        .prepare(
          `SELECT reset_generation AS resetGeneration,
                  revision,
                  pending,
                  reset_pending AS resetPending,
                  remote_version AS remoteVersion,
                  updated_at AS updatedAt
           FROM spoiler_state
           WHERE singleton = 1`,
        )
        .get(),
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
                pending,
                remote_version AS remoteVersion,
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

  #advanceSpoilerRevision(updatedAt: string, pending: boolean) {
    this.#database
      .prepare(
        `UPDATE spoiler_state
         SET revision = revision + 1,
             pending = ?,
             updated_at = ?
         WHERE singleton = 1`,
      )
      .run(Number(pending), updatedAt);
  }

  #readBackupSpoilerDecisions(): WorkspaceBackupSpoilerDecision[] {
    return this.readSpoilerSyncState().decisions.map(({ decision }) => ({
      scope: decision.scope,
      state: decision.state,
      targetId: decision.targetId,
    }));
  }

  #readSpoilerSyncBatch(): SpoilerSyncBatch | null {
    const row = z
      .object({ operationId: z.uuid(), payload: z.string() })
      .nullable()
      .parse(
        this.#database
          .prepare(
            `SELECT operation_id AS operationId, payload
             FROM spoiler_sync_outbox
             WHERE singleton = 1`,
          )
          .get() ?? null,
      );
    if (!row) {
      return null;
    }

    try {
      const payload = z
        .strictObject({
          decisions: z.array(SpoilerDecisionSyncStateSchema).max(SPOILER_SYNC_BATCH_SIZE),
          global: SpoilerGlobalSyncStateSchema.nullable(),
        })
        .parse(JSON.parse(row.payload));
      return SpoilerSyncBatchSchema.parse({ ...payload, operationId: row.operationId });
    } catch {
      throw new Error("The local spoiler sync outbox is invalid.");
    }
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
       (scope, target_id, state, reset_generation, local_revision, pending, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
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
             pending = 1,
             reset_pending = 1,
             updated_at = ?
         WHERE singleton = 1`,
      )
      .run(resetGeneration, revision, updatedAt);
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

  readSpoilerSyncState() {
    return this.#active.readSpoilerSyncState();
  }

  prepareSpoilerSyncBatch() {
    return this.#active.prepareSpoilerSyncBatch();
  }

  completeSpoilerSyncBatch(operationId: string) {
    this.#active.completeSpoilerSyncBatch(operationId);
  }

  hasSpoilerSyncBatch() {
    return this.#active.hasSpoilerSyncBatch();
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

  readPreferenceSyncState() {
    return this.#active.readPreferenceSyncState();
  }

  applyRemotePreference(preference: RemoteMotionPreference) {
    return this.#active.applyRemotePreference(preference);
  }

  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference) {
    return this.#active.markPreferenceSynced(pushedValue, preference);
  }

  applyRemoteSpoilerState(state: RemoteSpoilerState) {
    return this.#active.applyRemoteSpoilerState(state);
  }

  markSpoilerStateSynced(pushedState: SpoilerSyncState["global"], state: RemoteSpoilerState) {
    return this.#active.markSpoilerStateSynced(pushedState, state);
  }

  applyRemoteSpoilerDecisions(decisions: RemoteSpoilerDecision[]) {
    return this.#active.applyRemoteSpoilerDecisions(decisions);
  }

  markSpoilerDecisionSynced(
    pushedDecision: SpoilerSyncState["decisions"][number],
    decision: RemoteSpoilerDecision,
  ) {
    return this.#active.markSpoilerDecisionSynced(pushedDecision, decision);
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

function spoilerDecisionKey(scope: SpoilerRevealScope, targetId: string) {
  return `${scope}\0${targetId}`;
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

function assertIdentifier(value: string, name: string) {
  if (value.length === 0) {
    throw new TypeError(`Invalid ${name}.`);
  }
}
