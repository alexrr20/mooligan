import * as z from "zod";

import {
  validateWorkspaceRuntime,
  type AuthSnapshot,
  type WorkspaceRuntime,
  type WorkspaceSyncIssue,
  type WorkspaceSyncSession,
} from "../../shared/desktop-api.ts";
import type { AccountWorkspaceApiPath } from "../auth/service.ts";
import type { WorkspaceRegistry } from "./registry.ts";

const PersonalWorkspaceSchema = z.strictObject({
  createdAt: z.string().min(1).max(64),
  workspaceId: z.uuid(),
});
const SyncCredentialResponseSchema = z.strictObject({
  credential: z.string().min(1).max(8_192).regex(/^\S+$/u),
  expiresAt: z.number().int().positive(),
});
const ErrorSchema = z.instanceof(Error).catch(new Error("The Account Workspace request failed."));

type RuntimeChanged = (workspaceChanged: boolean) => Promise<void> | void;

export interface AccountWorkspaceAuth {
  requestAccountWorkspace(path: AccountWorkspaceApiPath, init: RequestInit): Promise<Response>;
  snapshot(): AuthSnapshot;
}

export class AccountWorkspace {
  readonly #auth: AccountWorkspaceAuth;
  readonly #now: () => number;
  readonly #registry: WorkspaceRegistry;
  readonly #runtimeChanged: RuntimeChanged;
  #operations = Promise.resolve();
  #sync: WorkspaceSyncSession | null = null;
  #syncIssue: WorkspaceSyncIssue | null = null;

  constructor(
    auth: AccountWorkspaceAuth,
    registry: WorkspaceRegistry,
    runtimeChanged: RuntimeChanged = () => undefined,
    now: () => number = Date.now,
  ) {
    this.#auth = auth;
    this.#registry = registry;
    this.#runtimeChanged = runtimeChanged;
    this.#now = now;
  }

  authChanged(snapshot: AuthSnapshot) {
    return this.#serialize(async () => {
      this.#sync = null;

      if (snapshot.status !== "signed-in" || snapshot.user === null) {
        this.#syncIssue = snapshot.status === "session-unavailable" ? "session-unavailable" : null;
        const workspaceChanged =
          snapshot.user === null
            ? false
            : this.#activateWorkspaceForAccount(snapshot.user.id).changed;
        await this.#runtimeChanged(workspaceChanged);
        return;
      }

      this.#syncIssue = null;
      const transition = this.#activateWorkspaceForAccount(snapshot.user.id);
      if (transition.changed) {
        await this.#runtimeChanged(true);
      }

      const connectingWorkspaceId = this.#registry.bootstrap().workspaceId;
      await this.#connectAccount(snapshot.user.id, transition.disposableWorkspaceId);
      await this.#runtimeChanged(connectingWorkspaceId !== this.#registry.bootstrap().workspaceId);
    });
  }

  refreshSync() {
    return this.#serialize(async () => {
      const snapshot = this.#auth.snapshot();
      const activeWorkspaceId = this.#registry.bootstrap().workspaceId;

      if (
        snapshot.status !== "signed-in" ||
        snapshot.user === null ||
        this.#registry.accountId(activeWorkspaceId) !== snapshot.user.id
      ) {
        this.#sync = null;
        this.#syncIssue = snapshot.status === "session-unavailable" ? "session-unavailable" : null;
      } else {
        await this.#issueCredential(activeWorkspaceId);
      }

      await this.#runtimeChanged(false);
      return this.runtime();
    });
  }

  selectWorkspace(workspaceId: string) {
    return this.#serialize(async () => {
      const previousWorkspaceId = this.#registry.bootstrap().workspaceId;
      const workspace = this.#registry.workspace(workspaceId);
      const snapshot = this.#auth.snapshot();
      if (
        snapshot.user !== null &&
        workspace.accountId !== null &&
        workspace.accountId !== snapshot.user.id
      ) {
        throw new Error("The Workspace is associated with another Account.");
      }

      this.#registry.activateWorkspace(workspace.workspaceId);
      this.#sync = null;
      this.#syncIssue = null;

      if (
        snapshot.status === "signed-in" &&
        snapshot.user !== null &&
        workspace.accountId === snapshot.user.id
      ) {
        await this.#issueCredential(workspace.workspaceId);
      }

      await this.#runtimeChanged(previousWorkspaceId !== workspace.workspaceId);
    });
  }

  workspaceActivated() {
    return this.#serialize(async () => {
      this.#sync = null;
      this.#syncIssue = null;
      await this.#runtimeChanged(true);
    });
  }

  runtime(): WorkspaceRuntime {
    const bootstrap = this.#registry.bootstrap();
    const sync = this.#sync && this.#sync.expiresAt * 1_000 > this.#now() ? this.#sync : null;

    return validateWorkspaceRuntime({
      ...bootstrap,
      sync,
      syncIssue: sync ? null : this.#syncIssue,
      workspaces: this.#registry.workspaces(),
    });
  }

  #activateWorkspaceForAccount(accountId: string) {
    const activeWorkspace = this.#registry.workspace(this.#registry.bootstrap().workspaceId);
    if (activeWorkspace.accountId === null || activeWorkspace.accountId === accountId) {
      return { changed: false, disposableWorkspaceId: null };
    }

    const retainedWorkspace = this.#registry
      .workspaces()
      .find(({ workspaceId }) => this.#registry.accountId(workspaceId) === accountId);
    const targetWorkspaceId = retainedWorkspace?.workspaceId ?? this.#registry.createWorkspace();
    const disposableWorkspaceId = retainedWorkspace ? null : targetWorkspaceId;
    this.#registry.activateWorkspace(targetWorkspaceId);
    return { changed: true, disposableWorkspaceId };
  }

  async #connectAccount(accountId: string, disposableWorkspaceId: string | null) {
    this.#syncIssue = null;

    try {
      const remote = await this.#readRemoteWorkspace();
      const workspace = remote ?? (await this.#bindLocalWorkspace(accountId));
      this.#registry.registerAccountWorkspace(workspace.workspaceId, accountId);
      this.#registry.activateWorkspace(workspace.workspaceId);
      if (disposableWorkspaceId && disposableWorkspaceId !== workspace.workspaceId) {
        this.#registry.removeWorkspace(disposableWorkspaceId);
      }
      await this.#issueCredential(workspace.workspaceId);
    } catch (error) {
      this.#sync = null;
      this.#syncIssue = syncIssueForError(ErrorSchema.parse(error));
    }
  }

  async #readRemoteWorkspace() {
    const response = await this.#auth.requestAccountWorkspace("/api/workspace", {
      method: "GET",
    });
    if (response.status === 404) {
      return null;
    }
    await requireSuccessfulResponse(response);
    return PersonalWorkspaceSchema.parse(await response.json());
  }

  async #bindLocalWorkspace(accountId: string) {
    let workspace = this.#registry.workspace(this.#registry.bootstrap().workspaceId);
    let disposableWorkspaceId: string | null = null;
    if (workspace.accountId !== null || workspace.bindingSecret === null) {
      const workspaceId = this.#registry.createWorkspace();
      disposableWorkspaceId = workspaceId;
      workspace = this.#registry.workspace(workspaceId);
    }

    try {
      const response = await this.#auth.requestAccountWorkspace("/api/workspace/bind", {
        body: JSON.stringify({
          bindingSecret: workspace.bindingSecret,
          workspaceId: workspace.workspaceId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (response.status === 409) {
        const existing = await this.#readRemoteWorkspace();
        if (existing) {
          if (disposableWorkspaceId) this.#registry.removeWorkspace(disposableWorkspaceId);
          return existing;
        }
      }

      await requireSuccessfulResponse(response);
      const bound = PersonalWorkspaceSchema.parse(await response.json());
      if (bound.workspaceId !== workspace.workspaceId) {
        throw new Error("The Account bound an unexpected Workspace.");
      }
      this.#registry.bindWorkspace(bound.workspaceId, accountId);
      return bound;
    } catch (error) {
      if (disposableWorkspaceId) this.#registry.removeWorkspace(disposableWorkspaceId);
      throw error;
    }
  }

  async #issueCredential(workspaceId: string) {
    try {
      const response = await this.#auth.requestAccountWorkspace("/api/workspace/sync-credential", {
        method: "POST",
      });
      await requireSuccessfulResponse(response);
      const credential = SyncCredentialResponseSchema.parse(await response.json());
      this.#sync = {
        accountWorkspaceId: workspaceId,
        credential: credential.credential,
        expiresAt: credential.expiresAt,
      };
      this.#syncIssue = null;
    } catch (error) {
      this.#sync = null;
      this.#syncIssue =
        error instanceof AccountWorkspaceRequestError && error.sessionUnavailable
          ? "session-unavailable"
          : "account-service-unavailable";
    }
  }

  #serialize<Result>(operation: () => Promise<Result>) {
    const result = this.#operations.then(operation, operation);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

class AccountWorkspaceRequestError extends Error {
  readonly sessionUnavailable: boolean;

  constructor(sessionUnavailable: boolean) {
    super("The account workspace service is unavailable.");
    this.name = "AccountWorkspaceRequestError";
    this.sessionUnavailable = sessionUnavailable;
  }
}

async function requireSuccessfulResponse(response: Response) {
  if (!response.ok) {
    throw new AccountWorkspaceRequestError(response.status === 401 || response.status === 403);
  }
}

function syncIssueForError(error: Error) {
  if (error instanceof AccountWorkspaceRequestError) {
    return error.sessionUnavailable
      ? ("session-unavailable" as const)
      : ("account-service-unavailable" as const);
  }
  return error.name === "AuthRequestError"
    ? ("account-service-unavailable" as const)
    : ("workspace-unavailable" as const);
}
