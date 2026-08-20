import {
  SpoilerDecisionStateSchema,
  SpoilerPolicySchema,
  SpoilerRevealScopeSchema,
} from "@mooligan/domain/spoilers";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { v7 as uuidv7 } from "uuid";
import * as z from "zod";
import type { JSONType } from "zod";

import { createAuth } from "./auth.js";

const SPOILER_SYNC_BATCH_SIZE = 25;
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

type SpoilerStateRow = {
  policy: "protect" | "show";
  reset_generation: number;
  sync_version: number;
  updated_at: string;
  version: number;
};

type SpoilerDecisionRow = {
  reset_generation: number;
  scope: "printing" | "release";
  state: "protect" | "reveal";
  target_id: string;
  updated_at: string;
  version: number;
};

type SpoilerOperationReceiptRow = {
  completed: number;
  operation_id: string;
  request_fingerprint: string;
  snapshot_version: number | null;
  state_policy: "protect" | "show" | null;
  state_reset_generation: number | null;
  state_updated_at: string | null;
  state_version: number | null;
};

type SpoilerStateBatchRow = SpoilerStateRow & { row_type: "state" };
type SpoilerDecisionBatchRow = SpoilerDecisionRow & { row_type: "decision" };
type SpoilerOperationReceiptBatchRow = SpoilerOperationReceiptRow & { row_type: "receipt" };
type SpoilerBatchRow =
  | SpoilerStateBatchRow
  | SpoilerDecisionBatchRow
  | SpoilerOperationReceiptBatchRow;

const TargetIdSchema = z.string().trim().min(1).max(128);
const BaseVersionSchema = z.number().int().positive().nullable();
const MotionPreferencesSchema = z.strictObject({ motion: MotionPreferenceSchema });
const InitialSpoilerStateSchema = z.strictObject({
  policy: SpoilerPolicySchema,
  resetGeneration: z.number().int().nonnegative(),
});
const BindRequestSchema = z.strictObject({
  localWorkspaceId: z.uuid(),
  preferences: MotionPreferencesSchema.optional(),
  spoilerState: InitialSpoilerStateSchema,
});
const UpdateRequestSchema = z.strictObject({
  updates: z.tuple([z.strictObject({ key: z.literal("motion"), value: MotionPreferenceSchema })]),
});
const SpoilerStateMutationSchema = InitialSpoilerStateSchema.extend({
  baseVersion: BaseVersionSchema,
});
const SpoilerDecisionMutationSchema = z.strictObject({
  baseVersion: BaseVersionSchema,
  generation: z.number().int().nonnegative(),
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: TargetIdSchema,
});
const SpoilerUpdateRequestSchema = z
  .strictObject({
    decisions: z.array(SpoilerDecisionMutationSchema).max(SPOILER_SYNC_BATCH_SIZE),
    localWorkspaceId: z.uuid(),
    operationId: z.uuid(),
    state: SpoilerStateMutationSchema.optional(),
  })
  .refine(({ decisions, state }) => decisions.length > 0 || state !== undefined, {
    message: "At least one spoiler update is required.",
  })
  .refine(
    ({ decisions }) =>
      new Set(decisions.map(({ scope, targetId }) => spoilerDecisionKey(scope, targetId))).size ===
      decisions.length,
    { message: "Spoiler decision targets must be unique." },
  );
type SpoilerUpdateRequest = z.infer<typeof SpoilerUpdateRequestSchema>;
const CursorSchema = z.strictObject({
  scope: SpoilerRevealScopeSchema,
  targetId: TargetIdSchema,
});
const SpoilerQuerySchema = z.strictObject({ cursor: z.string().min(1).max(512).optional() });

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

  const updatedAt = new Date().toISOString();
  if (request.preferences) {
    await context.env.DB.prepare(
      `INSERT INTO workspace_preferences
       (workspace_id, key, value, version, updated_at)
       VALUES (?, 'motion', ?, 1, ?)
       ON CONFLICT(workspace_id, key) DO NOTHING`,
    )
      .bind(workspace.id, request.preferences.motion, updatedAt)
      .run();
  }
  await context.env.DB.prepare(
    `INSERT INTO workspace_spoiler_state
     (workspace_id, policy, reset_generation, seed_local_workspace_id,
      sync_version, version, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?)
     ON CONFLICT(workspace_id) DO NOTHING`,
  )
    .bind(
      workspace.id,
      request.spoilerState.policy,
      request.spoilerState.resetGeneration,
      localWorkspaceId,
      updatedAt,
    )
    .run();

  return context.json({
    preferences: await readPreferences(context.env.DB, workspace.id),
    spoilerState: await requireSpoilerState(context.env.DB, workspace.id),
    spoilerStateAccepted: await spoilerStateWasSeededBy(
      context.env.DB,
      workspace.id,
      localWorkspaceId,
    ),
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

syncApi.get("/spoilers", async (context) => {
  const query = SpoilerQuerySchema.safeParse(context.req.query());
  if (!query.success) {
    return context.json({ error: "invalid_request" as const }, 400);
  }

  const cursor = query.data.cursor ? parseCursor(query.data.cursor) : null;
  if (query.data.cursor && !cursor) {
    return context.json({ error: "invalid_request" as const }, 400);
  }

  const workspace = await findWorkspace(context.env.DB, context.get("userId"));
  if (!workspace) {
    return context.json({ error: "workspace_not_bound" as const }, 404);
  }

  const [stateResult, decisionsResult] = await context.env.DB.batch<SpoilerBatchRow>([
    prepareSpoilerStateRead(context.env.DB, workspace.id),
    prepareSpoilerDecisionPageRead(context.env.DB, workspace.id, cursor),
  ]);
  const stateRow = requireSpoilerStateResult(stateResult);
  const state = toSpoilerState(stateRow);
  const rows = requireSpoilerDecisionResults(decisionsResult);
  const hasMore = rows.length > SPOILER_SYNC_BATCH_SIZE;
  const page = rows.slice(0, SPOILER_SYNC_BATCH_SIZE);
  const last = page.at(-1);

  return context.json({
    decisions: page.map(toSpoilerDecision),
    nextCursor: hasMore && last ? serializeCursor(last) : null,
    snapshotVersion: stateRow.sync_version,
    state,
  });
});

syncApi.post("/spoilers", async (context) => {
  const request = parseSpoilerUpdateRequest(await readJson(context.req.raw));
  if (!request) {
    return context.json({ error: "invalid_request" as const }, 400);
  }

  const localWorkspaceId = request.localWorkspaceId.toLowerCase();
  const operationId = request.operationId.toLowerCase();
  const workspace = await findBinding(context.env.DB, localWorkspaceId);
  if (!workspace || workspace.owner_user_id !== context.get("userId")) {
    return context.json({ error: "workspace_not_bound" as const }, 404);
  }

  const currentState = await requireSpoilerState(context.env.DB, workspace.id);
  const proposedResetGeneration = Math.max(
    currentState.resetGeneration,
    request.state?.resetGeneration ?? currentState.resetGeneration,
  );

  if (request.decisions.some(({ generation }) => generation > proposedResetGeneration)) {
    return context.json({ error: "invalid_reset_generation" as const }, 409);
  }

  const requestFingerprint = await spoilerUpdateRequestFingerprint(request);
  const updatedAt = new Date().toISOString();
  const statements = [
    prepareSpoilerOperationReceiptClaim(
      context.env.DB,
      localWorkspaceId,
      operationId,
      requestFingerprint,
    ),
    prepareSpoilerOperationDecisionClear(
      context.env.DB,
      localWorkspaceId,
      operationId,
      requestFingerprint,
    ),
    request.state
      ? prepareSpoilerStateUpdate(
          context.env.DB,
          workspace.id,
          request.state,
          updatedAt,
          localWorkspaceId,
          operationId,
          requestFingerprint,
        )
      : prepareSpoilerStateTouch(
          context.env.DB,
          workspace.id,
          localWorkspaceId,
          operationId,
          requestFingerprint,
        ),
    ...request.decisions.map((decision) =>
      prepareSpoilerDecisionUpdate(
        context.env.DB,
        workspace.id,
        decision,
        updatedAt,
        localWorkspaceId,
        operationId,
        requestFingerprint,
      ),
    ),
    ...(request.decisions.length > 0
      ? [
          prepareSpoilerOperationDecisionCapture(
            context.env.DB,
            workspace.id,
            request.decisions,
            localWorkspaceId,
            operationId,
            requestFingerprint,
          ),
        ]
      : []),
    prepareSpoilerOperationReceiptComplete(
      context.env.DB,
      workspace.id,
      localWorkspaceId,
      operationId,
      requestFingerprint,
    ),
    prepareSpoilerOperationReceiptRead(context.env.DB, localWorkspaceId),
    prepareSpoilerOperationDecisionRead(context.env.DB, localWorkspaceId),
  ];
  const results = await context.env.DB.batch<SpoilerBatchRow>(statements);
  const receipt = requireSpoilerOperationReceiptResult(results.at(-2));

  if (receipt.operation_id === operationId && receipt.request_fingerprint !== requestFingerprint) {
    return context.json({ error: "operation_id_reused" as const }, 409);
  }
  if (receipt.operation_id !== operationId || receipt.request_fingerprint !== requestFingerprint) {
    throw new Error("D1 did not return the spoiler operation receipt.");
  }

  const decisionRows = requireSpoilerDecisionResults(results.at(-1));
  if (
    decisionRows.length !== request.decisions.length ||
    decisionRows.some(
      (decision, index) =>
        decision.scope !== request.decisions[index]?.scope ||
        decision.target_id !== request.decisions[index]?.targetId,
    )
  ) {
    throw new Error("D1 did not return every spoiler operation decision.");
  }

  return context.json({
    decisions: decisionRows.map(toSpoilerDecision),
    operationId,
    snapshotVersion: requireReceiptNumber(receipt.snapshot_version),
    state: toSpoilerReceiptState(receipt),
  });
});

function prepareSpoilerOperationReceiptClaim(
  database: D1Database,
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  return database
    .prepare(
      `INSERT INTO workspace_spoiler_operation_receipts
       (local_workspace_id, operation_id, request_fingerprint, completed)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(local_workspace_id) DO UPDATE SET
         operation_id = excluded.operation_id,
         request_fingerprint = excluded.request_fingerprint,
         completed = 0,
         snapshot_version = NULL,
         state_policy = NULL,
         state_reset_generation = NULL,
         state_version = NULL,
         state_updated_at = NULL
       WHERE workspace_spoiler_operation_receipts.operation_id <> excluded.operation_id`,
    )
    .bind(localWorkspaceId, operationId, requestFingerprint);
}

function prepareSpoilerOperationDecisionClear(
  database: D1Database,
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  return database
    .prepare(
      `DELETE FROM workspace_spoiler_operation_decisions
       WHERE local_workspace_id = ?
         AND EXISTS (
           SELECT 1
           FROM workspace_spoiler_operation_receipts AS receipt
           WHERE receipt.local_workspace_id = ?
             AND receipt.operation_id = ?
             AND receipt.request_fingerprint = ?
             AND receipt.completed = 0
         )`,
    )
    .bind(localWorkspaceId, localWorkspaceId, operationId, requestFingerprint);
}

function prepareSpoilerStateUpdate(
  database: D1Database,
  workspaceId: string,
  state: z.infer<typeof SpoilerStateMutationSchema>,
  updatedAt: string,
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  return database
    .prepare(
      `INSERT INTO workspace_spoiler_state
       (workspace_id, policy, reset_generation, seed_local_workspace_id,
        sync_version, version, updated_at)
       SELECT ?, ?, ?, '', 1, 1, ?
       WHERE EXISTS (
         SELECT 1
         FROM workspace_spoiler_operation_receipts AS receipt
         WHERE receipt.local_workspace_id = ?
           AND receipt.operation_id = ?
           AND receipt.request_fingerprint = ?
           AND receipt.completed = 0
       )
       ON CONFLICT(workspace_id) DO UPDATE SET
         policy = CASE
           WHEN workspace_spoiler_state.version = ?
             AND excluded.reset_generation >= workspace_spoiler_state.reset_generation
             THEN excluded.policy
           WHEN workspace_spoiler_state.policy = 'protect' OR excluded.policy = 'protect'
             THEN 'protect'
           ELSE 'show'
         END,
         reset_generation = MAX(
           workspace_spoiler_state.reset_generation,
           excluded.reset_generation
         ),
         sync_version = workspace_spoiler_state.sync_version + 1,
         version = workspace_spoiler_state.version + 1,
         updated_at = excluded.updated_at
       RETURNING 'state' AS row_type,
                 policy, reset_generation, sync_version, version, updated_at`,
    )
    .bind(
      workspaceId,
      state.policy,
      state.resetGeneration,
      updatedAt,
      localWorkspaceId,
      operationId,
      requestFingerprint,
      state.baseVersion,
    );
}

function prepareSpoilerStateTouch(
  database: D1Database,
  workspaceId: string,
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  return database
    .prepare(
      `UPDATE workspace_spoiler_state
       SET sync_version = sync_version + 1
       WHERE workspace_id = ?
         AND EXISTS (
           SELECT 1
           FROM workspace_spoiler_operation_receipts AS receipt
           WHERE receipt.local_workspace_id = ?
             AND receipt.operation_id = ?
             AND receipt.request_fingerprint = ?
             AND receipt.completed = 0
         )
       RETURNING 'state' AS row_type,
                 policy, reset_generation, sync_version, version, updated_at`,
    )
    .bind(workspaceId, localWorkspaceId, operationId, requestFingerprint);
}

function prepareSpoilerDecisionUpdate(
  database: D1Database,
  workspaceId: string,
  decision: z.infer<typeof SpoilerDecisionMutationSchema>,
  updatedAt: string,
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  return database
    .prepare(
      `INSERT INTO workspace_spoiler_decisions
       (workspace_id, scope, target_id, state, reset_generation, version, updated_at)
       SELECT ?, ?, ?,
         CASE
           WHEN ? < global.reset_generation THEN 'protect'
           WHEN ? IS NOT NULL AND existing.version IS NULL THEN 'protect'
           ELSE ?
         END,
         MAX(?, global.reset_generation),
         1,
         ?
       FROM workspace_spoiler_state AS global
       LEFT JOIN workspace_spoiler_decisions AS existing
         ON existing.workspace_id = global.workspace_id
        AND existing.scope = ?
        AND existing.target_id = ?
       WHERE global.workspace_id = ?
         AND EXISTS (
           SELECT 1
           FROM workspace_spoiler_operation_receipts AS receipt
           WHERE receipt.local_workspace_id = ?
             AND receipt.operation_id = ?
             AND receipt.request_fingerprint = ?
             AND receipt.completed = 0
         )
       ON CONFLICT(workspace_id, scope, target_id) DO UPDATE SET
         state = CASE
           WHEN workspace_spoiler_decisions.version = ?
             AND excluded.reset_generation >= workspace_spoiler_decisions.reset_generation
             THEN excluded.state
           WHEN excluded.reset_generation > workspace_spoiler_decisions.reset_generation
             THEN excluded.state
           WHEN excluded.reset_generation < workspace_spoiler_decisions.reset_generation
             THEN workspace_spoiler_decisions.state
           WHEN workspace_spoiler_decisions.state = 'protect' OR excluded.state = 'protect'
             THEN 'protect'
           ELSE 'reveal'
         END,
         reset_generation = MAX(
           workspace_spoiler_decisions.reset_generation,
           excluded.reset_generation
         ),
         version = workspace_spoiler_decisions.version + 1,
         updated_at = excluded.updated_at
       RETURNING 'decision' AS row_type,
                 scope, target_id, state, reset_generation, version, updated_at`,
    )
    .bind(
      workspaceId,
      decision.scope,
      decision.targetId,
      decision.generation,
      decision.baseVersion,
      decision.state,
      decision.generation,
      updatedAt,
      decision.scope,
      decision.targetId,
      workspaceId,
      localWorkspaceId,
      operationId,
      requestFingerprint,
      decision.baseVersion,
    );
}

function prepareSpoilerOperationDecisionCapture(
  database: D1Database,
  workspaceId: string,
  decisions: SpoilerUpdateRequest["decisions"],
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  const requestedRows = decisions.map(() => "(?, ?, ?)").join(", ");
  const requestedValues = decisions.flatMap(({ scope, targetId }, responseIndex) => [
    responseIndex,
    scope,
    targetId,
  ]);

  return database
    .prepare(
      `WITH requested(response_index, scope, target_id) AS (
         VALUES ${requestedRows}
       )
       INSERT INTO workspace_spoiler_operation_decisions
       (local_workspace_id, response_index, scope, target_id, state,
        reset_generation, version, updated_at)
       SELECT ?, requested.response_index, remote.scope, remote.target_id, remote.state,
              remote.reset_generation, remote.version, remote.updated_at
       FROM requested
       JOIN workspace_spoiler_decisions AS remote
         ON remote.workspace_id = ?
        AND remote.scope = requested.scope
        AND remote.target_id = requested.target_id
       WHERE EXISTS (
         SELECT 1
         FROM workspace_spoiler_operation_receipts AS receipt
         WHERE receipt.local_workspace_id = ?
           AND receipt.operation_id = ?
           AND receipt.request_fingerprint = ?
           AND receipt.completed = 0
       )`,
    )
    .bind(
      ...requestedValues,
      localWorkspaceId,
      workspaceId,
      localWorkspaceId,
      operationId,
      requestFingerprint,
    );
}

function prepareSpoilerOperationReceiptComplete(
  database: D1Database,
  workspaceId: string,
  localWorkspaceId: string,
  operationId: string,
  requestFingerprint: string,
) {
  return database
    .prepare(
      `UPDATE workspace_spoiler_operation_receipts
       SET completed = 1,
           snapshot_version = (
             SELECT sync_version FROM workspace_spoiler_state WHERE workspace_id = ?
           ),
           state_policy = (
             SELECT policy FROM workspace_spoiler_state WHERE workspace_id = ?
           ),
           state_reset_generation = (
             SELECT reset_generation FROM workspace_spoiler_state WHERE workspace_id = ?
           ),
           state_version = (
             SELECT version FROM workspace_spoiler_state WHERE workspace_id = ?
           ),
           state_updated_at = (
             SELECT updated_at FROM workspace_spoiler_state WHERE workspace_id = ?
           )
       WHERE local_workspace_id = ?
         AND operation_id = ?
         AND request_fingerprint = ?
         AND completed = 0`,
    )
    .bind(
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      localWorkspaceId,
      operationId,
      requestFingerprint,
    );
}

function prepareSpoilerOperationReceiptRead(database: D1Database, localWorkspaceId: string) {
  return database
    .prepare(
      `SELECT 'receipt' AS row_type,
              operation_id, request_fingerprint, completed, snapshot_version,
              state_policy, state_reset_generation, state_version, state_updated_at
       FROM workspace_spoiler_operation_receipts
       WHERE local_workspace_id = ?`,
    )
    .bind(localWorkspaceId);
}

function prepareSpoilerOperationDecisionRead(database: D1Database, localWorkspaceId: string) {
  return database
    .prepare(
      `SELECT 'decision' AS row_type,
              scope, target_id, state, reset_generation, version, updated_at
       FROM workspace_spoiler_operation_decisions
       WHERE local_workspace_id = ?
       ORDER BY response_index`,
    )
    .bind(localWorkspaceId);
}

function prepareSpoilerStateRead(database: D1Database, workspaceId: string) {
  return database
    .prepare(
      `SELECT 'state' AS row_type,
              policy, reset_generation, sync_version, version, updated_at
       FROM workspace_spoiler_state
       WHERE workspace_id = ?`,
    )
    .bind(workspaceId);
}

function prepareSpoilerDecisionPageRead(
  database: D1Database,
  workspaceId: string,
  cursor: z.infer<typeof CursorSchema> | null,
) {
  return cursor
    ? database
        .prepare(
          `SELECT 'decision' AS row_type,
                  scope, target_id, state, reset_generation, version, updated_at
           FROM workspace_spoiler_decisions
           WHERE workspace_id = ?
             AND reset_generation = (
               SELECT reset_generation
               FROM workspace_spoiler_state
               WHERE workspace_id = ?
             )
             AND (scope > ? OR (scope = ? AND target_id > ?))
           ORDER BY scope, target_id
           LIMIT ?`,
        )
        .bind(
          workspaceId,
          workspaceId,
          cursor.scope,
          cursor.scope,
          cursor.targetId,
          SPOILER_SYNC_BATCH_SIZE + 1,
        )
    : database
        .prepare(
          `SELECT 'decision' AS row_type,
                  scope, target_id, state, reset_generation, version, updated_at
           FROM workspace_spoiler_decisions
           WHERE workspace_id = ?
             AND reset_generation = (
               SELECT reset_generation
               FROM workspace_spoiler_state
               WHERE workspace_id = ?
             )
           ORDER BY scope, target_id
           LIMIT ?`,
        )
        .bind(workspaceId, workspaceId, SPOILER_SYNC_BATCH_SIZE + 1);
}

function requireSpoilerStateResult(result: D1Result<SpoilerBatchRow> | undefined) {
  const row = result?.results[0];
  if (!row || row.row_type !== "state" || result?.results.length !== 1) {
    throw new Error("D1 did not return the spoiler state.");
  }
  return row;
}

function requireSpoilerOperationReceiptResult(result: D1Result<SpoilerBatchRow> | undefined) {
  const row = result?.results[0];
  if (!row || row.row_type !== "receipt" || result?.results.length !== 1 || row.completed !== 1) {
    throw new Error("D1 did not return the completed spoiler operation receipt.");
  }
  return row;
}

function requireSpoilerDecisionResults(result: D1Result<SpoilerBatchRow> | undefined) {
  if (!result) {
    throw new Error("D1 did not return the spoiler decisions.");
  }
  const rows: SpoilerDecisionBatchRow[] = [];
  for (const row of result.results) {
    if (row.row_type !== "decision") {
      throw new Error("D1 did not return the spoiler decisions.");
    }
    rows.push(row);
  }
  return rows;
}

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

async function requireSpoilerState(database: D1Database, workspaceId: string) {
  const row = await database
    .prepare(
      `SELECT policy, reset_generation, sync_version, version, updated_at
       FROM workspace_spoiler_state
       WHERE workspace_id = ?`,
    )
    .bind(workspaceId)
    .first<SpoilerStateRow>();

  if (!row) throw new Error("D1 did not return the spoiler state.");
  return toSpoilerState(row);
}

async function spoilerStateWasSeededBy(
  database: D1Database,
  workspaceId: string,
  localWorkspaceId: string,
) {
  const row = await database
    .prepare(
      `SELECT 1 AS accepted
       FROM workspace_spoiler_state
       WHERE workspace_id = ? AND seed_local_workspace_id = ?`,
    )
    .bind(workspaceId, localWorkspaceId)
    .first<{ accepted: number }>();
  return row?.accepted === 1;
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

function toSpoilerState(row: SpoilerStateRow) {
  return {
    policy: row.policy,
    resetGeneration: row.reset_generation,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toSpoilerReceiptState(row: SpoilerOperationReceiptRow) {
  const policy = row.state_policy;
  const updatedAt = row.state_updated_at;
  if (policy === null || updatedAt === null) {
    throw new Error("The completed spoiler operation receipt is invalid.");
  }

  return {
    policy,
    resetGeneration: requireReceiptNumber(row.state_reset_generation),
    updatedAt,
    version: requireReceiptNumber(row.state_version),
  };
}

function toSpoilerDecision(row: SpoilerDecisionRow) {
  return {
    generation: row.reset_generation,
    scope: row.scope,
    state: row.state,
    targetId: row.target_id,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function requireReceiptNumber(value: number | null) {
  if (value === null) {
    throw new Error("The completed spoiler operation receipt is invalid.");
  }
  return value;
}

async function spoilerUpdateRequestFingerprint(request: SpoilerUpdateRequest) {
  const serialized = JSON.stringify({
    decisions: request.decisions.map((decision) => ({
      baseVersion: decision.baseVersion,
      generation: decision.generation,
      scope: decision.scope,
      state: decision.state,
      targetId: decision.targetId,
    })),
    state: request.state
      ? {
          baseVersion: request.state.baseVersion,
          policy: request.state.policy,
          resetGeneration: request.state.resetGeneration,
        }
      : null,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function parseSpoilerUpdateRequest(value: JSONType) {
  const request = SpoilerUpdateRequestSchema.safeParse(value);
  return request.success ? request.data : null;
}

function parseCursor(value: string) {
  try {
    const cursor = CursorSchema.safeParse(JSON.parse(value));
    return cursor.success ? cursor.data : null;
  } catch {
    return null;
  }
}

function serializeCursor(row: SpoilerDecisionRow) {
  return JSON.stringify({ scope: row.scope, targetId: row.target_id });
}

function spoilerDecisionKey(scope: "printing" | "release", targetId: string) {
  return `${scope}\0${targetId}`;
}

export { syncApi };
