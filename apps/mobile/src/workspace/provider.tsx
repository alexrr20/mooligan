import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { AppState } from "react-native";
import { cardTagsQuery, tagAssignmentsQuery, tagTemplatesQuery } from "@mooligan/workspace/tags";
import { collectionLotsQuery } from "@mooligan/workspace/collection";
import { decksQuery, deckEntriesQuery } from "@mooligan/workspace/decks";
import { spoilerSettingsQuery, spoilerDecisionsQuery } from "@mooligan/workspace/spoilers";
import {
  priceCurrencyQuery,
  priceProviderPreferencesQuery,
  readPriceCurrency,
  readEnabledPriceProviders,
} from "@mooligan/workspace/price-preferences";
import { createCollectionMutations } from "@mooligan/workspace/client/collection-mutations";
import { createTagMutations } from "@mooligan/workspace/client/tag-mutations";
import { materializeTagTemplates } from "@mooligan/workspace/client/tag-state";
import { createDeckMutations } from "@mooligan/workspace/client/deck-mutations";
import { materializeDecks } from "@mooligan/workspace/client/deck-state";
import { runSpoilerAction, type SpoilerAction } from "@mooligan/workspace/client/spoiler-actions";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import type { WorkspaceStore } from "@/account/workspace-store";
import { useMobileAccount } from "@/account/account-provider";
import { useReferenceData } from "@/catalog/catalog";
import { Button, Copy, Screen } from "@/components/ui";

const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceData> | null>(null);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { account, workspace, runtime, error } = useMobileAccount();
  if (!workspace)
    return (
      <Screen>
        <Copy title="Opening your workspace" />
        {error && <Copy>{error}</Copy>}
        <Button label="Retry" onPress={() => account.refresh()} />
      </Screen>
    );
  return (
    <QueryClientProvider client={queryClient}>
      <OpenWorkspaceProvider key={runtime.workspaceId} store={workspace.store}>
        {children}
      </OpenWorkspaceProvider>
    </QueryClientProvider>
  );
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function subscribeDate(changed: () => void) {
  const timer = setInterval(changed, 30_000);
  const subscription = AppState.addEventListener("change", changed);
  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}

function OpenWorkspaceProvider({
  store,
  children,
}: {
  store: WorkspaceStore;
  children: ReactNode;
}) {
  const workspace = useWorkspaceData(store);
  const reference = workspace.reference;
  useEffect(() => reference.startPriceUpdates(), [reference]);
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Open a workspace before reading its cards.");
  return workspace;
}

function useWorkspaceData(store: WorkspaceStore) {
  const reference = useReferenceData();
  const settings = store.useQuery(spoilerSettingsQuery);
  const decisions = store.useQuery(spoilerDecisionsQuery);
  const currentDate = useSyncExternalStore(subscribeDate, localDate);
  const decks = materializeDecks(store.useQuery(decksQuery), store.useQuery(deckEntriesQuery));
  const cardTags = store.useQuery(cardTagsQuery);
  const tagAssignments = store.useQuery(tagAssignmentsQuery);
  const tagTemplates = materializeTagTemplates(store.useQuery(tagTemplatesQuery));
  const currency = readPriceCurrency(store.useQuery(priceCurrencyQuery));
  const providers = readEnabledPriceProviders(store.useQuery(priceProviderPreferencesQuery));
  const visibility: SpoilerVisibilitySnapshot = {
    currentDate,
    policy: settings.policy,
    revision: 0,
    revealedPrintingIds: decisions
      .filter((d) => d.scope === "printing" && d.state === "reveal")
      .map((d) => d.targetId),
    revealedRootSetIds: decisions
      .filter((d) => d.scope === "release" && d.state === "reveal")
      .map((d) => d.targetId),
  };
  const lots = store.useQuery(collectionLotsQuery);
  const detail = async (id: string) => reference.catalog.detail(id, visibility);
  const collection = createCollectionMutations(store, async (request) => {
    const result = await detail(request.printingId);
    if (!result || result.status !== "visible") {
      if (request.existingFinish === request.finish) return;
      throw new Error("Choose a visible printing from the local catalog.");
    }
    if (result.detail.selectedPrinting.isDigital)
      throw new Error("Only paper printings belong in your collection.");
    if (!result.detail.selectedPrinting.finishes?.includes(request.finish))
      throw new Error("Choose a finish available for this printing.");
  });
  return {
    ...reference,
    store,
    lots,
    decks,
    visibility,
    currency,
    providers,
    collection,
    deckActions: createDeckMutations(store, detail),
    cardTags,
    tagAssignments,
    tagTemplates,
    tagActions: createTagMutations(store),
    spoiler: (action: SpoilerAction) =>
      runSpoilerAction(store, action, async (id) => reference.catalog.rootSet(id)),
  };
}

export function useCatalogQuery<Result>(
  key: readonly (string | number | boolean | null | undefined)[],
  query: (workspace: ReturnType<typeof useWorkspace>) => Result,
) {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: [
      "catalog",
      workspace.store.storeId,
      workspace.revision,
      workspace.visibility,
      ...key,
    ],
    queryFn: () => query(workspace),
  });
}
