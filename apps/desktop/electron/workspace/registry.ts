import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import * as z from "zod";

import { validateWorkspaceBootstrap, type WorkspaceBootstrap } from "../../shared/desktop-api.ts";

const DeviceRowSchema = z.object({ clientId: z.uuidv4() });
const WorkspaceRowSchema = z.object({
  accountId: z.string().nullable(),
  workspaceId: z.uuidv4(),
});

export class WorkspaceRegistry {
  readonly #database: DatabaseSync;
  readonly #clientId: string;
  #pendingRestoreWorkspaceId: string | undefined;

  constructor(userDataRoot: string) {
    mkdirSync(userDataRoot, { recursive: true });
    this.#database = new DatabaseSync(join(userDataRoot, "workspace-registry-v2.sqlite"), {
      timeout: 5_000,
    });

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
          account_id TEXT
        ) STRICT;

        CREATE UNIQUE INDEX IF NOT EXISTS one_active_workspace
          ON workspaces(active) WHERE active = 1;
      `);
      this.#database
        .prepare("INSERT OR IGNORE INTO device (singleton, client_id) VALUES (1, ?)")
        .run(randomUUID());

      this.#clientId = DeviceRowSchema.parse(
        this.#database
          .prepare("SELECT client_id AS clientId FROM device WHERE singleton = 1")
          .get(),
      ).clientId;

      if (this.#activeWorkspaceRow() === undefined) {
        const workspaceId = randomUUID();
        this.#database
          .prepare("INSERT INTO workspaces (workspace_id, active, account_id) VALUES (?, 1, NULL)")
          .run(workspaceId);
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
    const workspaceId = randomUUID();
    this.#database
      .prepare("INSERT INTO workspaces (workspace_id, active, account_id) VALUES (?, 0, NULL)")
      .run(workspaceId);
    return workspaceId;
  }

  beginRestore() {
    if (this.#pendingRestoreWorkspaceId !== undefined) {
      throw new Error("A workspace restore is already in progress.");
    }

    const workspaceId = this.createWorkspace();
    this.#pendingRestoreWorkspaceId = workspaceId;
    return validateWorkspaceBootstrap({ ...this.bootstrap(), workspaceId });
  }

  activateRestore(workspaceId: string) {
    const validatedWorkspaceId = z.uuidv4().parse(workspaceId);
    if (this.#pendingRestoreWorkspaceId !== validatedWorkspaceId) {
      throw new Error("The workspace restore is no longer active.");
    }

    this.activateWorkspace(validatedWorkspaceId);
    this.#pendingRestoreWorkspaceId = undefined;
  }

  cancelRestore(workspaceId: string) {
    const validatedWorkspaceId = z.uuidv4().parse(workspaceId);
    if (this.#pendingRestoreWorkspaceId !== validatedWorkspaceId) {
      return;
    }

    this.removeWorkspace(validatedWorkspaceId);
    this.#pendingRestoreWorkspaceId = undefined;
  }

  activateWorkspace(workspaceId: string) {
    const validatedWorkspaceId = z.uuidv4().parse(workspaceId);

    transact(this.#database, () => {
      const known = this.#database
        .prepare("SELECT 1 FROM workspaces WHERE workspace_id = ?")
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
    const validatedWorkspaceId = z.uuidv4().parse(workspaceId);
    const result = this.#database
      .prepare("DELETE FROM workspaces WHERE workspace_id = ? AND active = 0")
      .run(validatedWorkspaceId);

    if (result.changes !== 1) {
      throw new Error("The local workspace registry is invalid.");
    }
  }

  bindWorkspace(workspaceId: string, accountId: string | null) {
    const validatedWorkspaceId = z.uuidv4().parse(workspaceId);
    const validatedAccountId = z.string().trim().min(1).nullable().parse(accountId);
    const result = this.#database
      .prepare("UPDATE workspaces SET account_id = ? WHERE workspace_id = ?")
      .run(validatedAccountId, validatedWorkspaceId);

    if (result.changes !== 1) {
      throw new Error("The local workspace registry is invalid.");
    }
  }

  accountId(workspaceId: string) {
    const validatedWorkspaceId = z.uuidv4().parse(workspaceId);
    const row = WorkspaceRowSchema.parse(
      this.#database
        .prepare(
          "SELECT workspace_id AS workspaceId, account_id AS accountId FROM workspaces WHERE workspace_id = ?",
        )
        .get(validatedWorkspaceId),
    );
    return row.accountId;
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
        "SELECT workspace_id AS workspaceId, account_id AS accountId FROM workspaces WHERE active = 1",
      )
      .get();
    return row === undefined ? undefined : WorkspaceRowSchema.parse(row);
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
