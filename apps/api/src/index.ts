import { Hono } from "hono";
import * as z from "zod";

import { createAuth } from "./auth.js";
import { readCatalogRelease, refreshCatalogRelease } from "./catalog-release.js";
import {
  issueSyncCredential,
  minimumWorkspaceEventSchemaVersion,
  syncWorker,
  WorkspaceSyncBackend,
} from "./sync.js";
import {
  bindPersonalWorkspace,
  createPersonalWorkspace,
  readPersonalWorkspace,
  WorkspaceBindingSecretSchema,
  WorkspaceBindingError,
  WorkspaceIdSchema,
} from "./workspace.js";

const api = new Hono<{ Bindings: Env }>();

api.on(["GET", "POST"], "/api/auth/*", (context) => {
  return createAuth(context.env).handler(context.req.raw);
});

api.get("/health", (context) => context.json({ status: "ok" as const }));

api.get("/api/workspace", async (context) => {
  const userId = await authenticatedUserId(context.env, context.req.raw.headers);
  if (!userId) {
    return context.json({ error: "unauthorized" as const }, 401);
  }

  const workspace = await readPersonalWorkspace(context.env.DB, userId);
  return workspace
    ? context.json(workspace)
    : context.json({ error: "workspace_not_found" as const }, 404);
});

api.post("/api/workspace", async (context) => {
  const userId = await authenticatedUserId(context.env, context.req.raw.headers);
  if (!userId) {
    return context.json({ error: "unauthorized" as const }, 401);
  }

  return context.json(await createPersonalWorkspace(context.env.DB, userId));
});

api.post("/api/workspace/bind", async (context) => {
  const userId = await authenticatedUserId(context.env, context.req.raw.headers);
  if (!userId) {
    return context.json({ error: "unauthorized" as const }, 401);
  }

  const body = z
    .object({ bindingSecret: WorkspaceBindingSecretSchema, workspaceId: WorkspaceIdSchema })
    .strict()
    .safeParse(await context.req.json().catch(() => undefined));
  if (!body.success) {
    return context.json({ error: "invalid_workspace_binding" as const }, 400);
  }

  try {
    return context.json(
      await bindPersonalWorkspace(
        context.env.DB,
        userId,
        body.data.workspaceId,
        body.data.bindingSecret,
      ),
    );
  } catch (error) {
    if (error instanceof WorkspaceBindingError) {
      if (error.reason === "workspace_control_required") {
        return context.json({ error: error.reason }, 403);
      }
      return context.json({ error: error.reason }, 409);
    }
    throw error;
  }
});

api.post("/api/workspace/sync-credential", async (context) => {
  const userId = await authenticatedUserId(context.env, context.req.raw.headers);
  if (!userId) {
    return context.json({ error: "unauthorized" as const }, 401);
  }

  const workspace = await readPersonalWorkspace(context.env.DB, userId);
  if (!workspace) {
    return context.json({ error: "workspace_not_found" as const }, 404);
  }

  const client = z
    .strictObject({
      appVersion: z.string().trim().min(1).max(64),
      eventSchemaVersion: z.number().int().nonnegative(),
    })
    .safeParse(await context.req.json().catch(() => undefined));
  if (!client.success) {
    return context.json({ error: "invalid_sync_client" as const }, 400);
  }
  if (client.data.eventSchemaVersion < minimumWorkspaceEventSchemaVersion) {
    return context.json(
      {
        error: "client_upgrade_required" as const,
        message: "Update Mooligan before using Workspace sync.",
        minimumEventSchemaVersion: minimumWorkspaceEventSchemaVersion,
      },
      426,
    );
  }

  return context.json(
    await issueSyncCredential(
      context.env,
      userId,
      workspace.workspaceId,
      client.data.appVersion,
      client.data.eventSchemaVersion,
    ),
  );
});

api.get("/catalog/release", async (context) => {
  let release = await readCatalogRelease(context.env.DB);

  if (!release) {
    try {
      await refreshCatalogReleaseMetadata(context.env);
      release = await readCatalogRelease(context.env.DB);
    } catch {
      return context.json({ error: "catalog_release_unavailable" as const }, 503);
    }
  }

  return release
    ? context.json(release)
    : context.json({ error: "catalog_release_unavailable" as const }, 503);
});

async function refreshCatalogReleaseMetadata(environment: Env) {
  try {
    const result = await refreshCatalogRelease(environment.DB);
    console.log(JSON.stringify({ event: "catalog_release_refresh", result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "catalog_release_refresh_failed",
      }),
    );
    throw error;
  }
}

async function authenticatedUserId(environment: Env, headers: Headers) {
  const session = await createAuth(environment).api.getSession({ headers });
  return session?.user.id ?? null;
}

const worker = {
  async fetch(request, environment, context) {
    return new URL(request.url).pathname === "/api/sync"
      ? fetchSync(request, environment, context)
      : await api.fetch(request, environment, context);
  },
  scheduled(_controller, environment, context) {
    context.waitUntil(refreshCatalogReleaseMetadata(environment));
  },
} satisfies ExportedHandler<Env>;

async function fetchSync(request: Request, environment: Env, context: ExecutionContext) {
  // SAFETY: LiveStore 0.4 pins an older copy of Cloudflare's structural runtime types.
  // The Request, Response, and ExecutionContext objects are the same workerd values at runtime.
  return (await syncWorker.fetch(request as never, environment, context as never)) as Response;
}

export { api };
export { WorkspaceSyncBackend };
export default worker;
