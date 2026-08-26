import type { Store } from "@livestore/livestore";
import {
  workspaceBackupFormat,
  workspaceBackupVersion,
  type WorkspaceBackup,
  type WorkspaceBackupCollectionLot,
} from "@mooligan/workspace/backup";
import {
  collectionLotsQuery,
  events,
  initialSpoilerResetId,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

type WorkspaceLiveStore = Store<typeof workspaceSchema>;
type RestoreEvent =
  | ReturnType<typeof events.collectionCopiesAdded>
  | ReturnType<typeof events.spoilerDecisionChanged>
  | ReturnType<typeof events.spoilerPolicyChanged>
  | ReturnType<typeof events.spoilerProtectionReset>;

const RESTORE_EVENT_BATCH_SIZE = 500;

export function createWorkspaceBackup(store: WorkspaceLiveStore): WorkspaceBackup {
  const settings = store.query(spoilerSettingsQuery);
  return {
    collectionLots: readBackupCollectionLots(store),
    format: workspaceBackupFormat,
    spoilers: {
      decisions: readBackupDecisions(store),
      policy: settings.policy,
      resetGeneration: settings.resetGeneration,
    },
    version: workspaceBackupVersion,
  };
}

export function restoreWorkspaceBackup(store: WorkspaceLiveStore, backup: WorkspaceBackup) {
  const restoreResetId =
    backup.spoilers.resetGeneration === 0 ? initialSpoilerResetId : crypto.randomUUID();
  let batch: RestoreEvent[] = [];
  const enqueue = (event: RestoreEvent) => {
    batch.push(event);
    if (batch.length === RESTORE_EVENT_BATCH_SIZE) {
      commitRestoreBatch(store, batch);
      batch = [];
    }
  };

  enqueue(events.spoilerPolicyChanged({ policy: backup.spoilers.policy }));
  if (backup.spoilers.resetGeneration > 0) {
    enqueue(
      events.spoilerProtectionReset({
        generation: backup.spoilers.resetGeneration,
        resetId: restoreResetId,
      }),
    );
  }

  for (const lot of backup.collectionLots) {
    enqueue(
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

  for (const decision of backup.spoilers.decisions) {
    enqueue(
      events.spoilerDecisionChanged({
        ...decision,
        decisionId: crypto.randomUUID(),
        generation: backup.spoilers.resetGeneration,
        observedDecisionId: null,
        resetId: restoreResetId,
      }),
    );
  }

  commitRestoreBatch(store, batch);
  store.manualRefresh();

  const settings = store.query(spoilerSettingsQuery);
  if (
    settings.policy !== backup.spoilers.policy ||
    settings.resetGeneration !== backup.spoilers.resetGeneration ||
    JSON.stringify(readBackupDecisions(store)) !==
      JSON.stringify(sortedDecisions(backup.spoilers.decisions)) ||
    JSON.stringify(readBackupCollectionLots(store)) !==
      JSON.stringify(sortedCollectionLots(backup.collectionLots))
  ) {
    throw new Error("The restored workspace state could not be verified.");
  }
}

function commitRestoreBatch(store: WorkspaceLiveStore, batch: readonly RestoreEvent[]) {
  if (batch.length > 0) {
    store.commit({ skipRefresh: true }, ...batch);
  }
}

function readBackupCollectionLots(store: WorkspaceLiveStore): WorkspaceBackup["collectionLots"] {
  return store.query(collectionLotsQuery).map((row) => {
    const lot: WorkspaceBackupCollectionLot = {
      acquiredAt: row.acquiredAt ?? undefined,
      condition: row.condition,
      finish: row.finish,
      id: row.id,
      language: row.language,
      locationId: row.locationId ?? undefined,
      notes: row.notes ?? undefined,
      printingId: row.printingId,
      quantity: row.quantity,
      unitCost:
        row.unitCostAmountMinor !== null && row.unitCostCurrency !== null
          ? {
              amountMinor: row.unitCostAmountMinor,
              currency: row.unitCostCurrency,
            }
          : undefined,
    };
    return lot;
  });
}

function readBackupDecisions(store: WorkspaceLiveStore) {
  return store
    .query(spoilerDecisionsQuery)
    .map(({ scope, state, targetId }) => ({ scope, state, targetId }));
}

function sortedDecisions(decisions: WorkspaceBackup["spoilers"]["decisions"]) {
  return [...decisions].sort(
    (left, right) =>
      left.scope.localeCompare(right.scope) || left.targetId.localeCompare(right.targetId),
  );
}

function sortedCollectionLots(lots: WorkspaceBackup["collectionLots"]) {
  return [...lots].sort((left, right) => left.id.localeCompare(right.id));
}
