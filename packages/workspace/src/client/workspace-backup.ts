import type { Store } from "@livestore/livestore";
import { priceProviders } from "@mooligan/domain/market";

import { workspaceBackupFormat, workspaceBackupVersion, type WorkspaceBackup } from "../backup.ts";
import { collectionLotsQuery } from "../collection.ts";
import { deckEntriesQuery, decksQuery } from "../decks.ts";
import {
  priceCurrencyQuery,
  priceProviderPreferencesQuery,
  readEnabledPriceProviders,
  readPriceCurrency,
} from "../price-preferences.ts";
import { profileQuery, readProfile } from "../profile.ts";
import { events, workspaceSchema } from "../schema.ts";
import { initialSpoilerResetId, spoilerDecisionsQuery, spoilerSettingsQuery } from "../spoilers.ts";
import { cardTagsQuery, tagAssignmentsQuery, tagTemplatesQuery } from "../tags.ts";
import { materializeDecks } from "./deck-state.ts";
import { materializeTagTemplates } from "./tag-state.ts";

type WorkspaceLiveStore = Store<typeof workspaceSchema>;
type RestoreEvent =
  | ReturnType<typeof events.cardTagCreated>
  | ReturnType<typeof events.cardsTagged>
  | ReturnType<typeof events.tagTemplateSaved>
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
    cardTags: store.query(cardTagsQuery).map(({ deleted: _deleted, ...tag }) => tag),
    tagAssignments: store
      .query(tagAssignmentsQuery)
      .map(({ id: _id, ...assignment }) => assignment),
    tagTemplates: materializeTagTemplates(store.query(tagTemplatesQuery)),
    collectionLots: store.query(collectionLotsQuery),
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
  for (const provider of priceProviders) {
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

  for (const tag of backup.cardTags) {
    batch.push(events.cardTagCreated(tag));
    if (batch.length >= RESTORE_EVENT_BATCH_SIZE) {
      await commitRestoreBatch(store, batch);
      batch = [];
    }
  }
  const cardsByTag = new Map<string, string[]>();
  for (const { tagId, cardId } of backup.tagAssignments) {
    const cardIds = cardsByTag.get(tagId) ?? [];
    cardIds.push(cardId);
    cardsByTag.set(tagId, cardIds);
  }
  for (const [tagId, cardIds] of cardsByTag) {
    for (let offset = 0; offset < cardIds.length; offset += 10_000) {
      batch.push(
        events.cardsTagged({
          tagId,
          cardIds: cardIds.slice(offset, offset + 10_000),
          assigned: true,
        }),
      );
      if (batch.length >= RESTORE_EVENT_BATCH_SIZE) {
        await commitRestoreBatch(store, batch);
        batch = [];
      }
    }
  }
  for (const template of backup.tagTemplates) {
    batch.push(events.tagTemplateSaved(template));
    if (batch.length >= RESTORE_EVENT_BATCH_SIZE) {
      await commitRestoreBatch(store, batch);
      batch = [];
    }
  }

  for (const lot of backup.collectionLots) {
    batch.push(events.collectionCopiesAdded({ additionId: crypto.randomUUID(), lot }));
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
        priceProviders.filter((provider) => backup.priceProviders.includes(provider)),
      ) ||
    JSON.stringify(readProfile(store.query(profileQuery))) !== JSON.stringify(backup.profile) ||
    JSON.stringify(readBackupDecks(store)) !== JSON.stringify(sortedDecks(backup.decks)) ||
    !sameTagging(createWorkspaceBackup(store), backup) ||
    settings.policy !== backup.spoilers.policy ||
    settings.resetGeneration !== backup.spoilers.resetGeneration ||
    JSON.stringify(readBackupDecisions(store)) !==
      JSON.stringify(sortedDecisions(backup.spoilers.decisions)) ||
    JSON.stringify(store.query(collectionLotsQuery)) !==
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

function sameTagging(left: WorkspaceBackup, right: WorkspaceBackup) {
  function canonical(backup: WorkspaceBackup) {
    return JSON.stringify({
      tags: backup.cardTags
        .map(({ id, deckId, name, color }) => [id, deckId, name, color])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      assignments: backup.tagAssignments
        .map(({ tagId, cardId }) => [tagId, cardId])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      templates: backup.tagTemplates
        .map(({ id, name, categories }) => [
          id,
          name,
          categories.map(({ name, color }) => [name, color]),
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    });
  }
  return canonical(left) === canonical(right);
}
