import { makeWorker } from "@livestore/adapter-web/worker";
import { makeWsSync } from "@livestore/sync-cf/client";
import { workspaceSchema, workspaceSyncPayloadSchema } from "@mooligan/workspace/schema";

const syncUrl = import.meta.env.MOOLIGAN_SYNC_URL;
if (!syncUrl) {
  throw new Error("The Workspace sync URL is not configured.");
}

makeWorker({
  schema: workspaceSchema,
  sync: {
    backend: makeWsSync({ url: syncUrl }),
    livePull: true,
    onBackendIdMismatch: "shutdown",
    onSyncError: "ignore",
  },
  syncPayloadSchema: workspaceSyncPayloadSchema,
});
