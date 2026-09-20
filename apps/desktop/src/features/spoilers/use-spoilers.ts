import type { SpoilerPolicy, SpoilerState } from "@mooligan/domain/spoilers";
import { spoilerDecisionsQuery, spoilerSettingsQuery } from "@mooligan/workspace/schema";
import { useMutation } from "@tanstack/react-query";

import { useWorkspaceLiveStore } from "../workspace/workspace-store-context.tsx";
import { runSpoilerAction, type SpoilerAction } from "@mooligan/workspace/client/spoiler-actions";
export { spoilerCatalogCacheKey } from "./spoiler-cache-key.ts";

export function useSpoilers() {
  const store = useWorkspaceLiveStore();
  const query = useSpoilerState();
  const mutation = useMutation({
    mutationFn: (action: SpoilerAction) => runSpoilerAction(store, action, optionalRootSetId),
  });

  return {
    busy: mutation.isPending,
    error: mutation.error,
    loading: false,
    protectAll: () => mutation.mutate({ type: "protect-all" }),
    protectPrinting: (printingId: string) =>
      mutation.mutate({ targetId: printingId, type: "protect-printing" }),
    protectRelease: (setId: string) =>
      mutation.mutate({ targetId: setId, type: "protect-release" }),
    revealPrinting: (printingId: string) =>
      mutation.mutate({ targetId: printingId, type: "reveal-printing" }),
    revealRelease: (setId: string) => mutation.mutate({ targetId: setId, type: "reveal-release" }),
    setPolicy: (policy: SpoilerPolicy) => mutation.mutate({ policy, type: "set-policy" }),
    state: query.state,
  };
}

export function useSpoilerState() {
  const store = useWorkspaceLiveStore();
  const settings = store.useQuery(spoilerSettingsQuery);
  const decisions = store.useQuery(spoilerDecisionsQuery);
  const reveals = decisions.filter(({ state }) => state === "reveal");

  return {
    error: null,
    loading: false,
    state: {
      activePrintingIds: reveals
        .filter(({ scope }) => scope === "printing")
        .map(({ targetId }) => targetId),
      activeRootSetIds: reveals
        .filter(({ scope }) => scope === "release")
        .map(({ targetId }) => targetId),
      policy: settings.policy,
      revision: settings.resetGeneration,
    } satisfies SpoilerState,
  };
}

async function optionalRootSetId(targetId: string) {
  try {
    return await window.catalog.resolveRootSetId(targetId);
  } catch {
    return null;
  }
}
