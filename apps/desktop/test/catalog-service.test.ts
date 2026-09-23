import assert from "node:assert/strict";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createCatalogSchema } from "@mooligan/catalog/import";
import { initializePriceDatabase } from "@mooligan/catalog/prices";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import { createCatalogService } from "../electron/catalog/service.ts";

void test("catalog replacement coordinates worker reads, cancellation, visibility and Collection readiness", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-catalog-service-"));
  const catalogPath = join(directory, "cards.sqlite");
  const pricePath = join(directory, "prices.sqlite");
  const database = new DatabaseSync(catalogPath);
  createCatalogSchema(database);
  database.close();
  const prices = new DatabaseSync(pricePath);
  initializePriceDatabase(prices);
  prices.close();
  let ready = true;
  let startups = 0;
  let visibility: SpoilerVisibilitySnapshot = {
    currentDate: "2026-09-23",
    policy: "protect",
    revision: 0,
    revealedPrintingIds: [],
    revealedRootSetIds: [],
  };
  const catalog = createCatalogService({
    catalogPath,
    pricePath,
    workerUrl: new URL("../electron/catalog/query-worker.ts", import.meta.url),
    readVisibility: () => visibility,
    collection: {
      isReady: () => ready,
      workerInvalidated: () => {
        ready = false;
      },
      lots: () => {
        startups += 1;
        return [
          {
            id: "lot",
            printingId: "missing-printing",
            quantity: 2,
            finish: "nonfoil",
            condition: "near-mint",
            language: "en",
          },
        ];
      },
    },
  });
  try {
    const page = await catalog.listCollection({});
    assert.equal(page.status, "ready");
    if (page.status === "ready") assert.equal(page.page.total.copies, 2);
    assert.equal(await catalog.rootSetId("missing"), null);
    assert.equal(startups, 1, "ordinary reads reuse the worker without copying Collection lots");

    const entered = deferred();
    const finish = deferred();
    const replacing = catalog.replace(async () => {
      entered.resolve();
      await finish.promise;
    });
    await entered.promise;
    const policies: string[] = [];
    const read = catalog.read((snapshot) => {
      policies.push(snapshot.policy);
      return catalog.query("root-set", ["missing"]);
    });
    const controller = new AbortController();
    const cancelled = catalog.query("root-set", ["cancelled"], controller.signal);
    controller.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    assert.equal(startups, 1);
    assert.deepEqual(policies, [], "visibility is captured after replacement finishes");
    visibility = { ...visibility, policy: "show", revision: 1 };
    finish.resolve();
    await replacing;
    assert.equal(await read, null);
    assert.deepEqual(policies, ["show"]);
    assert.equal(startups, 2);
    assert.deepEqual(await catalog.listCollection({}), { status: "not-ready" });

    ready = true;
    const pendingCollection = catalog.listCollection({});
    ready = false;
    assert.deepEqual(await pendingCollection, { status: "not-ready" });

    await assert.rejects(
      catalog.replace(() => Promise.reject(new Error("install failed"))),
      /install failed/,
    );
    assert.equal(
      await catalog.rootSetId("missing"),
      null,
      "a failed install releases waiting queries",
    );

    await catalog.close();
    await rename(catalogPath, `${catalogPath}.saved`);
    await Promise.all([
      assert.rejects(catalog.rootSetId("missing"), /could not be read/),
      assert.rejects(catalog.rootSetId("also-missing"), /could not be read/),
    ]);
    await rename(`${catalogPath}.saved`, catalogPath);
    assert.equal(await catalog.rootSetId("missing"), null, "a failed worker can restart");
  } finally {
    await catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
