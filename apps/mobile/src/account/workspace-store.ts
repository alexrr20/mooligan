import { makePersistedAdapter } from "@livestore/adapter-expo";
import { createStorePromise, type Store } from "@livestore/livestore";
import { withReactApi, type ReactApi } from "@livestore/react";
import { makeWsSync } from "@livestore/sync-cf/client";
import type { WorkspaceRuntime } from "@mooligan/account/runtime";
import { workspaceSchema, workspaceSyncPayloadSchema } from "@mooligan/workspace/schema";
import { Effect, Fiber, Stream } from "effect";
import { unstable_batchedUpdates } from "react-native";

export type WorkspaceStore = Store<typeof workspaceSchema> & ReactApi;

export async function openWorkspaceStore(runtime: WorkspaceRuntime, syncUrl: string | null) {
  const sync =
    runtime.sync && syncUrl
      ? {
          backend: makeWsSync({ url: syncUrl }),
          livePull: true,
          onBackendIdMismatch: "shutdown" as const,
          onSyncError: "ignore" as const,
        }
      : undefined;
  return withReactApi(
    await createStorePromise({
      adapter: makePersistedAdapter({
        clientId: runtime.clientId,
        storage: { subDirectory: "mooligan-workspaces" },
        sync,
      }),
      batchUpdates: unstable_batchedUpdates,
      disableDevtools: true,
      schema: workspaceSchema,
      storeId: runtime.workspaceId,
      syncPayloadSchema: workspaceSyncPayloadSchema,
      syncPayload: runtime.sync
        ? { credential: runtime.sync.credential, workspaceId: runtime.workspaceId }
        : undefined,
    }),
  );
}

export function observeConnection(store: WorkspaceStore, changed: (connected: boolean) => void) {
  const fiber = store.networkStatus.changes.pipe(
    Stream.runForEach((status) => Effect.sync(() => changed(status.isConnected))),
    Effect.runFork,
  );
  return () => {
    void Effect.runPromise(Fiber.interrupt(fiber));
  };
}
