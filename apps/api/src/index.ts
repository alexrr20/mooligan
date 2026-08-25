import { Hono } from "hono";

import { createAuth } from "./auth.js";
import { readCatalogRelease, refreshCatalogRelease } from "./catalog-release.js";

const api = new Hono<{ Bindings: Env }>();

api.on(["GET", "POST"], "/api/auth/*", (context) => {
  return createAuth(context.env).handler(context.req.raw);
});

api.get("/health", (context) => context.json({ status: "ok" as const }));

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

const worker = {
  fetch: api.fetch,
  scheduled(_controller, environment, context) {
    context.waitUntil(refreshCatalogReleaseMetadata(environment));
  },
} satisfies ExportedHandler<Env>;

export { api };
export default worker;
