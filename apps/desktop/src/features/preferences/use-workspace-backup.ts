import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { createWorkspaceBackup, restoreSpoilerBackup } from "../workspace/workspace-backup";
import { workspaceStoreOptions, workspaceStoreRegistry } from "../workspace/workspace-store";
import { useWorkspaceStore } from "../workspace/workspace-store-context";

export function useWorkspaceBackup() {
  const store = useWorkspaceStore();
  const bridge = window.workspace;
  const [result, setResult] = useState<"cancelled" | "exported" | "imported">();
  const exportBackup = useMutation({
    mutationFn: async () => {
      const legacy = await bridge.readLegacyBackupSnapshot();
      return bridge.exportBackup(createWorkspaceBackup(store, legacy));
    },
    onSuccess: setResult,
  });
  const importBackup = useMutation({
    mutationFn: async () => {
      const backup = await bridge.selectBackup();
      if (!backup) {
        return "cancelled" as const;
      }

      const legacy = {
        cardLists: backup.cardLists,
        collectionLots: backup.collectionLots,
        decks: backup.decks,
        motion: backup.preferences.motion,
      };
      const bootstrap = await bridge.beginRestore(legacy);
      const options = workspaceStoreOptions(bootstrap);
      const release = workspaceStoreRegistry.retain(options);

      try {
        const restored = await workspaceStoreRegistry.getOrLoadPromise(options);
        restoreSpoilerBackup(restored, backup);
        await bridge.activateRestore(bootstrap.workspaceId);
      } catch (error) {
        await bridge.cancelRestore(bootstrap.workspaceId);
        throw error;
      } finally {
        release();
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
