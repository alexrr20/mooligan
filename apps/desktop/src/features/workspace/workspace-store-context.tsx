import type { Store } from "@livestore/livestore";
import type { ReactApi } from "@livestore/react";
import { createContext, use, type ReactNode } from "react";

import { workspaceSchema } from "@mooligan/workspace/schema";

export type WorkspaceLiveStore = Store<typeof workspaceSchema> & ReactApi;

const WorkspaceStoreContext = createContext<WorkspaceLiveStore | null>(null);

export function WorkspaceStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: WorkspaceLiveStore;
}) {
  return <WorkspaceStoreContext value={store}>{children}</WorkspaceStoreContext>;
}

export function useWorkspaceStore() {
  const store = use(WorkspaceStoreContext);
  if (!store) {
    throw new Error("The workspace store is not open.");
  }
  return store;
}
