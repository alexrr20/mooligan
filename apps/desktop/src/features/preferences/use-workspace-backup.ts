import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export function useWorkspaceBackup() {
  const bridge = window.workspace;
  const [result, setResult] = useState<"cancelled" | "exported" | "imported">();
  const exportBackup = useMutation({
    mutationFn: () => bridge.exportBackup(),
    onSuccess: setResult,
  });
  const importBackup = useMutation({
    mutationFn: () => bridge.importBackup(),
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
