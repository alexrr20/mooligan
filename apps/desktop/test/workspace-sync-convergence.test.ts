import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { SyncBackend, validatePushPayload } from "@livestore/common";
import { EventSequenceNumber } from "@livestore/common/schema";
import { createStorePromise, type Store } from "@livestore/livestore";
import { cardTagsQuery, tagTemplatesQuery } from "@mooligan/workspace/tags";
import { collectionLotsQuery } from "@mooligan/workspace/collection";
import { decksQuery, deckEntriesQuery } from "@mooligan/workspace/decks";
import { events, workspaceSchema } from "@mooligan/workspace/schema";
import { initialSpoilerResetId, spoilerDecisionsQuery } from "@mooligan/workspace/spoilers";
import {
  priceProviderPreferencesQuery,
  priceCurrencyQuery,
  readPriceCurrency,
  readEnabledPriceProviders,
} from "@mooligan/workspace/price-preferences";
import { Effect, Option, Queue, Scope, Stream, SubscriptionRef } from "effect";

type WorkspaceStore = Store<typeof workspaceSchema>;
type SyncEvent = Parameters<SyncBackend.SyncBackend["push"]>[0][number];

void test("offline tag and template name collisions converge after creation and renaming", async () => {
  await Effect.gen(function* () {
    const server = yield* makeBroadcastSyncServer();
    const first = yield* Effect.promise(() => openStore("tags-first", server));
    const second = yield* Effect.promise(() => openStore("tags-second", server));
    const snapshot = (store: WorkspaceStore) =>
      JSON.stringify([store.query(cardTagsQuery), store.query(tagTemplatesQuery)]);
    const categories = [{ name: "Draw", color: "blue" as const }];
    try {
      yield* server.disconnect;
      first.commit(
        events.cardTagCreated({ id: "first", name: "Énergie", color: "sage", deckId: null }),
        events.tagTemplateSaved({ id: "first", name: "Énergie", categories }),
      );
      second.commit(
        events.cardTagCreated({ id: "second", name: "éNERGIE", color: "rose", deckId: null }),
        events.tagTemplateSaved({ id: "second", name: "éNERGIE", categories }),
      );
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(() => server.eventCount() === 4 && snapshot(first) === snapshot(second)),
      );
      assert.equal(first.query(cardTagsQuery).length, 1);
      assert.equal(first.query(tagTemplatesQuery).length, 1);

      for (const id of ["a", "b"])
        first.commit(
          events.cardTagCreated({ id, name: id, color: "sage", deckId: null }),
          events.tagTemplateSaved({ id, name: id, categories }),
        );
      yield* Effect.promise(() => waitFor(() => second.query(tagTemplatesQuery).length === 3));
      yield* server.disconnect;
      first.commit(
        events.cardTagChanged({ id: "a", name: "Removal" }),
        events.tagTemplateSaved({ id: "a", name: "Removal", categories }),
      );
      second.commit(
        events.cardTagChanged({ id: "b", name: "REMOVAL" }),
        events.tagTemplateSaved({ id: "b", name: "REMOVAL", categories }),
      );
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(() => server.eventCount() === 12 && snapshot(first) === snapshot(second)),
      );
      for (const rows of [first.query(cardTagsQuery), first.query(tagTemplatesQuery)]) {
        assert.equal(rows.length, 3);
        assert.equal(rows.filter(({ name }) => name.toLowerCase() === "removal").length, 1);
      }
    } finally {
      yield* Effect.promise(() => Promise.all([first.shutdownPromise(), second.shutdownPromise()]));
    }
  }).pipe(Effect.scoped, Effect.runPromise);
});

void test("offline provider toggles sync independently and same-provider conflicts converge", async () => {
  await Effect.gen(function* () {
    const server = yield* makeBroadcastSyncServer();
    const first = yield* Effect.promise(() => openStore("prices-first", server));
    const second = yield* Effect.promise(() => openStore("prices-second", server));
    const enabled = (store: WorkspaceStore) =>
      readEnabledPriceProviders(store.query(priceProviderPreferencesQuery));
    try {
      yield* server.disconnect;
      first.commit(events.priceProviderChanged({ provider: "tcgplayer", enabled: false }));
      second.commit(events.priceProviderChanged({ provider: "cardkingdom", enabled: false }));
      assert.ok(enabled(first).includes("cardkingdom"));
      assert.ok(enabled(second).includes("tcgplayer"));
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(
          () => !enabled(first).includes("cardkingdom") && !enabled(second).includes("tcgplayer"),
        ),
      );
      assert.deepEqual(enabled(first), enabled(second));
      yield* server.disconnect;
      first.commit(events.priceProviderChanged({ provider: "cardmarket", enabled: false }));
      second.commit(events.priceProviderChanged({ provider: "cardmarket", enabled: true }));
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(
          () =>
            server.eventCount() === 4 &&
            JSON.stringify(enabled(first)) === JSON.stringify(enabled(second)),
        ),
      );
      assert.deepEqual(enabled(first), enabled(second));
      assert.ok(!enabled(first).includes("tcgplayer"));
      assert.ok(!enabled(first).includes("cardkingdom"));
      yield* server.disconnect;
      first.commit(events.priceCurrencyChanged({ currency: "GBP" }));
      assert.equal(readPriceCurrency(second.query(priceCurrencyQuery)), "EUR");
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(() => readPriceCurrency(second.query(priceCurrencyQuery)) === "GBP"),
      );
    } finally {
      yield* Effect.promise(() => Promise.all([first.shutdownPromise(), second.shutdownPromise()]));
    }
  }).pipe(Effect.scoped, Effect.runPromise);
});

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

void test("two offline devices converge deck cards, independent metadata and stale deletion conflicts", async () => {
  await Effect.gen(function* () {
    const server = yield* makeBroadcastSyncServer();
    const first = yield* Effect.promise(() => openStore("deck-client-first", server));
    let second: WorkspaceStore | undefined;
    const updatedAt = "2026-09-04T10:00:00.000Z";
    try {
      first.commit(
        events.deckCreated({
          deck: {
            id: "deck",
            name: "Original",
            formatId: "casual",
            notes: "",
            tags: [],
            archived: false,
            createdAt: updatedAt,
            updatedAt,
          },
        }),
      );
      yield* Effect.promise(() => waitFor(() => server.eventCount() === 1));
      second = yield* Effect.promise(() => openStore("deck-client-second", server));
      yield* Effect.promise(() => waitFor(() => second!.query(decksQuery).length === 1));
      yield* server.disconnect;
      first.commit(
        events.deckEntryAdded({
          deckId: "deck",
          entry: {
            id: "first-card",
            printingId: "printing",
            finish: "foil",
            quantity: 2,
            section: "mainboard",
          },
          updatedAt,
        }),
      );
      second.commit(
        events.deckEntryAdded({
          deckId: "deck",
          entry: {
            id: "second-card",
            printingId: "printing",
            finish: "foil",
            quantity: 3,
            section: "mainboard",
          },
          updatedAt,
        }),
      );
      first.commit(events.deckChanged({ deckId: "deck", name: "Renamed offline", updatedAt }));
      second.commit(
        events.deckChanged({
          deckId: "deck",
          notes: "Notes from another device",
          archived: true,
          updatedAt,
        }),
      );
      assert.equal(first.query(deckEntriesQuery)[0]?.quantity, 2);
      assert.equal(second.query(deckEntriesQuery)[0]?.quantity, 3);
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(
          () =>
            first.query(deckEntriesQuery)[0]?.quantity === 5 &&
            second!.query(deckEntriesQuery)[0]?.quantity === 5,
        ),
      );
      yield* Effect.promise(() =>
        waitFor(
          () =>
            first.query(decksQuery)[0]?.notes === "Notes from another device" &&
            second!.query(decksQuery)[0]?.name === "Renamed offline",
        ),
      );
      assert.deepEqual(first.query(decksQuery), second.query(decksQuery));
      assert.deepEqual(first.query(deckEntriesQuery), second.query(deckEntriesQuery));
      yield* server.disconnect;
      // The second device's original card ID must remain addressable after merging.
      second.commit(
        events.deckEntryChanged({
          deckId: "deck",
          entryId: "second-card",
          section: "sideboard",
          updatedAt,
        }),
      );
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(() => first.query(deckEntriesQuery)[0]?.section === "sideboard"),
      );
      assert.equal(first.query(deckEntriesQuery)[0]?.quantity, 5);
      yield* server.disconnect;
      first.commit(events.deckDeleted({ deckId: "deck", updatedAt }));
      second.commit(events.deckChanged({ deckId: "deck", name: "Stale name", updatedAt }));
      second.commit(
        events.deckEntryAdded({
          deckId: "deck",
          entry: {
            id: "stale-card",
            printingId: "another-printing",
            finish: "nonfoil",
            quantity: 1,
            section: "commander",
          },
          updatedAt,
        }),
      );
      yield* server.connect;
      yield* Effect.promise(() =>
        waitFor(
          () =>
            server.eventCount() === 9 &&
            first.query(decksQuery).length === 0 &&
            second!.query(decksQuery).length === 0,
        ),
      );
      assert.deepEqual(first.query(deckEntriesQuery), []);
      assert.deepEqual(second.query(deckEntriesQuery), []);
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
