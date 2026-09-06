import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import type { CollectionLot } from "@mooligan/domain/collection";

import {
  createCollectionProjection,
  parseCollectionProjectionWorkerRequest,
} from "../electron/catalog/collection-projection.ts";
import { CollectionProjection } from "../electron/collection/projection.ts";
import { diffCollectionLots } from "../src/features/workspace/collection-projection-diff.ts";

const workspaceId = "b279410a-a855-4ee4-8827-51e4ca39770a";

void test("Holding edits and removals send valid catalog worker deltas without reconnecting", async () => {
  const projected = new Map<string, CollectionLot>();
  const projection = new CollectionProjection(() => workspaceId, {
    applyDelta: (delta) => {
      const request = parseCollectionProjectionWorkerRequest({
        id: 1,
        operation: { ...delta, type: "collection-projection-apply" },
      });
      assert.ok(request, "The catalog worker must accept the collection delta.");
      assert.equal(request.operation.type, "collection-projection-apply");
      if (request.operation.type !== "collection-projection-apply") assert.fail();
      for (const lotId of request.operation.deletedLotIds) projected.delete(lotId);
      for (const lot of request.operation.upserts) projected.set(lot.id, lot);
      return Promise.resolve();
    },
    replace: (lots) => {
      projected.clear();
      for (const lot of lots) projected.set(lot.id, lot);
      return Promise.resolve();
    },
  });
  const connection = await projection.connect(7, workspaceId);
  const first = lot("lot-one", 2);

  assert.deepEqual(await projection.replace(7, { ...connection, lots: [first], revision: 1 }), {
    revision: 1,
    status: "applied",
  });
  assert.equal(projection.isReady(), true);
  assert.deepEqual(projection.lots(), [first]);

  const changed = lot("lot-one", 5);
  assert.deepEqual(
    await projection.apply(7, {
      ...connection,
      deletedLotIds: [],
      revision: 2,
      upserts: [changed],
    }),
    { revision: 2, status: "applied" },
  );
  assert.deepEqual([...projected.values()], [changed]);
  assert.deepEqual(projection.lots(), [changed]);

  assert.deepEqual(
    await projection.apply(7, {
      ...connection,
      deletedLotIds: [changed.id],
      revision: 3,
      upserts: [],
    }),
    { revision: 3, status: "applied" },
  );
  assert.deepEqual([...projected.values()], []);
  assert.deepEqual(projection.lots(), []);
  assert.equal(projection.isReady(), true);
});

void test("a revision gap clears collection state and requires a full replacement", async () => {
  let resyncs = 0;
  const projection = new CollectionProjection(() => workspaceId, {
    onResyncRequired: () => {
      resyncs += 1;
    },
  });
  const connection = await projection.connect(7, workspaceId);
  await projection.replace(7, { ...connection, lots: [lot("lot-one", 2)], revision: 1 });

  assert.deepEqual(
    await projection.apply(7, {
      ...connection,
      deletedLotIds: ["lot-one"],
      revision: 3,
      upserts: [],
    }),
    { status: "resync-required" },
  );
  assert.equal(projection.isReady(), false);
  assert.deepEqual(projection.lots(), []);

  projection.workerInvalidated();
  assert.equal(resyncs, 1);
});

void test("an interrupted projection update cannot publish partial temporary state", async () => {
  const projected = new Map<string, CollectionLot>();
  let rejectUpdate: ((error: Error) => void) | undefined;
  const projection = new CollectionProjection(() => workspaceId, {
    applyDelta: () =>
      new Promise<void>((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    replace: (lots) => {
      projected.clear();
      for (const lot of lots) projected.set(lot.id, lot);
      return Promise.resolve();
    },
  });
  const connection = await projection.connect(7, workspaceId);
  const confirmed = lot("lot-one", 2);
  await projection.replace(7, { ...connection, lots: [confirmed], revision: 1 });

  const updating = projection.apply(7, {
    ...connection,
    deletedLotIds: [],
    revision: 2,
    upserts: [lot("lot-one", 9)],
  });
  assert.ok(rejectUpdate);
  rejectUpdate(new Error("catalog worker stopped"));
  await assert.rejects(updating, /catalog worker stopped/u);
  projection.rejectInvalidUpdate(7);

  assert.deepEqual([...projected.values()], []);
  assert.equal(projection.isReady(), false);
  assert.deepEqual(projection.lots(), []);
});

void test("renderer replacement and workspace mismatch cannot expose stale lots", async () => {
  let activeWorkspaceId = workspaceId;
  const projection = new CollectionProjection(() => activeWorkspaceId);
  const connection = await projection.connect(7, workspaceId);
  await projection.replace(7, { ...connection, lots: [lot("lot-one", 2)], revision: 1 });

  projection.rendererReplaced(7);
  assert.equal(projection.isReady(), false);
  assert.deepEqual(projection.lots(), []);

  activeWorkspaceId = "bc8c0163-45d2-4d77-ad5e-354d514b6c3b";
  await assert.rejects(projection.connect(8, workspaceId), /active workspace changed/u);
  assert.equal(projection.isReady(), false);
});

void test("a Workspace switch clears accepted collection state before the prior Workspace returns", async () => {
  let activeWorkspaceId = workspaceId;
  const projection = new CollectionProjection(() => activeWorkspaceId);
  const connection = await projection.connect(7, workspaceId);
  await projection.replace(7, {
    ...connection,
    lots: [lot("lot-one", 2)],
    revision: 1,
  });

  activeWorkspaceId = "bc8c0163-45d2-4d77-ad5e-354d514b6c3b";
  await projection.workspaceChanged();
  activeWorkspaceId = workspaceId;

  assert.equal(projection.isReady(), false);
  assert.deepEqual(projection.lots(), []);
});

void test("the catalog projection uses temporary tables with a read-only catalog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-collection-projection-"));
  const path = join(directory, "catalog.sqlite");
  try {
    const writable = new DatabaseSync(path);
    writable.exec("CREATE TABLE catalog_meta (singleton INTEGER PRIMARY KEY) STRICT");
    writable.close();

    const database = new DatabaseSync(path, { readOnly: true });
    try {
      const projection = createCollectionProjection(database);
      projection.replace([lot("lot-one", 2), lot("lot-two", 3)]);
      projection.apply({ deletedLotIds: ["lot-one"], upserts: [lot("lot-two", 7)] });

      assert.deepEqual(
        database
          .prepare("SELECT id, quantity FROM collection_lots ORDER BY id")
          .all()
          .map((row) => ({ ...row })),
        [{ id: "lot-two", quantity: 7 }],
      );
      assert.throws(
        () => database.exec("CREATE TABLE durable_write (id INTEGER) STRICT"),
        /readonly/u,
      );
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("100,000 lots and a one-lot delta stay within the projection budget", () => {
  const database = new DatabaseSync(":memory:");
  try {
    const projection = createCollectionProjection(database);
    const lots = Array.from({ length: 100_000 }, (_, index) =>
      lot(`lot-${String(index).padStart(6, "0")}`, 1),
    );
    const replacementStarted = performance.now();
    projection.replace(lots);
    const replacementMilliseconds = performance.now() - replacementStarted;

    const deltaStarted = performance.now();
    const nextLots = lots.with(50_000, lot("lot-050000", 2));
    const delta = diffCollectionLots(lots, nextLots);
    projection.apply(delta);
    const deltaMilliseconds = performance.now() - deltaStarted;

    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM collection_lots").get()?.count,
      100_000,
    );
    assert.ok(replacementMilliseconds < 15_000, `${replacementMilliseconds}ms replacement`);
    assert.ok(deltaMilliseconds < 1_000, `${deltaMilliseconds}ms delta`);
    assert.deepEqual(delta, { deletedLotIds: [], upserts: [lot("lot-050000", 2)] });
  } finally {
    database.close();
  }
});

function lot(id: string, quantity: number): CollectionLot {
  return {
    condition: "near-mint",
    finish: "nonfoil",
    id,
    language: "en",
    printingId: `printing-${id}`,
    quantity,
  };
}
