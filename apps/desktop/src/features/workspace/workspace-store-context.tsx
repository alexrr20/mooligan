import type { Store } from "@livestore/livestore";
import type { ReactApi } from "@livestore/react";
import { createContext, use, type ReactNode } from "react";

import { workspaceSchema } from "@mooligan/workspace/schema";

export type WorkspaceLiveStore = Store<typeof workspaceSchema> & ReactApi;

const WorkspaceLiveStoreContext = createContext<WorkspaceLiveStore | null>(null);

export function WorkspaceLiveStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: WorkspaceLiveStore;
}) {
  return <WorkspaceLiveStoreContext value={store}>{children}</WorkspaceLiveStoreContext>;
}

export function useWorkspaceLiveStore() {
  const store = use(WorkspaceLiveStoreContext);
  if (!store) {
    throw new Error("The workspace store is not open.");
  }
  return store;
}
