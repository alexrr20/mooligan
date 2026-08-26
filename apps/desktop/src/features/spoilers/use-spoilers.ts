import type {
  SpoilerDecisionState,
  SpoilerPolicy,
  SpoilerRevealScope,
  SpoilerState,
} from "@mooligan/domain/spoilers";
import {
  events,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  tables,
} from "@mooligan/workspace/schema";
import { useMutation } from "@tanstack/react-query";

import { useWorkspaceStore } from "../workspace/workspace-store-context.tsx";
export { spoilerCatalogCacheKey } from "./spoiler-cache-key.ts";

type SpoilerAction =
  | { policy: SpoilerPolicy; type: "set-policy" }
  | { targetId: string; type: "protect-printing" }
  | { targetId: string; type: "protect-release" }
  | { targetId: string; type: "reveal-printing" }
  | { targetId: string; type: "reveal-release" }
  | { type: "protect-all" };

export function useSpoilers() {
  const store = useWorkspaceStore();
  const query = useSpoilerState();
  const mutation = useMutation({
    mutationFn: (action: SpoilerAction) => runSpoilerAction(store, action),
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
  const store = useWorkspaceStore();
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

async function runSpoilerAction(
  store: ReturnType<typeof useWorkspaceStore>,
  action: SpoilerAction,
) {
  const settings = store.query(spoilerSettingsQuery);
  const decisions = store.query(spoilerDecisionsQuery);

  switch (action.type) {
    case "protect-all":
      store.commit(
        events.spoilerPolicyChanged({ policy: "protect" }),
        events.spoilerProtectionReset({
          generation: settings.resetGeneration + 1,
          resetId: crypto.randomUUID(),
        }),
      );
      return;
    case "protect-printing": {
      if (settings.policy === "show") {
        throw new Error('Turn off "Always show previews" before protecting one printing.');
      }
      const rootSetId = await optionalRootSetId(action.targetId);
      const current = findDecision(decisions, "printing", action.targetId);
      if (current?.state !== "reveal" && !rootSetId) {
        throw new Error("This printing is not present in the installed catalog.");
      }
      if (rootSetId && findDecision(decisions, "release", rootSetId)?.state === "reveal") {
        throw new Error("Protect this release before protecting one printing from it.");
      }
      commitDecision(store, settings, current, "printing", action.targetId, "protect");
      return;
    }
    case "protect-release": {
      if (settings.policy === "show") {
        throw new Error('Turn off "Always show previews" before protecting one release.');
      }
      const resolvedRootSetId = await optionalRootSetId(action.targetId);
      const targetId =
        resolvedRootSetId ??
        (findDecision(decisions, "release", action.targetId)?.state === "reveal"
          ? action.targetId
          : null);
      if (!targetId) {
        throw new Error("This release is not present in the installed catalog.");
      }
      commitDecision(
        store,
        settings,
        findDecision(decisions, "release", targetId),
        "release",
        targetId,
        "protect",
      );
      return;
    }
    case "reveal-printing": {
      if (!(await optionalRootSetId(action.targetId))) {
        throw new Error("This printing is not present in the installed catalog.");
      }
      commitDecision(
        store,
        settings,
        findDecision(decisions, "printing", action.targetId),
        "printing",
        action.targetId,
        "reveal",
      );
      return;
    }
    case "reveal-release": {
      const rootSetId = await optionalRootSetId(action.targetId);
      if (!rootSetId) {
        throw new Error("This release is not present in the installed catalog.");
      }
      commitDecision(
        store,
        settings,
        findDecision(decisions, "release", rootSetId),
        "release",
        rootSetId,
        "reveal",
      );
      return;
    }
    case "set-policy":
      if (settings.policy !== action.policy) {
        store.commit(events.spoilerPolicyChanged({ policy: action.policy }));
      }
  }
}

function commitDecision(
  store: ReturnType<typeof useWorkspaceStore>,
  settings: typeof tables.spoilerSettings.Type,
  current: typeof tables.spoilerDecisions.Type | undefined,
  scope: SpoilerRevealScope,
  targetId: string,
  state: SpoilerDecisionState,
) {
  if (current?.state === state) {
    return;
  }
  store.commit(
    events.spoilerDecisionChanged({
      decisionId: crypto.randomUUID(),
      generation: settings.resetGeneration,
      observedDecisionId: current?.decisionId ?? null,
      resetId: settings.resetId,
      scope,
      state,
      targetId,
    }),
  );
}

function findDecision(
  decisions: readonly (typeof tables.spoilerDecisions.Type)[],
  scope: SpoilerRevealScope,
  targetId: string,
) {
  return decisions.find((decision) => decision.scope === scope && decision.targetId === targetId);
}

async function optionalRootSetId(targetId: string) {
  try {
    return await window.catalog.resolveRootSetId(targetId);
  } catch {
    return null;
  }
}
