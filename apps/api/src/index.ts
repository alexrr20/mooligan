import { Hono } from "hono";
import { StrictStruct } from "@mooligan/domain/schema";
import { Either, Schema } from "effect";

import { createAuth } from "./auth.js";
import { readCatalogRelease, refreshCatalogRelease } from "./catalog-release.js";
import {
  issueSyncCredential,
  maximumWorkspaceEventSchemaVersion,
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

const decodeWorkspaceBinding = Schema.decodeUnknownEither(
  StrictStruct({ bindingSecret: WorkspaceBindingSecretSchema, workspaceId: WorkspaceIdSchema }),
);
const decodeSyncClient = Schema.decodeUnknownEither(
  StrictStruct({
    appVersion: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(64)),
    eventSchemaVersion: Schema.NonNegativeInt,
  }),
);

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

  const body = decodeWorkspaceBinding(await context.req.json().catch(() => undefined));
  if (Either.isLeft(body)) {
    return context.json({ error: "invalid_workspace_binding" as const }, 400);
  }

  try {
    return context.json(
      await bindPersonalWorkspace(
        context.env.DB,
        userId,
        body.right.workspaceId,
        body.right.bindingSecret,
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

  const client = decodeSyncClient(await context.req.json().catch(() => undefined));
  if (Either.isLeft(client)) {
    return context.json({ error: "invalid_sync_client" as const }, 400);
  }
  if (client.right.eventSchemaVersion < minimumWorkspaceEventSchemaVersion) {
    return context.json(
      {
        error: "client_upgrade_required" as const,
        message: "Update Mooligan before using Workspace sync.",
        minimumEventSchemaVersion: minimumWorkspaceEventSchemaVersion,
      },
      426,
    );
  }
  if (client.right.eventSchemaVersion > maximumWorkspaceEventSchemaVersion) {
    return context.json(
      {
        error: "server_upgrade_required" as const,
        maximumEventSchemaVersion: maximumWorkspaceEventSchemaVersion,
        message: "The Workspace sync service must be updated before this version can synchronize.",
      },
      409,
    );
  }

  return context.json(
    await issueSyncCredential(
      context.env,
      userId,
      workspace.workspaceId,
      client.right.appVersion,
      client.right.eventSchemaVersion,
    ),
  );
});

api.get("/catalog/release", async (context) => {
  const cachedRelease = await readCatalogRelease(context.env.DB);

  try {
    await refreshCatalogReleaseMetadata(context.env);
  } catch {
    return cachedRelease
      ? context.json(cachedRelease)
      : context.json({ error: "catalog_release_unavailable" as const }, 503);
  }

  const release = await readCatalogRelease(context.env.DB);
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
