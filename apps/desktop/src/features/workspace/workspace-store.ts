import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { StoreRegistry, storeOptions } from "@livestore/livestore";
import { workspaceSchema, workspaceSyncPayloadSchema } from "@mooligan/workspace/schema";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

import type { WorkspaceBootstrap, WorkspaceRuntime } from "../../../shared/desktop-api";
import LiveStoreSyncWorker from "./livestore-sync.worker?worker";
import LiveStoreWorker from "./livestore.worker?worker";

export function createLiveStoreRegistry() {
  return new StoreRegistry({
    defaultOptions: {
      batchUpdates,
      confirmUnsavedChanges: false,
      unusedCacheTime: 100,
    },
  });
}

export function localWorkspaceStoreOptions({ clientId, workspaceId }: WorkspaceBootstrap) {
  return storeOptions({
    adapter: makePersistedAdapter({
      clientId,
      experimental: { awaitSharedWorkerTermination: true },
      sharedWorker: LiveStoreSharedWorker,
      storage: { type: "opfs" },
      worker: LiveStoreWorker,
    }),
    disableDevtools: !import.meta.env.DEV,
    schema: workspaceSchema,
    storeId: workspaceId,
    syncPayloadSchema: workspaceSyncPayloadSchema,
  });
}

export function workspaceStoreOptions(runtime: WorkspaceRuntime) {
  if (!runtime.sync) {
    return localWorkspaceStoreOptions(runtime);
  }

  return storeOptions({
    adapter: makePersistedAdapter({
      clientId: runtime.clientId,
      experimental: { awaitSharedWorkerTermination: true },
      sharedWorker: LiveStoreSharedWorker,
      storage: { type: "opfs" },
      worker: LiveStoreSyncWorker,
    }),
    disableDevtools: !import.meta.env.DEV,
    schema: workspaceSchema,
    storeId: runtime.workspaceId,
    syncPayload: {
      credential: runtime.sync.credential,
      workspaceId: runtime.sync.accountWorkspaceId,
    },
    syncPayloadSchema: workspaceSyncPayloadSchema,
  });
}
