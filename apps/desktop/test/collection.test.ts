import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";

import { createCollectionQuery } from "../electron/catalog/collection-query.ts";
import { WorkspaceStore } from "../electron/workspace/store.ts";

const visibility: SpoilerVisibilitySnapshot = {
  currentDate: "2026-08-21",
  policy: "protect",
  revealedPrintingIds: [],
  revealedRootSetIds: [],
  revision: 0,
};

void test("collection mutations merge Holding collisions and preserve the target lot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-collection-store-"));

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    const first = store.addCollectionHolding({
      condition: "near-mint",
      finish: "foil",
      language: "en",
      printingId: "printing-1",
      quantity: 2,
    });
    const repeated = store.addCollectionHolding({
      condition: "near-mint",
      finish: "foil",
      language: "en",
      printingId: "printing-1",
      quantity: 3,
    });

    assert.equal(repeated.lotId, first.lotId);
    assert.equal(repeated.holdingQuantity, 5);

    const target = store.addCollectionHolding({
      condition: "lightly-played",
      finish: "foil",
      language: "en",
      printingId: "printing-1",
      quantity: 4,
    });
    const merged = store.updateCollectionHolding({
      condition: "lightly-played",
      finish: "foil",
      language: "en",
      lotId: first.lotId,
      quantity: 6,
    });

    assert.equal(merged.lotId, target.lotId);
    assert.equal(merged.holdingQuantity, 10);
    assert.equal(store.readCollectionLot(first.lotId), null);
    assert.equal(store.readCollectionLots().length, 1);

    store.removeCollectionHolding(target.lotId);
    assert.deepEqual(store.readCollectionLots(), []);
    assert.throws(() => store.removeCollectionHolding(target.lotId), /cannot be removed/);
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("collection reads separate visible, protected, and unavailable Holdings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-collection-query-"));
  const catalogPath = join(directory, "catalog.sqlite");

  try {
    const store = new WorkspaceStore(join(directory, "workspace.sqlite"));
    store.addCollectionHolding({
      condition: "near-mint",
      finish: "nonfoil",
      language: "en",
      printingId: "visible-printing",
      quantity: 2,
    });
    store.addCollectionHolding({
      condition: "near-mint",
      finish: "foil",
      language: "ja",
      printingId: "future-printing",
      quantity: 3,
    });
    store.addCollectionHolding({
      condition: "damaged",
      finish: "etched",
      language: "de",
      printingId: "missing-printing",
      quantity: 4,
    });

    const database = new DatabaseSync(catalogPath);
    database.exec(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        set_code TEXT NOT NULL,
        set_name TEXT NOT NULL,
        collector_number TEXT NOT NULL,
        root_set_id TEXT NOT NULL,
        effective_released_at TEXT,
        json TEXT NOT NULL CHECK (json_valid(json))
      ) STRICT;
    `);
    const insert = database.prepare(
      `INSERT INTO cards
       (id, identity_id, name, set_code, set_name, collector_number, root_set_id,
        effective_released_at, json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      "visible-printing",
      "card-visible",
      "Visible Card",
      "vis",
      "Visible Set",
      "1",
      "visible-set",
      "2026-01-01",
      JSON.stringify({
        digital: false,
        finishes: ["nonfoil", "foil"],
        image_uris: {
          grid: "https://cards.scryfall.io/grid/front/test.webp",
          thumb: "https://cards.scryfall.io/thumb/front/test.webp",
        },
      }),
    );
    insert.run(
      "future-printing",
      "card-future",
      "Secret Card",
      "fut",
      "Future Set",
      "2",
      "future-set",
      "2026-10-01",
      JSON.stringify({ digital: false, finishes: ["foil"] }),
    );
    database.prepare("ATTACH DATABASE ? AS workspace").run(store.databasePath);
    database.exec("PRAGMA query_only = ON");

    const list = createCollectionQuery(database);
    const page = list({}, visibility);

    assert.equal(page.total.copies, 6);
    assert.equal(page.total.cards, 2);
    assert.equal(page.total.holdings, 2);
    assert.equal(page.protectedCopies, 3);
    assert.deepEqual(
      page.holdings.map(({ status, quantity }) => ({ quantity, status })),
      [
        { quantity: 2, status: "visible" },
        { quantity: 4, status: "unavailable" },
        { quantity: 3, status: "protected" },
      ],
    );
    const visible = page.holdings[0];
    assert.equal(visible?.status, "visible");
    if (visible?.status === "visible") {
      assert.equal(visible.name, "Visible Card");
      assert.deepEqual(visible.availableFinishes, ["nonfoil", "foil"]);
      assert.deepEqual(visible.gridImage, {
        faceIndex: 0,
        printingId: "visible-printing",
        size: "grid",
      });
      assert.ok(visible.editableLotId);
    }
    const protectedHolding = page.holdings[2];
    assert.deepEqual(protectedHolding, {
      label: "Protected preview",
      quantity: 3,
      routePrintingId: "future-printing",
      status: "protected",
    });

    const filtered = list({ query: "visible" }, visibility);
    assert.equal(filtered.filtered.copies, 2);
    assert.equal(filtered.filtered.holdings, 1);
    assert.deepEqual(
      filtered.holdings.map(({ status }) => status),
      ["visible", "protected"],
    );
    assert.equal(list({ setCode: "VIS" }, visibility).filtered.copies, 2);
    assert.equal(list({ finish: "nonfoil" }, visibility).filtered.copies, 2);
    assert.equal(list({ language: "de" }, visibility).filtered.copies, 4);
    assert.equal(list({ condition: "damaged" }, visibility).filtered.holdings, 1);
    assert.deepEqual(
      list({ sort: "quantity" }, visibility).holdings.map(({ status, quantity }) => ({
        quantity,
        status,
      })),
      [
        { quantity: 4, status: "unavailable" },
        { quantity: 2, status: "visible" },
        { quantity: 3, status: "protected" },
      ],
    );
    const firstBatch = list({ limit: 1 }, visibility);
    const secondBatch = list({ limit: 1, offset: 1 }, visibility);
    assert.equal(firstBatch.hasMore, true);
    assert.equal(firstBatch.holdings[0]?.status, "visible");
    assert.equal(secondBatch.holdings[0]?.status, "unavailable");

    database.close();
    store.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
