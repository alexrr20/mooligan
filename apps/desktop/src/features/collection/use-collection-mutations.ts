import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import { createCollectionMutations } from "./collection-mutations";

export function useCollectionMutations() {
  const store = useWorkspaceLiveStore();
  return createCollectionMutations(store, window.catalog.validateCollectionPrinting);
}
