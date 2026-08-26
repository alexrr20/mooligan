import { createContext, use, type ReactNode } from "react";

import type { WorkspaceRuntime } from "../../../shared/desktop-api";

export type WorkspaceConnectionStatus = "connecting" | "local" | "sync-paused" | "synchronized";

type WorkspaceRuntimeContextValue = {
  connectionStatus: WorkspaceConnectionStatus;
  runtime: WorkspaceRuntime;
};

const WorkspaceRuntimeContext = createContext<WorkspaceRuntimeContextValue | null>(null);

export function WorkspaceRuntimeProvider({
  children,
  connectionStatus,
  runtime,
}: WorkspaceRuntimeContextValue & { children: ReactNode }) {
  return (
    <WorkspaceRuntimeContext value={{ connectionStatus, runtime }}>
      {children}
    </WorkspaceRuntimeContext>
  );
}

export function useWorkspaceRuntime() {
  const value = use(WorkspaceRuntimeContext);
  if (!value) {
    throw new Error("The Workspace runtime is not available.");
  }
  return value;
}
