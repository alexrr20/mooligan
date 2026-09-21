import type { Store } from "@livestore/livestore";
import {
  workspaceBackupFormat,
  workspaceBackupVersion,
  type WorkspaceBackup,
  type WorkspaceBackupCollectionLot,
} from "@mooligan/workspace/backup";
import {
  collectionLotsQuery,
  decksQuery,
  deckEntriesQuery,
  events,
  initialSpoilerResetId,
  profileQuery,
  priceProviders,
  priceCurrencyQuery,
  readPriceCurrency,
  priceProviderPreferencesQuery,
  readEnabledPriceProviders,
  readProfile,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

import { materializeDecks } from "@mooligan/workspace/client/deck-state";

type WorkspaceLiveStore = Store<typeof workspaceSchema>;
type RestoreEvent =
  | ReturnType<typeof events.priceCurrencyChanged>
  | ReturnType<typeof events.priceProviderChanged>
  | ReturnType<typeof events.profileChanged>
  | ReturnType<typeof events.deckCreated>
  | ReturnType<typeof events.deckEntryAdded>
  | ReturnType<typeof events.collectionCopiesAdded>
  | ReturnType<typeof events.spoilerDecisionChanged>
  | ReturnType<typeof events.spoilerPolicyChanged>
  | ReturnType<typeof events.spoilerProtectionReset>;

const RESTORE_EVENT_BATCH_SIZE = 500;

export function createWorkspaceBackup(store: WorkspaceLiveStore): WorkspaceBackup {
  const settings = store.query(spoilerSettingsQuery);
  return {
    collectionLots: readBackupCollectionLots(store),
    decks: readBackupDecks(store),
    format: workspaceBackupFormat,
    profile: readProfile(store.query(profileQuery)),
    priceCurrency: readPriceCurrency(store.query(priceCurrencyQuery)),
    priceProviders: readEnabledPriceProviders(store.query(priceProviderPreferencesQuery)),
    spoilers: {
      decisions: readBackupDecisions(store),
      policy: settings.policy,
      resetGeneration: settings.resetGeneration,
    },
    version: workspaceBackupVersion,
  };
}

export async function restoreWorkspaceBackup(store: WorkspaceLiveStore, backup: WorkspaceBackup) {
  const restoreResetId =
    backup.spoilers.resetGeneration === 0 ? initialSpoilerResetId : crypto.randomUUID();
  let batch: RestoreEvent[] = [];

  batch.push(events.profileChanged(backup.profile));
  batch.push(events.priceCurrencyChanged({ currency: backup.priceCurrency }));
  for (const { id: provider } of priceProviders) {
    batch.push(
      events.priceProviderChanged({ provider, enabled: backup.priceProviders.includes(provider) }),
    );
  }

  batch.push(events.spoilerPolicyChanged({ policy: backup.spoilers.policy }));
  if (backup.spoilers.resetGeneration > 0) {
    batch.push(
      events.spoilerProtectionReset({
        generation: backup.spoilers.resetGeneration,
        resetId: restoreResetId,
      }),
    );
  }

  for (const { entries, ...deck } of backup.decks) {
    batch.push(events.deckCreated({ deck }));
    if (batch.length >= RESTORE_EVENT_BATCH_SIZE) {
      await commitRestoreBatch(store, batch);
      batch = [];
    }
    for (const entry of entries) {
      batch.push(events.deckEntryAdded({ deckId: deck.id, entry, updatedAt: deck.updatedAt }));
      if (batch.length >= RESTORE_EVENT_BATCH_SIZE) {
        await commitRestoreBatch(store, batch);
        batch = [];
      }
    }
  }

  for (const lot of backup.collectionLots) {
    batch.push(
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
    if (batch.length === RESTORE_EVENT_BATCH_SIZE) {
      await commitRestoreBatch(store, batch);
      batch = [];
    }
  }

  for (const decision of backup.spoilers.decisions) {
    batch.push(
      events.spoilerDecisionChanged({
        ...decision,
        decisionId: crypto.randomUUID(),
        generation: backup.spoilers.resetGeneration,
        observedDecisionId: null,
        resetId: restoreResetId,
      }),
    );
    if (batch.length === RESTORE_EVENT_BATCH_SIZE) {
      await commitRestoreBatch(store, batch);
      batch = [];
    }
  }

  await commitRestoreBatch(store, batch);
  store.manualRefresh();

  const settings = store.query(spoilerSettingsQuery);
  if (
    readPriceCurrency(store.query(priceCurrencyQuery)) !== backup.priceCurrency ||
    JSON.stringify(readEnabledPriceProviders(store.query(priceProviderPreferencesQuery))) !==
      JSON.stringify(
        priceProviders.filter(({ id }) => backup.priceProviders.includes(id)).map(({ id }) => id),
      ) ||
    JSON.stringify(readProfile(store.query(profileQuery))) !== JSON.stringify(backup.profile) ||
    JSON.stringify(readBackupDecks(store)) !== JSON.stringify(sortedDecks(backup.decks)) ||
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

async function commitRestoreBatch(store: WorkspaceLiveStore, batch: readonly RestoreEvent[]) {
  if (batch.length > 0) {
    store.commit({ skipRefresh: true }, ...batch);
    while (!store.syncStatus().isSynced) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
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

function readBackupDecks(store: WorkspaceLiveStore): WorkspaceBackup["decks"] {
  return sortedDecks(materializeDecks(store.query(decksQuery), store.query(deckEntriesQuery)));
}

function sortedDecks(decks: WorkspaceBackup["decks"]) {
  return [...decks]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((deck) => ({
      archived: deck.archived,
      createdAt: deck.createdAt,
      formatId: deck.formatId,
      id: deck.id,
      name: deck.name,
      notes: deck.notes,
      tags: deck.tags,
      updatedAt: deck.updatedAt,
      entries: [...deck.entries]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((entry) => ({
          finish: entry.finish,
          id: entry.id,
          printingId: entry.printingId,
          quantity: entry.quantity,
          section: entry.section,
        })),
    }));
}
