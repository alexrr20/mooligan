import type { StorageMode } from "@livestore/common";

export function requirePersistentWorkspaceStorage(storageMode: StorageMode) {
  if (storageMode !== "persisted") {
    throw new Error(
      "Persistent Workspace storage is unavailable. Mooligan refused to open a temporary in-memory Workspace.",
    );
  }
}
