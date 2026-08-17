import * as z from "zod";
import type { JSONType } from "zod";

import type { MotionPreference, Preferences } from "./preferences.ts";
import {
  RemoteMotionPreferenceSchema,
  type PreferenceSyncState,
  type RemoteMotionPreference,
} from "./store.ts";

export type PreferenceSyncStatus = "local-only" | "syncing" | "synced" | "pending" | "paused";

export type PreferenceSyncSnapshot = {
  status: PreferenceSyncStatus;
};

export interface PreferenceSyncAuth {
  request(path: `/sync/${string}`, init?: RequestInit): Promise<Response>;
}

export interface PreferenceSyncWorkspace {
  readonly remoteWorkspaceId: string | null;
  readonly workspaceId: string;
  applyRemotePreference(preference: RemoteMotionPreference): "applied" | "conflict";
  bindActiveWorkspace(userId: string, remoteWorkspaceId: string): void;
  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference): boolean;
  readPreferences(): Preferences;
  readPreferenceSyncState(): PreferenceSyncState;
  selectForUser(userId: string): void;
}

export class PreferenceSyncCoordinator {
  readonly #auth: PreferenceSyncAuth;
  readonly #workspace: PreferenceSyncWorkspace;
  #operations = Promise.resolve();
  #status: PreferenceSyncStatus = "local-only";
  #userId: string | null = null;

  constructor(auth: PreferenceSyncAuth, workspace: PreferenceSyncWorkspace) {
    this.#auth = auth;
    this.#workspace = workspace;
  }

  connect(userId: string): Promise<PreferenceSyncSnapshot> {
    this.#status = "syncing";
    return this.#serialize(async () => {
      this.#workspace.selectForUser(userId);
      this.#userId = userId;
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

  pause(): PreferenceSyncSnapshot {
    this.#status = this.#workspace.readPreferenceSyncState().motion.pending ? "pending" : "paused";
    return this.snapshot();
  }

  preferenceChanged(): Promise<PreferenceSyncSnapshot> {
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
        this.#workspace.remoteWorkspaceId ? this.#push(false) : this.#pullAndPush(),
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

      this.#status = this.#workspace.readPreferenceSyncState().motion.pending
        ? "pending"
        : "paused";
      return this.snapshot();
    }
  }

  async #pullAndPush(): Promise<PreferenceSyncSnapshot> {
    this.#status = "syncing";
    let remote: RemoteMotionPreference | undefined;

    if (this.#workspace.remoteWorkspaceId) {
      remote = (await this.#getPreferences()).motion;
    } else {
      const local = this.#workspace.readPreferences();
      const response = await this.#bind(this.#workspace.workspaceId, local.motion);

      const userId = this.#userId;
      if (!userId) throw new SyncUnavailableError();
      this.#workspace.bindActiveWorkspace(userId, response.workspaceId);
      remote = response.preferences.motion;
    }

    if (remote) {
      this.#workspace.applyRemotePreference(remote);
    }

    return await this.#push(remote === undefined);
  }

  async #push(force: boolean): Promise<PreferenceSyncSnapshot> {
    const pending = this.#workspace.readPreferenceSyncState().motion.pending;

    if (!pending && !force) {
      this.#status = "synced";
      return this.snapshot();
    }

    this.#status = "syncing";
    const pushedValue = this.#workspace.readPreferences().motion;
    const remote = (await this.#updatePreference(pushedValue)).motion;

    if (!remote) {
      throw new SyncUnavailableError();
    }

    const unchanged = this.#workspace.markPreferenceSynced(pushedValue, remote);
    this.#status = unchanged ? "synced" : "pending";
    return this.snapshot();
  }

  async #bind(localWorkspaceId: string, motion: MotionPreference) {
    const value = await this.#request("/sync/workspace/bind", {
      body: JSON.stringify({ localWorkspaceId, preferences: { motion } }),
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

  async #request(path: `/sync/${string}`, init?: RequestInit): Promise<JSONType> {
    let response: Response;

    try {
      response = await this.#auth.request(path, init);
    } catch {
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

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
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
const BindResponseSchema = PreferencesResponseSchema.extend({ workspaceId: z.uuid() });
type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>;

function parseBindResponse(value: JSONType): PreferencesResponse & { workspaceId: string } {
  return BindResponseSchema.parse(value);
}

function parsePreferencesResponse(value: JSONType): PreferencesResponse {
  return PreferencesResponseSchema.parse(value);
}
