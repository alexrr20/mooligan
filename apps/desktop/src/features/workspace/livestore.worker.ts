import { makeWorker } from "@livestore/adapter-web/worker";
import { workspaceSchema, workspaceSyncPayloadSchema } from "@mooligan/workspace/schema";

makeWorker({
  schema: workspaceSchema,
  syncPayloadSchema: workspaceSyncPayloadSchema,
});
