import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise, type Store } from "@livestore/livestore";

import { collectionLotsQuery, events, workspaceSchema } from "../src/schema.ts";

type WorkspaceStore = Store<typeof workspaceSchema>;

void test("offline additions to the same Holding are additive", async () => {
  await withStore("additive", (store) => {
    addCopies(store, { additionId: "addition-one", lotId: "lot-one", quantity: 2 });
    addCopies(store, { additionId: "addition-two", lotId: "lot-two", quantity: 3 });

    assert.deepEqual(readLots(store), [
      { id: "lot-one", printingId: "missing-printing", quantity: 5 },
    ]);
  });
});

void test("a synchronized order yields the same lots and Holding quantities", async () => {
  const first = await replay("collection-replay-one");
  const second = await replay("collection-replay-two");

  assert.deepEqual(second, first);
  assert.deepEqual(first, [{ id: "lot-three", printingId: "missing-printing", quantity: 11 }]);
});

void test("changing a Holding key merges into an existing unattributed Holding", async () => {
  await withStore("merge", (store) => {
    addCopies(store, { additionId: "addition-source", lotId: "lot-source", quantity: 4 });
    addCopies(store, {
      additionId: "addition-target",
      condition: "lightly-played",
      lotId: "lot-target",
      quantity: 3,
    });
    changeLot(store, {
      changeId: "change-source",
      condition: "lightly-played",
      lotId: "lot-source",
      quantity: 6,
    });

    assert.deepEqual(readLots(store), [
      { id: "lot-target", printingId: "missing-printing", quantity: 9 },
    ]);
  });
});

void test("a stale edit cannot resurrect a removed lot", async () => {
  await withStore("remove-stale", (store) => {
    addCopies(store, { additionId: "addition-one", lotId: "lot-one", quantity: 2 });
    store.commit(events.collectionLotRemoved({ lotId: "lot-one", removalId: "removal-one" }));
    changeLot(store, { changeId: "stale-change", lotId: "lot-one", quantity: 8 });

    assert.deepEqual(store.query(collectionLotsQuery), []);
  });
});

void test("absolute edits resolve in synchronized order", async () => {
  await withStore("absolute-edits", (store) => {
    addCopies(store, { additionId: "addition-one", lotId: "lot-one", quantity: 2 });
    changeLot(store, { changeId: "change-one", lotId: "lot-one", quantity: 5 });
    changeLot(store, { changeId: "change-two", lotId: "lot-one", quantity: 7 });

    assert.equal(store.query(collectionLotsQuery)[0]?.quantity, 7);
  });
});

void test("invalid collection event values do not enter materialized state", async () => {
  await withStore("invalid-events", (store) => {
    assert.throws(() =>
      addCopies(store, { additionId: "zero-quantity", lotId: "lot-zero", quantity: 0 }),
    );
    assert.throws(() =>
      addCopies(store, {
        additionId: "invalid-currency",
        lotId: "lot-currency",
        unitCost: { amountMinor: 100, currency: "eur" },
      }),
    );

    assert.deepEqual(store.query(collectionLotsQuery), []);
  });
});

void test("collection lots do not require a matching catalog record", async () => {
  await withStore("missing-catalog", (store) => {
    addCopies(store, {
      additionId: "addition-missing",
      lotId: "lot-missing",
      printingId: "catalog-record-does-not-exist",
      quantity: 2,
    });

    assert.equal(store.query(collectionLotsQuery)[0]?.printingId, "catalog-record-does-not-exist");
  });
});

async function replay(storeId: string) {
  const store = await openStore(storeId);
  try {
    addCopies(store, { additionId: "addition-one", lotId: "lot-one", quantity: 2 });
    addCopies(store, { additionId: "addition-two", lotId: "lot-two", quantity: 3 });
    addCopies(store, {
      additionId: "addition-three",
      condition: "lightly-played",
      lotId: "lot-three",
      quantity: 4,
    });
    changeLot(store, {
      changeId: "change-one",
      condition: "lightly-played",
      lotId: "lot-one",
      quantity: 7,
    });
    store.commit(events.collectionLotRemoved({ lotId: "lot-two", removalId: "removal-two" }));
    return readLots(store);
  } finally {
    await store.shutdownPromise();
  }
}

function addCopies(
  store: WorkspaceStore,
  input: {
    additionId: string;
    condition?: "lightly-played" | "near-mint";
    lotId: string;
    printingId?: string;
    quantity?: number;
    unitCost?: { amountMinor: number; currency: string } | null;
  },
) {
  store.commit(
    events.collectionCopiesAdded({
      additionId: input.additionId,
      lot: {
        acquiredAt: null,
        condition: input.condition ?? "near-mint",
        finish: "nonfoil",
        id: input.lotId,
        language: "en",
        locationId: null,
        notes: null,
        printingId: input.printingId ?? "missing-printing",
        quantity: input.quantity ?? 1,
        unitCost: input.unitCost ?? null,
      },
    }),
  );
}

function changeLot(
  store: WorkspaceStore,
  input: {
    changeId: string;
    condition?: "lightly-played" | "near-mint";
    lotId: string;
    quantity: number;
  },
) {
  store.commit(
    events.collectionLotChanged({
      changeId: input.changeId,
      condition: input.condition ?? "near-mint",
      finish: "nonfoil",
      language: "en",
      lotId: input.lotId,
      quantity: input.quantity,
    }),
  );
}

function readLots(store: WorkspaceStore) {
  return store
    .query(collectionLotsQuery)
    .map(({ id, printingId, quantity }) => ({ id, printingId, quantity }));
}

async function withStore(storeId: string, run: (store: WorkspaceStore) => void) {
  const store = await openStore(storeId);
  try {
    run(store);
  } finally {
    await store.shutdownPromise();
  }
}

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}
