import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { StoreRegistry, storeOptions } from "@livestore/livestore";
import { workspaceSchema, workspaceSyncPayloadSchema } from "@mooligan/workspace/schema";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

import type { WorkspaceBootstrap } from "../../../shared/desktop-api";
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

export const liveStoreRegistry = createLiveStoreRegistry();

export function workspaceStoreOptions({ clientId, workspaceId }: WorkspaceBootstrap) {
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

window.addEventListener(
  "beforeunload",
  () => {
    void liveStoreRegistry.dispose();
  },
  { once: true },
);
