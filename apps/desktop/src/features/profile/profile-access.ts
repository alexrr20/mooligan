import type { AuthSnapshot, WorkspaceRuntime } from "../../../shared/desktop-api.ts";

export function canAccessProfile(auth: AuthSnapshot, runtime: WorkspaceRuntime) {
  return (
    auth.status === "signed-in" &&
    auth.user !== null &&
    runtime.workspaces.some(
      (workspace) =>
        workspace.workspaceId === runtime.workspaceId &&
        workspace.active &&
        workspace.accountAssociation === "account",
    )
  );
}
