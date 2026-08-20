import type { SpoilerPolicy, SpoilerState } from "@mooligan/domain/spoilers";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

export const spoilerStateQueryKey = ["spoilers", "state"] as const;

const protectedByDefault: SpoilerState = {
  activePrintingIds: [],
  activeRootSetIds: [],
  policy: "protect",
  revision: 0,
};

type SpoilerAction =
  | { policy: SpoilerPolicy; type: "set-policy" }
  | { targetId: string; type: "protect-printing" }
  | { targetId: string; type: "protect-release" }
  | { targetId: string; type: "reveal-printing" }
  | { targetId: string; type: "reveal-release" }
  | { type: "protect-all" };

type SpoilerStateEvents = Pick<Window["spoilers"], "onChanged">;

export function useSpoilers() {
  const bridge = window.spoilers;
  const queryClient = useQueryClient();
  const query = useSpoilerState();
  const mutation = useMutation({
    mutationFn: (action: SpoilerAction) => runSpoilerAction(bridge, action),
    onSuccess: (state) => updateSpoilerState(queryClient, state),
  });

  return {
    busy: mutation.isPending,
    error: query.error ?? mutation.error,
    loading: query.loading,
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
  const query = useQuery({
    queryKey: spoilerStateQueryKey,
    queryFn: () => window.spoilers.read(),
    retry: false,
    staleTime: Infinity,
  });

  return {
    error: query.error,
    loading: query.isLoading,
    state: query.data ?? protectedByDefault,
  };
}

export function spoilerCatalogCacheKey(state: SpoilerState) {
  return JSON.stringify([
    state.revision,
    state.policy,
    state.activePrintingIds,
    state.activeRootSetIds,
  ]);
}

export function subscribeToSpoilerState(
  queryClient: QueryClient,
  events: SpoilerStateEvents = window.spoilers,
) {
  return events.onChanged((state) => updateSpoilerState(queryClient, state));
}

function updateSpoilerState(queryClient: QueryClient, state: SpoilerState) {
  const previous = queryClient.getQueryData<SpoilerState>(spoilerStateQueryKey);
  queryClient.setQueryData(spoilerStateQueryKey, state);
  if (!previous || spoilerVisibilityChanged(previous, state)) {
    void queryClient.resetQueries({ queryKey: ["catalog"] });
  }
}

function spoilerVisibilityChanged(previous: SpoilerState, next: SpoilerState) {
  return (
    previous.revision !== next.revision ||
    previous.policy !== next.policy ||
    !arraysEqual(previous.activePrintingIds, next.activePrintingIds) ||
    !arraysEqual(previous.activeRootSetIds, next.activeRootSetIds)
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function runSpoilerAction(bridge: Window["spoilers"], action: SpoilerAction) {
  switch (action.type) {
    case "protect-all":
      return bridge.protectAll();
    case "protect-printing":
      return bridge.protectPrinting(action.targetId);
    case "protect-release":
      return bridge.protectRelease(action.targetId);
    case "reveal-printing":
      return bridge.revealPrinting(action.targetId);
    case "reveal-release":
      return bridge.revealRelease(action.targetId);
    case "set-policy":
      return bridge.setPolicy(action.policy);
  }
}
