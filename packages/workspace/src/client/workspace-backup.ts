import type { Store } from "@livestore/livestore";
import { Effect, Schema, Stream } from "effect";
import { priceProviders } from "@mooligan/domain/market";

import {
  workspaceBackupFormat,
  workspaceBackupVersion,
  workspaceBackupSchema,
  type WorkspaceBackup,
} from "../backup.ts";
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
  let batch: RestoreEvent[] = [];
  for (const event of restoreEvents(backup)) {
    batch.push(event);
    if (batch.length === RESTORE_EVENT_BATCH_SIZE) {
      await commitRestoreBatch(store, batch);
      batch = [];
    }
  }
  await commitRestoreBatch(store, batch);
  store.manualRefresh();
  if (!sameBackup(canonicalBackup(createWorkspaceBackup(store)), canonicalBackup(backup))) {
    throw new Error("The restored workspace state could not be verified.");
  }
}

function* restoreEvents(backup: WorkspaceBackup): Generator<RestoreEvent> {
  const restoreResetId =
    backup.spoilers.resetGeneration === 0 ? initialSpoilerResetId : crypto.randomUUID();
  yield events.profileChanged(backup.profile);
  yield events.priceCurrencyChanged({ currency: backup.priceCurrency });
  for (const provider of priceProviders) {
    yield events.priceProviderChanged({
      provider,
      enabled: backup.priceProviders.includes(provider),
    });
  }
  yield events.spoilerPolicyChanged({ policy: backup.spoilers.policy });
  if (backup.spoilers.resetGeneration > 0) {
    yield events.spoilerProtectionReset({
      generation: backup.spoilers.resetGeneration,
      resetId: restoreResetId,
    });
  }
  for (const { entries, ...deck } of backup.decks) {
    yield events.deckCreated({ deck });
    for (const entry of entries) {
      yield events.deckEntryAdded({ deckId: deck.id, entry, updatedAt: deck.updatedAt });
    }
  }
  for (const tag of backup.cardTags) yield events.cardTagCreated(tag);
  const cardsByTag = new Map<string, string[]>();
  for (const { tagId, cardId } of backup.tagAssignments) {
    const cardIds = cardsByTag.get(tagId) ?? [];
    cardIds.push(cardId);
    cardsByTag.set(tagId, cardIds);
  }
  for (const [tagId, cardIds] of cardsByTag) {
    for (let offset = 0; offset < cardIds.length; offset += 10_000) {
      yield events.cardsTagged({
        tagId,
        cardIds: cardIds.slice(offset, offset + 10_000),
        assigned: true,
      });
    }
  }
  for (const template of backup.tagTemplates) yield events.tagTemplateSaved(template);
  for (const lot of backup.collectionLots) {
    yield events.collectionCopiesAdded({ additionId: crypto.randomUUID(), lot });
  }
  for (const decision of backup.spoilers.decisions) {
    yield events.spoilerDecisionChanged({
      ...decision,
      decisionId: crypto.randomUUID(),
      generation: backup.spoilers.resetGeneration,
      observedDecisionId: null,
      resetId: restoreResetId,
    });
  }
}

async function commitRestoreBatch(store: WorkspaceLiveStore, batch: readonly RestoreEvent[]) {
  if (batch.length === 0) return;
  store.commit({ skipRefresh: true }, ...batch);
  await Effect.runPromise(
    store.syncStatusStream().pipe(
      Stream.takeUntil((status) => status.isSynced),
      Stream.runDrain,
    ),
  );
}

const sameBackup = Schema.equivalence(workspaceBackupSchema);

function canonicalBackup(backup: WorkspaceBackup): WorkspaceBackup {
  return {
    ...backup,
    priceProviders: priceProviders.filter((provider) => backup.priceProviders.includes(provider)),
    decks: sortedDecks(backup.decks),
    collectionLots: [...backup.collectionLots].sort(byId),
    cardTags: [...backup.cardTags].sort(byId),
    tagAssignments: [...backup.tagAssignments].sort(
      (a, b) => a.tagId.localeCompare(b.tagId) || a.cardId.localeCompare(b.cardId),
    ),
    tagTemplates: [...backup.tagTemplates].sort(byId),
    spoilers: {
      ...backup.spoilers,
      decisions: [...backup.spoilers.decisions].sort(
        (a, b) => a.scope.localeCompare(b.scope) || a.targetId.localeCompare(b.targetId),
      ),
    },
  };
}

function byId(a: { id: string }, b: { id: string }) {
  return a.id.localeCompare(b.id);
}

function readBackupDecisions(store: WorkspaceLiveStore) {
  return store
    .query(spoilerDecisionsQuery)
    .map(({ scope, state, targetId }) => ({ scope, state, targetId }));
}

function readBackupDecks(store: WorkspaceLiveStore): WorkspaceBackup["decks"] {
  return sortedDecks(materializeDecks(store.query(decksQuery), store.query(deckEntriesQuery)));
}

function sortedDecks(decks: WorkspaceBackup["decks"]) {
  return [...decks].sort(byId).map((deck) => ({
    ...deck,
    entries: [...deck.entries].sort(byId),
  }));
}
