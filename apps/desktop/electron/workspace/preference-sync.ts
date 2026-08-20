import * as z from "zod";
import type { JSONType } from "zod";

import type { MotionPreference, Preferences } from "./preferences.ts";
import {
  RemoteMotionPreferenceSchema,
  RemoteSpoilerDecisionSchema,
  RemoteSpoilerStateSchema,
  type PreferenceSyncState,
  type RemoteMotionPreference,
  type RemoteSpoilerDecision,
  type RemoteSpoilerState,
  type SpoilerSyncBatch,
  type SpoilerSyncState,
} from "./store.ts";

export const spoilerSyncBatchSize = 25;
const maxSpoilerPushBatchesPerAttempt = 100;
const maxSpoilerSyncPagesPerAttempt = 4_000;

export type PreferenceSyncStatus = "local-only" | "syncing" | "synced" | "pending" | "paused";

export type PreferenceSyncSnapshot = {
  status: PreferenceSyncStatus;
};

export interface PreferenceSyncAuth {
  request(userId: string, path: `/sync/${string}`, init?: RequestInit): Promise<Response>;
}

export interface PreferenceSyncWorkspace {
  readonly remoteWorkspaceId: string | null;
  readonly workspaceId: string;
  applyRemotePreference(preference: RemoteMotionPreference): "applied" | "conflict";
  applyRemoteSpoilerDecisions(decisions: RemoteSpoilerDecision[]): void;
  applyRemoteSpoilerState(state: RemoteSpoilerState): "applied" | "pending";
  bindActiveWorkspace(userId: string, remoteWorkspaceId: string): void;
  completeSpoilerSyncBatch(operationId: string): void;
  hasSpoilerSyncBatch(): boolean;
  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference): boolean;
  markSpoilerDecisionSynced(
    pushedDecision: SpoilerSyncState["decisions"][number],
    decision: RemoteSpoilerDecision,
  ): boolean;
  markSpoilerStateSynced(
    pushedState: SpoilerSyncState["global"],
    state: RemoteSpoilerState,
  ): boolean;
  prepareSpoilerSyncBatch(limit: number): SpoilerSyncBatch | null;
  readPreferences(): Preferences;
  readPreferenceSyncState(): PreferenceSyncState;
  readSpoilerSyncState(): SpoilerSyncState;
  selectForUser(userId: string): void;
}

export interface PreferenceSyncCoordinatorOptions {
  onSpoilersApplied?: () => void;
  onWorkspaceSelected?: (workspaceId: string) => void;
}

export class PreferenceSyncCoordinator {
  readonly #auth: PreferenceSyncAuth;
  readonly #onSpoilersApplied: (() => void) | undefined;
  readonly #onWorkspaceSelected: ((workspaceId: string) => void) | undefined;
  readonly #workspace: PreferenceSyncWorkspace;
  #operations = Promise.resolve();
  #status: PreferenceSyncStatus = "local-only";
  #userId: string | null = null;

  constructor(
    auth: PreferenceSyncAuth,
    workspace: PreferenceSyncWorkspace,
    options: PreferenceSyncCoordinatorOptions = {},
  ) {
    this.#auth = auth;
    this.#onSpoilersApplied = options.onSpoilersApplied;
    this.#onWorkspaceSelected = options.onWorkspaceSelected;
    this.#workspace = workspace;
  }

  connect(userId: string): Promise<PreferenceSyncSnapshot> {
    this.#status = "syncing";
    return this.#serialize(async () => {
      this.#selectForUser(userId);
      return await this.#attempt(() => this.#pullAndPush());
    });
  }

  disconnect(): Promise<PreferenceSyncSnapshot> {
    return this.#serialize(() => {
      this.#userId = null;
      this.#status = "local-only";
      return Promise.resolve(this.snapshot());
    });
  }

  pause(userId: string | null): Promise<PreferenceSyncSnapshot> {
    return this.#serialize(() => {
      if (userId) {
        this.#selectForUser(userId);
      } else {
        this.#userId = null;
      }
      this.#status = this.#hasPendingChanges() ? "pending" : "paused";
      return Promise.resolve(this.snapshot());
    });
  }

  preferenceChanged(): Promise<PreferenceSyncSnapshot> {
    return this.workspaceChanged();
  }

  workspaceChanged(): Promise<PreferenceSyncSnapshot> {
    const workspaceId = this.#workspace.workspaceId;

    if (this.#userId) {
      this.#status = "pending";
    }

    return this.#serialize(async () => {
      if (!this.#userId) {
        this.#status = "local-only";
        return this.snapshot();
      }

      if (this.#workspace.workspaceId !== workspaceId) {
        return this.snapshot();
      }

      return await this.#attempt(() =>
        this.#workspace.remoteWorkspaceId && !this.#workspace.hasSpoilerSyncBatch()
          ? this.#push(false)
          : this.#pullAndPush(),
      );
    });
  }

  sync(): Promise<PreferenceSyncSnapshot> {
    if (this.#userId) {
      this.#status = "syncing";
    }

    return this.#serialize(async () => {
      if (!this.#userId) {
        this.#status = "local-only";
        return this.snapshot();
      }

      return await this.#attempt(() => this.#pullAndPush());
    });
  }

  snapshot(): PreferenceSyncSnapshot {
    return { status: this.#status };
  }

  async #attempt(operation: () => Promise<PreferenceSyncSnapshot>) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof SyncUnavailableError)) {
        throw error;
      }

      this.#status = this.#hasPendingChanges() ? "pending" : "paused";
      return this.snapshot();
    }
  }

  async #pullAndPush(): Promise<PreferenceSyncSnapshot> {
    this.#status = "syncing";
    let remoteMotion: RemoteMotionPreference | undefined;
    let remoteSpoilerState: RemoteSpoilerState;
    let remoteSpoilerDecisions: RemoteSpoilerDecision[];
    let shouldApplyRemoteSpoilerState = true;

    if (this.#workspace.remoteWorkspaceId) {
      if (this.#workspace.hasSpoilerSyncBatch()) {
        for (let batch = 0; batch < maxSpoilerPushBatchesPerAttempt; batch += 1) {
          if (!(await this.#pushSpoilers())) break;
        }
      }
      remoteMotion = (await this.#getPreferences()).motion;
      const spoilers = await this.#getSpoilers();
      remoteSpoilerState = spoilers.state;
      remoteSpoilerDecisions = spoilers.decisions;
    } else {
      const localPreferences = this.#workspace.readPreferences();
      const localSpoilers = this.#workspace.readSpoilerSyncState();
      const response = await this.#bind(
        this.#workspace.workspaceId,
        localPreferences.motion,
        localSpoilers.global,
      );

      const userId = this.#userId;
      if (!userId) throw new SyncUnavailableError();

      if (response.spoilerStateAccepted) {
        this.#workspace.markSpoilerStateSynced(
          {
            ...localSpoilers.global,
            policy: response.spoilerState.policy,
            remoteVersion: null,
            resetGeneration: response.spoilerState.resetGeneration,
          },
          response.spoilerState,
        );
      }
      this.#workspace.bindActiveWorkspace(userId, response.workspaceId);
      remoteMotion = response.preferences.motion;

      const spoilers = await this.#getSpoilers();
      remoteSpoilerState = spoilers.state;
      remoteSpoilerDecisions = spoilers.decisions;
      shouldApplyRemoteSpoilerState =
        !response.spoilerStateAccepted ||
        !sameRemoteSpoilerState(response.spoilerState, remoteSpoilerState);
    }

    if (remoteMotion) {
      this.#workspace.applyRemotePreference(remoteMotion);
    }
    if (shouldApplyRemoteSpoilerState) {
      this.#workspace.applyRemoteSpoilerState(remoteSpoilerState);
    }
    this.#workspace.applyRemoteSpoilerDecisions(remoteSpoilerDecisions);
    this.#onSpoilersApplied?.();

    return await this.#push(remoteMotion === undefined);
  }

  async #push(forceMotion: boolean): Promise<PreferenceSyncSnapshot> {
    const motionPending = this.#workspace.readPreferenceSyncState().motion.pending;

    if (motionPending || forceMotion) {
      this.#status = "syncing";
      const pushedValue = this.#workspace.readPreferences().motion;
      const remote = (await this.#updatePreference(pushedValue)).motion;

      if (!remote) {
        throw new SyncUnavailableError();
      }

      this.#workspace.markPreferenceSynced(pushedValue, remote);
    }

    for (let batch = 0; batch < maxSpoilerPushBatchesPerAttempt; batch += 1) {
      if (!(await this.#pushSpoilers())) break;
    }
    this.#status = this.#hasPendingChanges() ? "pending" : "synced";
    return this.snapshot();
  }

  async #pushSpoilers() {
    const batch = this.#workspace.prepareSpoilerSyncBatch(spoilerSyncBatchSize);
    if (!batch) {
      return false;
    }

    this.#status = "syncing";
    const response = await this.#updateSpoilers(batch);
    if (response.operationId !== batch.operationId) {
      throw new SyncUnavailableError();
    }
    const expectedDecisionKeys = new Set(
      batch.decisions.map(({ decision }) => spoilerDecisionKey(decision.scope, decision.targetId)),
    );

    if (
      response.decisions.length !== expectedDecisionKeys.size ||
      response.decisions.some(
        ({ scope, targetId }) => !expectedDecisionKeys.has(spoilerDecisionKey(scope, targetId)),
      )
    ) {
      throw new SyncUnavailableError();
    }

    if (batch.global) {
      this.#workspace.markSpoilerStateSynced(batch.global, response.state);
    } else {
      this.#workspace.applyRemoteSpoilerState(response.state);
    }

    const remoteByTarget = new Map(
      response.decisions.map((decision) => [
        spoilerDecisionKey(decision.scope, decision.targetId),
        decision,
      ]),
    );

    for (const pushedDecision of batch.decisions) {
      const { decision } = pushedDecision;
      const remote = remoteByTarget.get(spoilerDecisionKey(decision.scope, decision.targetId));
      if (!remote) throw new SyncUnavailableError();
      this.#workspace.markSpoilerDecisionSynced(pushedDecision, remote);
    }
    this.#workspace.completeSpoilerSyncBatch(batch.operationId);
    this.#onSpoilersApplied?.();

    return true;
  }

  async #bind(
    localWorkspaceId: string,
    motion: MotionPreference,
    spoilers: SpoilerSyncState["global"],
  ) {
    const value = await this.#request("/sync/workspace/bind", {
      body: JSON.stringify({
        localWorkspaceId,
        preferences: { motion },
        spoilerState: {
          policy: spoilers.policy,
          resetGeneration: spoilers.resetGeneration,
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    try {
      return parseBindResponse(value);
    } catch {
      throw new SyncUnavailableError();
    }
  }

  async #getPreferences() {
    const value = await this.#request("/sync/preferences");

    try {
      return parsePreferencesResponse(value).preferences;
    } catch {
      throw new SyncUnavailableError();
    }
  }

  async #getSpoilers() {
    const decisions: RemoteSpoilerDecision[] = [];
    const seenDecisions = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    let snapshotVersion: number | undefined;
    let state: RemoteSpoilerState | undefined;

    do {
      if (pages >= maxSpoilerSyncPagesPerAttempt) {
        throw new SyncUnavailableError();
      }
      pages += 1;
      const path: `/sync/${string}` = cursor
        ? `/sync/spoilers?cursor=${encodeURIComponent(cursor)}`
        : "/sync/spoilers";
      const value = await this.#request(path);
      let page: SpoilerPageResponse;

      try {
        page = parseSpoilerPageResponse(value);
      } catch {
        throw new SyncUnavailableError();
      }

      if (
        state &&
        (!sameRemoteSpoilerState(state, page.state) || snapshotVersion !== page.snapshotVersion)
      ) {
        throw new SyncUnavailableError();
      }
      state ??= page.state;
      snapshotVersion ??= page.snapshotVersion;
      for (const decision of page.decisions) {
        const key = spoilerDecisionKey(decision.scope, decision.targetId);
        if (seenDecisions.has(key)) throw new SyncUnavailableError();
        seenDecisions.add(key);
        decisions.push(decision);
      }
      cursor = page.nextCursor;

      if (cursor && seenCursors.has(cursor)) {
        throw new SyncUnavailableError();
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    if (!state) throw new SyncUnavailableError();
    return { decisions, state };
  }

  async #updatePreference(motion: MotionPreference) {
    const value = await this.#request("/sync/preferences", {
      body: JSON.stringify({ updates: [{ key: "motion", value: motion }] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    try {
      return parsePreferencesResponse(value).preferences;
    } catch {
      throw new SyncUnavailableError();
    }
  }

  async #updateSpoilers(batch: SpoilerSyncBatch) {
    const state = batch.global
      ? {
          baseVersion: batch.global.remoteVersion,
          policy: batch.global.policy,
          resetGeneration: batch.global.resetGeneration,
        }
      : undefined;
    const decisions = batch.decisions.map(({ decision, remoteVersion }) => ({
      baseVersion: remoteVersion,
      generation: decision.generation,
      scope: decision.scope,
      state: decision.state,
      targetId: decision.targetId,
    }));
    const payload = state
      ? {
          decisions,
          localWorkspaceId: this.#workspace.workspaceId,
          operationId: batch.operationId,
          state,
        }
      : {
          decisions,
          localWorkspaceId: this.#workspace.workspaceId,
          operationId: batch.operationId,
        };
    const value = await this.#request("/sync/spoilers", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    try {
      return parseSpoilerUpdateResponse(value);
    } catch {
      throw new SyncUnavailableError();
    }
  }

  async #request(path: `/sync/${string}`, init?: RequestInit): Promise<JSONType> {
    const userId = this.#userId;
    if (!userId) {
      throw new SyncUnavailableError();
    }
    let response: Response;

    try {
      response = await this.#auth.request(userId, path, init);
    } catch {
      throw new SyncUnavailableError();
    }

    if (this.#userId !== userId) {
      throw new SyncUnavailableError();
    }

    if (!response.ok) {
      throw new SyncUnavailableError();
    }

    try {
      return z.json().parse(await response.json());
    } catch {
      throw new SyncUnavailableError();
    }
  }

  #hasPendingChanges() {
    const spoilers = this.#workspace.readSpoilerSyncState();
    return (
      this.#workspace.readPreferenceSyncState().motion.pending ||
      this.#workspace.hasSpoilerSyncBatch() ||
      spoilers.global.pending ||
      spoilers.decisions.some(({ pending }) => pending)
    );
  }

  #selectForUser(userId: string) {
    this.#workspace.selectForUser(userId);
    this.#userId = userId;
    this.#onWorkspaceSelected?.(this.#workspace.workspaceId);
  }

  #serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operations.then(operation, operation);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

class SyncUnavailableError extends Error {}

const RemotePreferencesSchema = z.strictObject({
  motion: RemoteMotionPreferenceSchema.optional(),
});
const PreferencesResponseSchema = z.strictObject({ preferences: RemotePreferencesSchema });
const BindResponseSchema = PreferencesResponseSchema.extend({
  spoilerState: RemoteSpoilerStateSchema,
  spoilerStateAccepted: z.boolean(),
  workspaceId: z.uuid(),
});
const RemoteSpoilerDecisionBatchSchema = z
  .array(RemoteSpoilerDecisionSchema)
  .max(spoilerSyncBatchSize)
  .refine(hasUniqueSpoilerDecisionTargets, {
    message: "Spoiler decision targets must be unique.",
  });
const SpoilerPageResponseSchema = z
  .strictObject({
    decisions: RemoteSpoilerDecisionBatchSchema,
    nextCursor: z.string().min(1).max(512).nullable(),
    snapshotVersion: z.number().int().positive(),
    state: RemoteSpoilerStateSchema,
  })
  .refine(hasKnownSpoilerDecisionGenerations, {
    message: "Spoiler decision generations must not exceed the global reset generation.",
  });
const SpoilerUpdateResponseSchema = z
  .strictObject({
    decisions: RemoteSpoilerDecisionBatchSchema,
    operationId: z.uuid(),
    snapshotVersion: z.number().int().positive(),
    state: RemoteSpoilerStateSchema,
  })
  .refine(hasKnownSpoilerDecisionGenerations, {
    message: "Spoiler decision generations must not exceed the global reset generation.",
  });
type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>;
type SpoilerPageResponse = z.infer<typeof SpoilerPageResponseSchema>;

function parseBindResponse(value: JSONType): PreferencesResponse & {
  spoilerState: RemoteSpoilerState;
  spoilerStateAccepted: boolean;
  workspaceId: string;
} {
  return BindResponseSchema.parse(value);
}

function parsePreferencesResponse(value: JSONType): PreferencesResponse {
  return PreferencesResponseSchema.parse(value);
}

function parseSpoilerPageResponse(value: JSONType): SpoilerPageResponse {
  return SpoilerPageResponseSchema.parse(value);
}

function parseSpoilerUpdateResponse(value: JSONType) {
  return SpoilerUpdateResponseSchema.parse(value);
}

function spoilerDecisionKey(scope: RemoteSpoilerDecision["scope"], targetId: string) {
  return `${scope}\0${targetId}`;
}

function hasUniqueSpoilerDecisionTargets(decisions: RemoteSpoilerDecision[]) {
  return (
    new Set(decisions.map(({ scope, targetId }) => spoilerDecisionKey(scope, targetId))).size ===
    decisions.length
  );
}

function hasKnownSpoilerDecisionGenerations(response: {
  decisions: RemoteSpoilerDecision[];
  state: RemoteSpoilerState;
}) {
  return response.decisions.every(({ generation }) => generation <= response.state.resetGeneration);
}

function sameRemoteSpoilerState(left: RemoteSpoilerState, right: RemoteSpoilerState) {
  return (
    left.policy === right.policy &&
    left.resetGeneration === right.resetGeneration &&
    left.updatedAt === right.updatedAt &&
    left.version === right.version
  );
}
