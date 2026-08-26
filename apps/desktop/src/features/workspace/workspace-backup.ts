import type { Store } from "@livestore/livestore";
import {
  events,
  initialSpoilerResetId,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

import type {
  WorkspaceBackup,
  WorkspaceLegacyBackupSnapshot,
} from "../../../shared/desktop-api.ts";

type WorkspaceStore = Store<typeof workspaceSchema>;

export function createWorkspaceBackup(
  store: WorkspaceStore,
  legacy: WorkspaceLegacyBackupSnapshot,
): WorkspaceBackup {
  const settings = store.query(spoilerSettingsQuery);
  return {
    cardLists: legacy.cardLists,
    collectionLots: legacy.collectionLots,
    decks: legacy.decks,
    format: "mooligan-workspace",
    preferences: { motion: legacy.motion, spoilerPolicy: settings.policy },
    spoilerDecisions: readBackupDecisions(store),
    version: 2,
  };
}

export function restoreSpoilerBackup(store: WorkspaceStore, backup: WorkspaceBackup) {
  store.commit(
    { skipRefresh: true },
    events.spoilerPolicyChanged({ policy: backup.preferences.spoilerPolicy }),
  );
  for (const decision of backup.spoilerDecisions) {
    store.commit(
      { skipRefresh: true },
      events.spoilerDecisionChanged({
        ...decision,
        decisionId: crypto.randomUUID(),
        generation: 0,
        observedDecisionId: null,
        resetId: initialSpoilerResetId,
      }),
    );
  }
  store.manualRefresh();

  const settings = store.query(spoilerSettingsQuery);
  if (
    settings.policy !== backup.preferences.spoilerPolicy ||
    JSON.stringify(readBackupDecisions(store)) !==
      JSON.stringify(sortedDecisions(backup.spoilerDecisions))
  ) {
    throw new Error("The restored spoiler state could not be verified.");
  }
}

function readBackupDecisions(store: WorkspaceStore) {
  return store
    .query(spoilerDecisionsQuery)
    .map(({ scope, state, targetId }) => ({ scope, state, targetId }));
}

function sortedDecisions(decisions: WorkspaceBackup["spoilerDecisions"]) {
  return [...decisions].sort(
    (left, right) =>
      left.scope.localeCompare(right.scope) || left.targetId.localeCompare(right.targetId),
  );
}
