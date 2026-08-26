import { workspaceIdForBindingSecret } from "@mooligan/workspace";
import * as z from "zod";

export const WorkspaceBindingSecretSchema = z.uuidv4();
export const WorkspaceIdSchema = z.uuid();

export type PersonalWorkspace = {
  createdAt: string;
  workspaceId: string;
};

type PersonalWorkspaceRow = {
  created_at: string;
  id: string;
};

export class WorkspaceBindingError extends Error {
  readonly reason:
    | "account_has_workspace"
    | "workspace_control_required"
    | "workspace_owned_by_another_account";

  constructor(reason: WorkspaceBindingError["reason"]) {
    super(reason);
    this.reason = reason;
  }
}

export async function readPersonalWorkspace(
  database: D1Database,
  userId: string,
): Promise<PersonalWorkspace | null> {
  const row = await database
    .prepare("SELECT id, created_at FROM personal_workspace WHERE user_id = ?")
    .bind(userId)
    .first<PersonalWorkspaceRow>();

  return row ? toPersonalWorkspace(row) : null;
}

export async function createPersonalWorkspace(
  database: D1Database,
  userId: string,
): Promise<PersonalWorkspace> {
  const existing = await readPersonalWorkspace(database, userId);
  if (existing) {
    return existing;
  }

  await database
    .prepare(
      "INSERT INTO personal_workspace (id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    )
    .bind(crypto.randomUUID(), userId, new Date().toISOString())
    .run();

  const workspace = await readPersonalWorkspace(database, userId);
  if (!workspace) {
    throw new Error("The personal workspace could not be created.");
  }

  return workspace;
}

export async function bindPersonalWorkspace(
  database: D1Database,
  userId: string,
  workspaceId: string,
  bindingSecret: string,
): Promise<PersonalWorkspace> {
  const validatedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
  const validatedBindingSecret = WorkspaceBindingSecretSchema.parse(bindingSecret);
  if (workspaceIdForBindingSecret(validatedBindingSecret) !== validatedWorkspaceId) {
    throw new WorkspaceBindingError("workspace_control_required");
  }

  const existing = await readPersonalWorkspace(database, userId);

  if (existing) {
    if (existing.workspaceId === validatedWorkspaceId) {
      return existing;
    }
    throw new WorkspaceBindingError("account_has_workspace");
  }

  await database
    .prepare(
      "INSERT INTO personal_workspace (id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    )
    .bind(validatedWorkspaceId, userId, new Date().toISOString())
    .run();

  const bound = await readPersonalWorkspace(database, userId);
  if (bound) {
    if (bound.workspaceId === validatedWorkspaceId) {
      return bound;
    }
    throw new WorkspaceBindingError("account_has_workspace");
  }

  throw new WorkspaceBindingError("workspace_owned_by_another_account");
}

export async function accountOwnsWorkspace(
  database: D1Database,
  userId: string,
  workspaceId: string,
) {
  const row = await database
    .prepare("SELECT 1 AS owned FROM personal_workspace WHERE id = ? AND user_id = ?")
    .bind(workspaceId, userId)
    .first<{ owned: number }>();

  return row?.owned === 1;
}

function toPersonalWorkspace(row: PersonalWorkspaceRow): PersonalWorkspace {
  return { createdAt: row.created_at, workspaceId: row.id };
}
