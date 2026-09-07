import { workspaceIdForBindingSecret } from "@mooligan/workspace";
import * as z from "zod";

import { validateWorkspaceBootstrap, type WorkspaceBootstrap } from "./runtime.ts";

export type RegistryValue = string | number | bigint | null | Uint8Array;
export type RegistryRow = Record<string, RegistryValue>;
export interface RegistryDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: (string | null)[]): RegistryRow | undefined;
    all(...values: (string | null)[]): RegistryRow[];
    run(...values: (string | null)[]): { changes: number | bigint };
  };
  close(): void;
}

const DeviceRowSchema = z.object({ clientId: z.uuidv4() });
const WorkspaceIdSchema = z.uuid();
const WorkspaceRowSchema = z.object({
  accountId: z.string().nullable(),
  bindingSecret: z.uuidv4().nullable(),
  workspaceId: WorkspaceIdSchema,
});
const ListedWorkspaceRowSchema = WorkspaceRowSchema.extend({
  active: z.union([z.literal(0), z.literal(1)]),
});

export type RegisteredWorkspace = z.infer<typeof WorkspaceRowSchema>;

export class WorkspaceRegistry {
  readonly #database: RegistryDatabase;
  readonly #randomUUID: () => string;
  readonly #clientId: string;
  #pendingRestoreWorkspaceId: string | undefined;

  constructor(database: RegistryDatabase, randomUUID: () => string) {
    this.#database = database;
    this.#randomUUID = randomUUID;

    try {
      this.#database.exec(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS device (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          client_id TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS workspaces (
          workspace_id TEXT PRIMARY KEY,
          active INTEGER NOT NULL CHECK (active IN (0, 1)),
          account_id TEXT,
          binding_secret TEXT UNIQUE,
          restore_pending INTEGER NOT NULL CHECK (restore_pending IN (0, 1)),
          CHECK (restore_pending = 0 OR active = 0)
        ) STRICT;

        CREATE UNIQUE INDEX IF NOT EXISTS one_active_workspace
          ON workspaces(active) WHERE active = 1;

        CREATE UNIQUE INDEX IF NOT EXISTS one_workspace_per_account
          ON workspaces(account_id) WHERE account_id IS NOT NULL;
      `);
      this.#database.prepare("DELETE FROM workspaces WHERE restore_pending = 1").run();
      this.#database
        .prepare("INSERT OR IGNORE INTO device (singleton, client_id) VALUES (1, ?)")
        .run(randomUUID());

      this.#clientId = DeviceRowSchema.parse(
        this.#database
          .prepare("SELECT client_id AS clientId FROM device WHERE singleton = 1")
          .get(),
      ).clientId;

      if (this.#activeWorkspaceRow() === undefined) {
        const { bindingSecret, workspaceId } = createWorkspaceIdentity(this.#randomUUID);
        this.#database
          .prepare(
            "INSERT INTO workspaces (workspace_id, active, account_id, binding_secret, restore_pending) VALUES (?, 1, NULL, ?, 0)",
          )
          .run(workspaceId, bindingSecret);
      }
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  bootstrap(): WorkspaceBootstrap {
    const active = this.#activeWorkspaceRow();

    if (!active) {
      throw new Error("The local workspace registry is invalid.");
    }

    return validateWorkspaceBootstrap({
      clientId: this.#clientId,
      workspaceId: active.workspaceId,
    });
  }

  createWorkspace() {
    const { bindingSecret, workspaceId } = createWorkspaceIdentity(this.#randomUUID);
    this.#database
      .prepare(
        "INSERT INTO workspaces (workspace_id, active, account_id, binding_secret, restore_pending) VALUES (?, 0, NULL, ?, 0)",
      )
      .run(workspaceId, bindingSecret);
    return workspaceId;
  }

  beginRestore() {
    if (this.#pendingRestoreWorkspaceId !== undefined) {
      throw new Error("A workspace restore is already in progress.");
    }

    const { bindingSecret, workspaceId } = createWorkspaceIdentity(this.#randomUUID);
    this.#database
      .prepare(
        "INSERT INTO workspaces (workspace_id, active, account_id, binding_secret, restore_pending) VALUES (?, 0, NULL, ?, 1)",
      )
      .run(workspaceId, bindingSecret);
    this.#pendingRestoreWorkspaceId = workspaceId;
    return validateWorkspaceBootstrap({ ...this.bootstrap(), workspaceId });
  }

  activateRestore(workspaceId: string) {
    const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    if (this.#pendingRestoreWorkspaceId !== validatedWorkspaceId) {
      throw new Error("The workspace restore is no longer active.");
    }

    transact(this.#database, () => {
      const result = this.#database
        .prepare(
          "UPDATE workspaces SET restore_pending = 0 WHERE workspace_id = ? AND restore_pending = 1",
        )
        .run(validatedWorkspaceId);
      if (result.changes !== 1) {
        throw new Error("The workspace restore is no longer active.");
      }
      this.#database.prepare("UPDATE workspaces SET active = 0 WHERE active = 1").run();
      this.#database
        .prepare("UPDATE workspaces SET active = 1 WHERE workspace_id = ?")
        .run(validatedWorkspaceId);
    });
    this.#pendingRestoreWorkspaceId = undefined;
  }

  cancelRestore(workspaceId: string) {
    const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    if (this.#pendingRestoreWorkspaceId !== validatedWorkspaceId) {
      return;
    }

    this.removeWorkspace(validatedWorkspaceId);
    this.#pendingRestoreWorkspaceId = undefined;
  }

  activateWorkspace(workspaceId: string) {
    const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);

    transact(this.#database, () => {
      const known = this.#database
        .prepare("SELECT 1 FROM workspaces WHERE workspace_id = ? AND restore_pending = 0")
        .get(validatedWorkspaceId);

      if (!known) {
        throw new Error("The local workspace registry is invalid.");
      }

      this.#database.prepare("UPDATE workspaces SET active = 0 WHERE active = 1").run();
      this.#database
        .prepare("UPDATE workspaces SET active = 1 WHERE workspace_id = ?")
        .run(validatedWorkspaceId);
    });
  }

  removeWorkspace(workspaceId: string) {
    const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const result = this.#database
      .prepare("DELETE FROM workspaces WHERE workspace_id = ? AND active = 0")
      .run(validatedWorkspaceId);

    if (result.changes !== 1) {
      throw new Error("The local workspace registry is invalid.");
    }
  }

  bindWorkspace(workspaceId: string, accountId: string | null) {
    const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const validatedAccountId = z.string().trim().min(1).nullable().parse(accountId);
    const current = this.#workspaceRow(validatedWorkspaceId);
    if (
      current.accountId !== null &&
      validatedAccountId !== null &&
      current.accountId !== validatedAccountId
    ) {
      throw new Error("The workspace is already associated with another account.");
    }
    const result = this.#database
      .prepare("UPDATE workspaces SET account_id = ? WHERE workspace_id = ?")
      .run(validatedAccountId, validatedWorkspaceId);

    if (result.changes !== 1) {
      throw new Error("The local workspace registry is invalid.");
    }
  }

  registerAccountWorkspace(workspaceId: string, accountId: string) {
    const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const validatedAccountId = z.string().trim().min(1).parse(accountId);

    transact(this.#database, () => {
      const accountWorkspace = this.#database
        .prepare(
          "SELECT workspace_id AS workspaceId, account_id AS accountId, binding_secret AS bindingSecret FROM workspaces WHERE account_id = ? AND restore_pending = 0",
        )
        .get(validatedAccountId);
      if (accountWorkspace !== undefined) {
        const existing = WorkspaceRowSchema.parse(accountWorkspace);
        if (existing.workspaceId !== validatedWorkspaceId) {
          throw new Error("The account is already associated with another workspace.");
        }
        return;
      }

      const workspace = this.#database
        .prepare(
          "SELECT workspace_id AS workspaceId, account_id AS accountId, binding_secret AS bindingSecret FROM workspaces WHERE workspace_id = ? AND restore_pending = 0",
        )
        .get(validatedWorkspaceId);
      if (workspace !== undefined) {
        const existing = WorkspaceRowSchema.parse(workspace);
        if (existing.accountId !== null && existing.accountId !== validatedAccountId) {
          throw new Error("The workspace is already associated with another account.");
        }
        this.#database
          .prepare("UPDATE workspaces SET account_id = ? WHERE workspace_id = ?")
          .run(validatedAccountId, validatedWorkspaceId);
        return;
      }

      this.#database
        .prepare(
          "INSERT INTO workspaces (workspace_id, active, account_id, binding_secret, restore_pending) VALUES (?, 0, ?, NULL, 0)",
        )
        .run(validatedWorkspaceId, validatedAccountId);
    });
  }

  workspace(workspaceId: string): RegisteredWorkspace {
    return this.#workspaceRow(workspaceId);
  }

  workspaces() {
    return this.#database
      .prepare(
        "SELECT workspace_id AS workspaceId, active, account_id AS accountId, binding_secret AS bindingSecret FROM workspaces WHERE restore_pending = 0 ORDER BY rowid",
      )
      .all()
      .map((row, index) => {
        const workspace = ListedWorkspaceRowSchema.parse(row);
        return {
          accountAssociation:
            workspace.accountId === null ? ("unbound" as const) : ("account" as const),
          active: workspace.active === 1,
          label: `Local workspace ${index + 1}`,
          workspaceId: workspace.workspaceId,
        };
      });
  }

  accountId(workspaceId: string) {
    return this.#workspaceRow(workspaceId).accountId;
  }

  bindingSecret(workspaceId: string) {
    const bindingSecret = this.#workspaceRow(workspaceId).bindingSecret;
    if (!bindingSecret) {
      throw new Error("The workspace was not created on this device.");
    }
    return bindingSecret;
  }

  close() {
    if (this.#pendingRestoreWorkspaceId !== undefined) {
      this.removeWorkspace(this.#pendingRestoreWorkspaceId);
      this.#pendingRestoreWorkspaceId = undefined;
    }
    this.#database.close();
  }

  #activeWorkspaceRow() {
    const row = this.#database
      .prepare(
        "SELECT workspace_id AS workspaceId, account_id AS accountId, binding_secret AS bindingSecret FROM workspaces WHERE active = 1 AND restore_pending = 0",
      )
      .get();
    return row === undefined ? undefined : WorkspaceRowSchema.parse(row);
  }

  #workspaceRow(workspaceId: string) {
    return WorkspaceRowSchema.parse(
      this.#database
        .prepare(
          "SELECT workspace_id AS workspaceId, account_id AS accountId, binding_secret AS bindingSecret FROM workspaces WHERE workspace_id = ?",
        )
        .get(WorkspaceIdSchema.parse(workspaceId)),
    );
  }
}

function createWorkspaceIdentity(randomUUID: () => string) {
  const bindingSecret = randomUUID();
  return { bindingSecret, workspaceId: workspaceIdForBindingSecret(bindingSecret) };
}

function transact<Result>(database: RegistryDatabase, callback: () => Result): Result {
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
