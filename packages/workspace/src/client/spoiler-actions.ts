import type { Store } from "@livestore/livestore";
import type {
  SpoilerDecisionState,
  SpoilerPolicy,
  SpoilerRevealScope,
} from "@mooligan/domain/spoilers";

import { events, tables, workspaceSchema } from "../schema.ts";
import { spoilerDecisionsQuery, spoilerSettingsQuery } from "../spoilers.ts";

export type SpoilerAction =
  | { policy: SpoilerPolicy; type: "set-policy" }
  | { targetId: string; type: "protect-printing" }
  | { targetId: string; type: "protect-release" }
  | { targetId: string; type: "reveal-printing" }
  | { targetId: string; type: "reveal-release" }
  | { type: "protect-all" };

export async function runSpoilerAction(
  store: Store<typeof workspaceSchema>,
  action: SpoilerAction,
  resolveRootSetId: (targetId: string) => Promise<string | null>,
) {
  const startedSettings = store.query(spoilerSettingsQuery);

  switch (action.type) {
    case "protect-all":
      store.commit(
        events.spoilerPolicyChanged({ policy: "protect" }),
        events.spoilerProtectionReset({
          generation: startedSettings.resetGeneration + 1,
          resetId: crypto.randomUUID(),
        }),
      );
      return;
    case "protect-printing": {
      const rootSetId = await resolveRootSetId(action.targetId);
      const { decisions, settings } = readSpoilerActionState(store);
      if (settings.policy === "show") {
        throw new Error('Turn off "Always show previews" before protecting one printing.');
      }
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
      const resolvedRootSetId = await resolveRootSetId(action.targetId);
      const { decisions, settings } = readSpoilerActionState(store);
      if (settings.policy === "show") {
        throw new Error('Turn off "Always show previews" before protecting one release.');
      }
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
      if (!(await resolveRootSetId(action.targetId))) {
        throw new Error("This printing is not present in the installed catalog.");
      }
      const { decisions, settings } = readSpoilerActionState(store);
      assertResetUnchanged(startedSettings, settings);
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
      const rootSetId = await resolveRootSetId(action.targetId);
      if (!rootSetId) {
        throw new Error("This release is not present in the installed catalog.");
      }
      const { decisions, settings } = readSpoilerActionState(store);
      assertResetUnchanged(startedSettings, settings);
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
      if (startedSettings.policy !== action.policy) {
        store.commit(events.spoilerPolicyChanged({ policy: action.policy }));
      }
  }
}

function commitDecision(
  store: Store<typeof workspaceSchema>,
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

function readSpoilerActionState(store: Store<typeof workspaceSchema>) {
  return {
    decisions: store.query(spoilerDecisionsQuery),
    settings: store.query(spoilerSettingsQuery),
  };
}

function assertResetUnchanged(
  started: typeof tables.spoilerSettings.Type,
  current: typeof tables.spoilerSettings.Type,
) {
  if (started.resetGeneration !== current.resetGeneration || started.resetId !== current.resetId) {
    throw new Error("Spoiler protection changed before this reveal completed.");
  }
}

function findDecision(
  decisions: readonly (typeof tables.spoilerDecisions.Type)[],
  scope: SpoilerRevealScope,
  targetId: string,
) {
  return decisions.find((decision) => decision.scope === scope && decision.targetId === targetId);
}
