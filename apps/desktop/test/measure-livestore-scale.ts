import { performance } from "node:perf_hooks";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { SyncBackend } from "@livestore/common";
import { createStorePromise, StoreInternalsSymbol, type Store } from "@livestore/livestore";
import { SyncMessage } from "@livestore/sync-cf/common";
import {
  collectionLotsQuery,
  events,
  spoilerDecisionsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";
import type { WorkspaceBackup } from "@mooligan/workspace/backup";
import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect";

import { parseWorkspaceBackup, serializeWorkspaceBackup } from "../electron/workspace/backup.ts";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "../src/features/workspace/workspace-backup.ts";

const collectionLotCount = 100_000;
const spoilerDecisionCount = 100_000;
const repeatedEditCount = 10_000;
const eventBatchSize = 500;
const remotePageSize = 1_000;

type WorkspaceStore = Store<typeof workspaceSchema>;
type SyncEvent = Parameters<SyncBackend.SyncBackend["push"]>[0][number];

const measurements = {
  architecture: process.arch,
  backupBytes: 0,
  backupExportAndParseMilliseconds: 0,
  coldStateOpenMilliseconds: 0,
  collectionLotCount,
  eventSchema: "v1",
  initialRemotePullMilliseconds: 0,
  nodeVersion: process.version,
  oneLotMutationMilliseconds: 0,
  platform: process.platform,
  repeatedEditCount,
  repeatedEditEventlogBytesPerEvent: 0,
  repeatedEditEventlogGrowthBytes: 0,
  repeatedEditMilliseconds: 0,
  restoreMilliseconds: 0,
  spoilerDecisionCount,
};

const backup = largeBackup();
progress("opening restore target");
const store = await openLocalStore("scale-restore");

try {
  progress("restoring configured backup limits");
  const restoreStarted = performance.now();
  await restoreWorkspaceBackup(store, backup);
  measurements.restoreMilliseconds = performance.now() - restoreStarted;
  assertLargeState(store);

  const exportStarted = performance.now();
  progress("exporting and parsing backup");
  const serialized = serializeWorkspaceBackup(createWorkspaceBackup(store));
  const parsed = parseWorkspaceBackup(serialized);
  measurements.backupExportAndParseMilliseconds = performance.now() - exportStarted;
  measurements.backupBytes = Buffer.byteLength(serialized, "utf8");
  if (
    parsed.collectionLots.length !== collectionLotCount ||
    parsed.spoilers.decisions.length !== spoilerDecisionCount
  ) {
    throw new Error("The scale backup did not round trip its configured limits.");
  }

  const mutationStarted = performance.now();
  progress("measuring one-lot mutation and repeated edits");
  store.commit(
    events.collectionLotChanged({
      changeId: crypto.randomUUID(),
      condition: "near-mint",
      finish: "nonfoil",
      language: "en",
      lotId: "lot-50000",
      quantity: 2,
    }),
  );
  await waitFor(() => store.syncStatus().isSynced);
  measurements.oneLotMutationMilliseconds = performance.now() - mutationStarted;
  if (store.query(collectionLotsQuery).find(({ id }) => id === "lot-50000")?.quantity !== 2) {
    throw new Error("The one-lot scale mutation did not materialize.");
  }

  const eventlogBefore = await eventlogBytes(store);
  const repeatedEditStarted = performance.now();
  commitRepeatedEdits(store);
  await waitFor(() => store.syncStatus().isSynced);
  measurements.repeatedEditMilliseconds = performance.now() - repeatedEditStarted;
  const eventlogAfter = await eventlogBytes(store);
  measurements.repeatedEditEventlogGrowthBytes = eventlogAfter - eventlogBefore;
  measurements.repeatedEditEventlogBytesPerEvent =
    (eventlogAfter - eventlogBefore) / repeatedEditCount;

  const snapshot = await store[StoreInternalsSymbol].clientSession.leaderThread.export.pipe(
    Effect.runPromise,
  );
  progress("opening cold state snapshot");
  const coldOpenStarted = performance.now();
  const reopened = await openLocalStore("scale-cold-open", snapshot);
  try {
    assertLargeState(reopened);
    measurements.coldStateOpenMilliseconds = performance.now() - coldOpenStarted;
  } finally {
    await reopened.shutdownPromise();
  }
} finally {
  await store.shutdownPromise();
}

const remoteEvents = largeRemoteEventLog();
progress("pulling 100,000 remote events");
const remotePullStarted = performance.now();
const remoteStore = await openRemoteStore(remoteEvents);
try {
  await waitFor(() => remoteStore.query(collectionLotsQuery).length === collectionLotCount);
  measurements.initialRemotePullMilliseconds = performance.now() - remotePullStarted;
} finally {
  await remoteStore.shutdownPromise();
}

process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);

function largeBackup(): WorkspaceBackup {
  return {
    collectionLots: Array.from({ length: collectionLotCount }, (_, index) => ({
      condition: "near-mint" as const,
      finish: "nonfoil" as const,
      id: `lot-${index}`,
      language: "en" as const,
      printingId: `printing-${index}`,
      quantity: 1,
    })),
    decks: [],
    format: "mooligan-workspace",
    profile: { bannerPrintingId: null, featuredPrintingIds: [null, null, null, null] },
    spoilers: {
      decisions: Array.from({ length: spoilerDecisionCount }, (_, index) => ({
        scope: "printing" as const,
        state: "reveal" as const,
        targetId: `printing-${index}`,
      })),
      policy: "protect",
      resetGeneration: 1,
    },
    version: 5,
  };
}

function openLocalStore(storeId: string, importSnapshot?: Uint8Array<ArrayBuffer>) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}`, importSnapshot }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}

function openRemoteStore(remoteEvents: readonly SyncEvent[]) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({
      clientId: "scale-remote-client",
      sync: {
        backend: () => replayBackend(remoteEvents),
        onBackendIdMismatch: "shutdown",
        onSyncError: "ignore",
      },
    }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId: "scale-remote-pull",
  });
}

function replayBackend(remoteEvents: readonly SyncEvent[]) {
  return Effect.gen(function* () {
    const connected = yield* SubscriptionRef.make(true);
    return {
      connect: Effect.void,
      isConnected: connected,
      metadata: { description: "Scale measurement replay", name: "mooligan-scale-replay" },
      ping: Effect.void,
      pull: (cursor, options) => {
        const after = Option.match(cursor, {
          onNone: () => 0,
          onSome: ({ eventSequenceNumber }) => eventSequenceNumber,
        });
        const remaining = remoteEvents.filter(({ seqNum }) => seqNum > after);
        const pages = Array.from(
          { length: Math.ceil(remaining.length / remotePageSize) },
          (_, index) => {
            const batch = remaining
              .slice(index * remotePageSize, (index + 1) * remotePageSize)
              .map((eventEncoded) => ({ eventEncoded, metadata: Option.none() }));
            const eventsLeft = remaining.length - (index + 1) * remotePageSize;
            return {
              batch,
              pageInfo:
                eventsLeft > 0
                  ? SyncBackend.pageInfoMoreKnown(eventsLeft)
                  : SyncBackend.pageInfoNoMore,
            };
          },
        );
        const initial = Stream.fromIterable(pages);
        return options?.live === true ? Stream.concat(initial, Stream.never) : initial;
      },
      push: () => Effect.void,
      supports: { pullLive: true, pullPageInfoKnown: true },
    } satisfies SyncBackend.SyncBackend;
  });
}

function largeRemoteEventLog() {
  return Schema.decodeUnknownSync(SyncMessage.PushRequest)({
    backendId: { _tag: "None" },
    batch: Array.from({ length: collectionLotCount }, (_, index) => ({
      args: {
        additionId: `addition-${index}`,
        lot: {
          acquiredAt: null,
          condition: "near-mint",
          finish: "nonfoil",
          id: `remote-lot-${index}`,
          language: "en",
          locationId: null,
          notes: null,
          printingId: `remote-printing-${index}`,
          quantity: 1,
          unitCost: null,
        },
      },
      clientId: "scale-source-client",
      name: "v1.CollectionCopiesAdded",
      parentSeqNum: index,
      seqNum: index + 1,
      sessionId: "scale-source-session",
    })),
  }).batch;
}

function commitRepeatedEdits(store: WorkspaceStore) {
  for (let offset = 0; offset < repeatedEditCount; offset += eventBatchSize) {
    const batch = Array.from(
      { length: Math.min(eventBatchSize, repeatedEditCount - offset) },
      (_, batchIndex) =>
        events.collectionLotChanged({
          changeId: `scale-edit-${offset + batchIndex}`,
          condition: "near-mint",
          finish: "nonfoil",
          language: "en",
          lotId: "lot-50000",
          quantity: (offset + batchIndex) % 2 === 0 ? 1 : 2,
        }),
    );
    store.commit({ skipRefresh: true }, ...batch);
  }
  store.manualRefresh();
}

function assertLargeState(store: WorkspaceStore) {
  if (
    store.query(collectionLotsQuery).length !== collectionLotCount ||
    store.query(spoilerDecisionsQuery).length !== spoilerDecisionCount
  ) {
    throw new Error("The scale Workspace did not contain the expected materialized state.");
  }
}

async function eventlogBytes(store: WorkspaceStore) {
  const eventlog = await store[
    StoreInternalsSymbol
  ].clientSession.leaderThread.getEventlogData.pipe(Effect.runPromise);
  return eventlog.byteLength;
}

function progress(message: string) {
  process.stderr.write(`[scale] ${message}\n`);
}

async function waitFor(ready: () => boolean) {
  const deadline = Date.now() + 10 * 60 * 1_000;
  while (!ready()) {
    if (Date.now() >= deadline) {
      throw new Error("The large remote event log did not finish materializing.");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
