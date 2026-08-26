import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { SyncBackend, validatePushPayload } from "@livestore/common";
import { EventSequenceNumber } from "@livestore/common/schema";
import { createStorePromise, type Store } from "@livestore/livestore";
import {
  collectionLotsQuery,
  events,
  initialSpoilerResetId,
  spoilerDecisionsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";
import { Effect, Option, Queue, Scope, Stream, SubscriptionRef } from "effect";

type WorkspaceStore = Store<typeof workspaceSchema>;
type SyncEvent = Parameters<SyncBackend.SyncBackend["push"]>[0][number];

void test("two offline clients converge additive Holdings and protective spoiler decisions", async () => {
  await Effect.gen(function* () {
    const syncServer = yield* makeBroadcastSyncServer();
    const first = yield* Effect.promise(() => openStore("sync-client-first", syncServer));
    let second: WorkspaceStore | undefined;

    try {
      yield* syncServer.disconnect;
      addCopies(first, "before-sync", "lot-before-sync", 2);
      yield* syncServer.connect;
      yield* Effect.promise(() => waitFor(() => syncServer.eventCount() === 1));

      second = yield* Effect.promise(() => openStore("sync-client-second", syncServer));
      yield* Effect.promise(() => waitFor(() => holdingQuantity(second!) === 2));

      yield* syncServer.disconnect;
      addCopies(first, "addition-first", "lot-first", 2);
      addCopies(second, "addition-second", "lot-second", 3);
      changeSpoiler(first, "reveal-first", "reveal");
      changeSpoiler(second, "protect-second", "protect");
      yield* syncServer.connect;

      yield* Effect.promise(() =>
        waitFor(() => holdingQuantity(first) === 7 && holdingQuantity(second!) === 7),
      );
      yield* Effect.promise(() =>
        waitFor(() => spoilerState(first) === "protect" && spoilerState(second!) === "protect"),
      );

      yield* syncServer.disconnect;
      first.commit(events.spoilerProtectionReset({ generation: 1, resetId: "reset-first" }));
      changeSpoiler(second, "stale-reveal", "reveal");
      yield* syncServer.connect;

      yield* Effect.promise(() =>
        waitFor(
          () =>
            first.query(spoilerDecisionsQuery).length === 0 &&
            second!.query(spoilerDecisionsQuery).length === 0,
        ),
      );

      assert.equal(holdingQuantity(first), 7);
      assert.equal(holdingQuantity(second), 7);
    } finally {
      yield* Effect.promise(() =>
        Promise.all([first.shutdownPromise(), second?.shutdownPromise() ?? Promise.resolve()]),
      );
    }
  }).pipe(Effect.scoped, Effect.runPromise);
});

interface BroadcastSyncServer {
  connect: Effect.Effect<void>;
  disconnect: Effect.Effect<void>;
  eventCount: () => number;
  makeSyncBackend: Effect.Effect<SyncBackend.SyncBackend, never, Scope.Scope>;
}

const makeBroadcastSyncServer = (): Effect.Effect<BroadcastSyncServer> =>
  Effect.gen(function* () {
    const connected = yield* SubscriptionRef.make(true);
    const pushLock = yield* Effect.makeSemaphore(1);
    const subscribers = new Set<Queue.Queue<SyncEvent>>();
    const connectionWaiters = new Set<() => void>();
    let isConnected = true;
    let eventsOnServer: SyncEvent[] = [];

    const connect = Effect.sync(() => {
      isConnected = true;
      for (const resume of connectionWaiters) resume();
      connectionWaiters.clear();
    }).pipe(Effect.zipRight(SubscriptionRef.set(connected, true)));

    const disconnect = Effect.sync(() => {
      isConnected = false;
    }).pipe(Effect.zipRight(SubscriptionRef.set(connected, false)));

    const waitForConnection = Effect.suspend(() => {
      if (isConnected) return Effect.void;
      return Effect.async<void>((resume) => {
        const continuePush = () => resume(Effect.void);
        connectionWaiters.add(continuePush);
        return Effect.sync(() => connectionWaiters.delete(continuePush));
      });
    });

    const makeSyncBackend = Effect.gen(function* () {
      const liveEvents = yield* Queue.unbounded<SyncEvent>();
      subscribers.add(liveEvents);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => subscribers.delete(liveEvents)).pipe(
          Effect.zipRight(Queue.shutdown(liveEvents)),
        ),
      );

      const pull: SyncBackend.SyncBackend["pull"] = (cursor, options) => {
        const after = Option.match(cursor, {
          onNone: () => 0,
          onSome: ({ eventSequenceNumber }) => eventSequenceNumber,
        });
        const initial = Stream.fromEffect(
          Effect.sync(() => ({
            batch: eventsOnServer
              .filter(({ seqNum }) => seqNum > after)
              .map((eventEncoded) => ({ eventEncoded, metadata: Option.none() })),
            pageInfo: SyncBackend.pageInfoNoMore,
          })),
        );
        if (options?.live !== true) return initial;

        return Stream.concat(
          initial,
          Stream.fromQueue(liveEvents).pipe(
            Stream.chunks,
            Stream.map((chunk) => ({
              batch: [...chunk].map((eventEncoded) => ({
                eventEncoded,
                metadata: Option.none(),
              })),
              pageInfo: SyncBackend.pageInfoNoMore,
            })),
          ),
        );
      };

      const push: SyncBackend.SyncBackend["push"] = (batch) =>
        waitForConnection.pipe(
          Effect.zipRight(
            Effect.gen(function* () {
              const currentHead =
                eventsOnServer.at(-1)?.seqNum ?? EventSequenceNumber.Client.ROOT.global;
              yield* validatePushPayload(batch, currentHead);
              eventsOnServer = eventsOnServer.concat(batch);
              yield* Effect.forEach(subscribers, (subscriber) => Queue.offerAll(subscriber, batch));
            }),
          ),
          pushLock.withPermits(1),
        );

      return {
        connect: Effect.void,
        isConnected: connected,
        metadata: {
          description: "Broadcast synchronization backend for two-client convergence tests",
          name: "mooligan-test-sync",
        },
        ping: waitForConnection,
        pull,
        push,
        supports: { pullLive: true, pullPageInfoKnown: true },
      } satisfies SyncBackend.SyncBackend;
    });

    return { connect, disconnect, eventCount: () => eventsOnServer.length, makeSyncBackend };
  });

function openStore(clientId: string, backend: BroadcastSyncServer) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({
      clientId,
      sync: {
        backend: () => backend.makeSyncBackend,
        onBackendIdMismatch: "shutdown",
        onSyncError: "ignore",
      },
    }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId: "two-client-workspace",
  });
}

function addCopies(store: WorkspaceStore, additionId: string, lotId: string, quantity: number) {
  store.commit(
    events.collectionCopiesAdded({
      additionId,
      lot: {
        acquiredAt: null,
        condition: "near-mint",
        finish: "nonfoil",
        id: lotId,
        language: "en",
        locationId: null,
        notes: null,
        printingId: "printing-one",
        quantity,
        unitCost: null,
      },
    }),
  );
}

function changeSpoiler(store: WorkspaceStore, decisionId: string, state: "protect" | "reveal") {
  store.commit(
    events.spoilerDecisionChanged({
      decisionId,
      generation: 0,
      observedDecisionId: null,
      resetId: initialSpoilerResetId,
      scope: "printing",
      state,
      targetId: "printing-one",
    }),
  );
}

function holdingQuantity(store: WorkspaceStore) {
  return store.query(collectionLotsQuery).reduce((total, lot) => total + lot.quantity, 0);
}

function spoilerState(store: WorkspaceStore) {
  return store.query(spoilerDecisionsQuery)[0]?.state;
}

async function waitFor(ready: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!ready()) {
    if (Date.now() >= deadline) {
      throw new Error("The synchronized Workspace clients did not converge in time.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
