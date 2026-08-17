import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { v7 as uuidv7 } from "uuid";
import * as z from "zod";
import type { JSONType } from "zod";

import { createAuth } from "./auth.js";

const MotionPreferenceSchema = z.enum(["full", "reduced", "system"]);
type MotionPreference = z.infer<typeof MotionPreferenceSchema>;

type PreferenceEntry = {
  updatedAt: string;
  value: MotionPreference;
  version: number;
};

type PreferenceRow = {
  key: "motion";
  updated_at: string;
  value: MotionPreference;
  version: number;
};

type WorkspaceRow = {
  id: string;
  owner_user_id: string;
};

const MotionPreferencesSchema = z.strictObject({ motion: MotionPreferenceSchema });
const BindRequestSchema = z.strictObject({
  localWorkspaceId: z.uuid(),
  preferences: MotionPreferencesSchema.optional(),
});
const UpdateRequestSchema = z.strictObject({
  updates: z.tuple([z.strictObject({ key: z.literal("motion"), value: MotionPreferenceSchema })]),
});

const syncApi = new Hono<{
  Bindings: Env;
  Variables: { userId: string };
}>();

syncApi.use(
  "*",
  bodyLimit({
    maxSize: 16 * 1_024,
    onError: (context) => context.json({ error: "payload_too_large" as const }, 413),
  }),
);

syncApi.use("*", async (context, next) => {
  const session = await createAuth(context.env).api.getSession({
    headers: context.req.raw.headers,
  });

  if (!session) {
    return context.json({ error: "unauthorized" as const }, 401);
  }

  if (context.req.method === "POST") {
    const contentType = context.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase();

    if (contentType !== "application/json") {
      return context.json({ error: "unsupported_media_type" as const }, 415);
    }
    if (
      context.req.header("origin") !== undefined ||
      context.req.header("electron-origin") !== "com.mooligan.app:/"
    ) {
      return context.json({ error: "forbidden" as const }, 403);
    }
  }

  context.set("userId", session.user.id);
  await next();
});

syncApi.post("/workspace/bind", async (context) => {
  const request = parseBindRequest(await readJson(context.req.raw));

  if (!request) {
    return context.json({ error: "invalid_request" as const }, 400);
  }

  const userId = context.get("userId");
  const localWorkspaceId = request.localWorkspaceId.toLowerCase();
  let workspace = await findBinding(context.env.DB, localWorkspaceId);

  if (workspace && workspace.owner_user_id !== userId) {
    return context.json({ error: "workspace_bound_to_another_user" as const }, 409);
  }

  if (!workspace) {
    workspace = await findOrCreateWorkspace(context.env.DB, userId);
    await context.env.DB.prepare(
      `INSERT INTO sync_workspace_bindings
       (local_workspace_id, workspace_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(local_workspace_id) DO NOTHING`,
    )
      .bind(localWorkspaceId, workspace.id, new Date().toISOString())
      .run();

    workspace = await findBinding(context.env.DB, localWorkspaceId);

    if (!workspace || workspace.owner_user_id !== userId) {
      return context.json({ error: "workspace_bound_to_another_user" as const }, 409);
    }
  }

  if (request.preferences) {
    await context.env.DB.prepare(
      `INSERT INTO workspace_preferences
       (workspace_id, key, value, version, updated_at)
       VALUES (?, 'motion', ?, 1, ?)
       ON CONFLICT(workspace_id, key) DO NOTHING`,
    )
      .bind(workspace.id, request.preferences.motion, new Date().toISOString())
      .run();
  }

  return context.json({
    preferences: await readPreferences(context.env.DB, workspace.id),
    workspaceId: workspace.id,
  });
});

syncApi.get("/preferences", async (context) => {
  const workspace = await findWorkspace(context.env.DB, context.get("userId"));

  if (!workspace) {
    return context.json({ error: "workspace_not_bound" as const }, 404);
  }

  return context.json({ preferences: await readPreferences(context.env.DB, workspace.id) });
});

syncApi.post("/preferences", async (context) => {
  const request = parseUpdateRequest(await readJson(context.req.raw));

  if (!request) {
    return context.json({ error: "invalid_request" as const }, 400);
  }

  const workspace = await findWorkspace(context.env.DB, context.get("userId"));

  if (!workspace) {
    return context.json({ error: "workspace_not_bound" as const }, 404);
  }

  const updatedAt = new Date().toISOString();
  const row = await context.env.DB.prepare(
    `INSERT INTO workspace_preferences
     (workspace_id, key, value, version, updated_at)
     VALUES (?, 'motion', ?, 1, ?)
     ON CONFLICT(workspace_id, key) DO UPDATE SET
       value = excluded.value,
       version = workspace_preferences.version + 1,
       updated_at = excluded.updated_at
     RETURNING key, value, version, updated_at`,
  )
    .bind(workspace.id, request.updates[0].value, updatedAt)
    .first<PreferenceRow>();

  if (!row) {
    throw new Error("D1 did not return the updated preference.");
  }

  return context.json({ preferences: toPreferences([row]) });
});

async function findBinding(database: D1Database, localWorkspaceId: string) {
  return database
    .prepare(
      `SELECT sync_workspaces.id, sync_workspaces.owner_user_id
       FROM sync_workspace_bindings
       JOIN sync_workspaces
         ON sync_workspaces.id = sync_workspace_bindings.workspace_id
       WHERE sync_workspace_bindings.local_workspace_id = ?`,
    )
    .bind(localWorkspaceId)
    .first<WorkspaceRow>();
}

async function findWorkspace(database: D1Database, userId: string) {
  return database
    .prepare(
      `SELECT id, owner_user_id
       FROM sync_workspaces
       WHERE owner_user_id = ?`,
    )
    .bind(userId)
    .first<WorkspaceRow>();
}

async function findOrCreateWorkspace(database: D1Database, userId: string) {
  const id = uuidv7();
  await database
    .prepare(
      `INSERT INTO sync_workspaces (id, owner_user_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(owner_user_id) DO NOTHING`,
    )
    .bind(id, userId, new Date().toISOString())
    .run();

  const workspace = await findWorkspace(database, userId);

  if (!workspace) {
    throw new Error("D1 did not return the sync workspace.");
  }

  return workspace;
}

async function readPreferences(database: D1Database, workspaceId: string) {
  const result = await database
    .prepare(
      `SELECT key, value, version, updated_at
       FROM workspace_preferences
       WHERE workspace_id = ?`,
    )
    .bind(workspaceId)
    .all<PreferenceRow>();

  return toPreferences(result.results);
}

function toPreferences(rows: PreferenceRow[]): { motion?: PreferenceEntry } {
  const row = rows.find(({ key }) => key === "motion");
  return row
    ? {
        motion: {
          updatedAt: row.updated_at,
          value: row.value,
          version: row.version,
        },
      }
    : {};
}

async function readJson(request: Request): Promise<JSONType> {
  try {
    return z.json().parse(await request.json());
  } catch {
    return null;
  }
}

function parseBindRequest(value: JSONType) {
  const request = BindRequestSchema.safeParse(value);
  return request.success ? request.data : null;
}

function parseUpdateRequest(value: JSONType) {
  const request = UpdateRequestSchema.safeParse(value);
  return request.success ? request.data : null;
}

export { syncApi };
