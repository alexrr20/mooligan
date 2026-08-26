import { useWorkspaceStore } from "../workspace/workspace-store-context";
import { createCollectionMutations } from "./collection-mutations";

export function useCollectionMutations() {
  const store = useWorkspaceStore();
  return createCollectionMutations(store, window.catalog.validateCollectionPrinting);
}
