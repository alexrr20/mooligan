import type { Store } from "@livestore/livestore";
import {
  collectionLotsQuery,
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
    collectionLots: readBackupCollectionLots(store),
    decks: legacy.decks,
    format: "mooligan-workspace",
    preferences: { motion: legacy.motion, spoilerPolicy: settings.policy },
    spoilerDecisions: readBackupDecisions(store),
    version: 2,
  };
}

export function restoreWorkspaceBackup(store: WorkspaceStore, backup: WorkspaceBackup) {
  for (const { value: lot } of backup.collectionLots) {
    store.commit(
      { skipRefresh: true },
      events.collectionCopiesAdded({
        additionId: crypto.randomUUID(),
        lot: {
          acquiredAt: lot.acquiredAt ?? null,
          condition: lot.condition,
          finish: lot.finish,
          id: lot.id,
          language: lot.language,
          locationId: lot.locationId ?? null,
          notes: lot.notes ?? null,
          printingId: lot.printingId,
          quantity: lot.quantity,
          unitCost: lot.unitCost ?? null,
        },
      }),
    );
  }
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
      JSON.stringify(sortedDecisions(backup.spoilerDecisions)) ||
    JSON.stringify(readBackupCollectionLots(store)) !==
      JSON.stringify(sortedCollectionLots(backup.collectionLots))
  ) {
    throw new Error("The restored workspace state could not be verified.");
  }
}

function readBackupCollectionLots(store: WorkspaceStore): WorkspaceBackup["collectionLots"] {
  return store.query(collectionLotsQuery).map((row) => {
    const value: WorkspaceBackup["collectionLots"][number]["value"] = {
      condition: row.condition,
      finish: row.finish,
      id: row.id,
      language: row.language,
      printingId: row.printingId,
      quantity: row.quantity,
    };
    if (row.acquiredAt !== null) value.acquiredAt = row.acquiredAt;
    if (row.locationId !== null) value.locationId = row.locationId;
    if (row.notes !== null) value.notes = row.notes;
    if (row.unitCostAmountMinor !== null && row.unitCostCurrency !== null) {
      value.unitCost = {
        amountMinor: row.unitCostAmountMinor,
        currency: row.unitCostCurrency,
      };
    }
    return { id: value.id, value };
  });
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

function sortedCollectionLots(lots: WorkspaceBackup["collectionLots"]) {
  return [...lots].sort((left, right) => left.id.localeCompare(right.id));
}
