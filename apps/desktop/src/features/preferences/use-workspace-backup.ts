import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { createWorkspaceBackup, restoreWorkspaceBackup } from "../workspace/workspace-backup";
import { createLiveStoreRegistry, localWorkspaceStoreOptions } from "../workspace/workspace-store";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";

export function useWorkspaceBackup() {
  const store = useWorkspaceLiveStore();
  const bridge = window.workspace;
  const [result, setResult] = useState<"cancelled" | "exported" | "imported">();
  const exportBackup = useMutation({
    mutationFn: () => bridge.exportBackup(createWorkspaceBackup(store)),
    onSuccess: setResult,
  });
  const importBackup = useMutation({
    mutationFn: async () => {
      const backup = await bridge.selectBackup();
      if (!backup) {
        return "cancelled" as const;
      }

      const bootstrap = await bridge.beginRestore();
      const options = localWorkspaceStoreOptions(bootstrap);
      const restoreRegistry = createLiveStoreRegistry();
      const release = restoreRegistry.retain(options);
      let restoreStoreClosed = false;

      try {
        try {
          const restored = await restoreRegistry.getOrLoadPromise(options);
          await restoreWorkspaceBackup(restored, backup);
        } finally {
          release();
          await restoreRegistry.dispose();
          restoreStoreClosed = true;
        }
        await bridge.activateRestore(bootstrap.workspaceId);
      } catch (error) {
        if (restoreStoreClosed) {
          await bridge.cancelRestore(bootstrap.workspaceId);
        }
        throw error;
      }

      window.location.reload();
      return "imported" as const;
    },
    onSuccess: setResult,
  });
  const error = exportBackup.error ?? importBackup.error;
  return {
    busy: exportBackup.isPending || importBackup.isPending,
    error: error instanceof Error ? error.message : null,
    exportBackup: exportBackup.mutate,
    importBackup: importBackup.mutate,
    result,
  };
}
