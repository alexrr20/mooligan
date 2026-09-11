import assert from "node:assert/strict";
import { test } from "node:test";

import type { CatalogListPage } from "@mooligan/domain/catalog-search";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { CatalogQueryQueue } from "../electron/catalog/query-queue.ts";
import { readCatalogRequest } from "../src/features/catalog/catalog-request.ts";
import { globalSearchCatalogQueryOptions } from "../src/features/search/global-search-query.ts";
import { settleCatalogRequest, unwrapCatalogRequest } from "../shared/catalog-request.ts";

const emptyPage: CatalogListPage = { cards: [], hasMore: false, total: 0 };

void test("typing waits 160 ms and only dispatches the latest input", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new QueryClient();
  const reads: string[] = [];
  const options = (query: string) =>
    globalSearchCatalogQueryOptions(
      async (request) => {
        reads.push(request.query ?? "");
        return emptyPage;
      },
      query,
      "workspace",
      "protected",
      Boolean(query),
    );
  const observer = new QueryObserver(client, options("l"));
  const stop = observer.subscribe(() => undefined);
  try {
    context.mock.timers.tick(100);
    observer.setOptions(options("light"));
    context.mock.timers.tick(100);
    observer.setOptions(options("lightning bolt"));
    context.mock.timers.tick(159);
    await flush();
    assert.deepEqual(reads, []);
    context.mock.timers.tick(1);
    await flush();
    assert.deepEqual(reads, ["lightning bolt"]);
    assert.equal(observer.getCurrentResult().status, "success");

    observer.setOptions(options("dragon"));
    observer.setOptions(options(""));
    context.mock.timers.tick(160);
    await flush();
    assert.deepEqual(reads, ["lightning bolt"]);
  } finally {
    stop();
    client.clear();
  }
});

void test("obsolete searches leave the worker queue while unrelated reads and the latest search finish", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const queue = new CatalogQueryQueue();
  const first = deferred<CatalogListPage>();
  const reads: string[] = [];
  const client = new QueryClient();
  const options = (query: string) =>
    globalSearchCatalogQueryOptions(
      (request, signal) =>
        queue.run(async () => {
          reads.push(request.query ?? "");
          return request.query === "l" ? first.promise : emptyPage;
        }, signal),
      query,
      "workspace",
      "protected",
      true,
    );
  const observer = new QueryObserver(client, options("l"));
  const stop = observer.subscribe(() => undefined);
  try {
    context.mock.timers.tick(160);
    await flush();
    const detail = queue.run(async () => {
      reads.push("detail");
      return "card details";
    });
    for (const query of ["li", "light", "lightning bolt"]) {
      observer.setOptions(options(query));
      context.mock.timers.tick(160);
      await flush();
    }
    assert.deepEqual(reads, ["l"]);
    first.resolve(emptyPage);
    assert.equal(await detail, "card details");
    await flush();
    assert.deepEqual(reads, ["l", "detail", "lightning bolt"]);
    assert.equal(observer.getCurrentResult().status, "success");
  } finally {
    first.resolve(emptyPage);
    stop();
    client.clear();
  }
});

void test("worker failure clears waiting reads and the queue accepts new work", async () => {
  const queue = new CatalogQueryQueue();
  const first = deferred<string>();
  const active = queue.run(() => first.promise);
  const waiting = queue.run(async () => assert.fail("A cleared read must not run"));
  const activeFailure = assert.rejects(active, /worker stopped/);
  const waitingFailure = assert.rejects(waiting, /worker stopped/);
  await flush();
  queue.clear(new Error("worker stopped"));
  first.reject(new Error("worker stopped"));
  await Promise.all([activeFailure, waitingFailure]);
  assert.equal(await queue.run(async () => "restarted"), "restarted");

  const cancelled = new AbortController();
  const read = queue.run(async () => assert.fail("Cancelled read must not run"), cancelled.signal);
  cancelled.abort();
  await assert.rejects(read, { name: "AbortError" });
});

void test("renderer cancellation uses the same bridge request ID and ignores late results", async () => {
  const controller = new AbortController();
  const response = deferred<string>();
  const started: string[] = [];
  const cancelled: string[] = [];
  const result = readCatalogRequest(
    (id) => {
      started.push(id);
      return response.promise;
    },
    async (id) => {
      cancelled.push(id);
    },
    controller.signal,
  );
  const rejected = assert.rejects(result, { name: "AbortError" });
  controller.abort();
  response.resolve("obsolete results");
  await rejected;
  assert.equal(started.length, 1);
  assert.deepEqual(cancelled, started);

  const finished = new AbortController();
  assert.equal(
    await readCatalogRequest(
      async () => "done",
      async () => {
        assert.fail("A completed request must remove its abort listener");
      },
      finished.signal,
    ),
    "done",
  );
  finished.abort();
  await assert.rejects(
    readCatalogRequest(
      async () => {
        assert.fail("A pre-cancelled request must not cross the bridge");
      },
      async () => undefined,
      controller.signal,
    ),
    { name: "AbortError" },
  );
});

function flush() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

void test("IPC cancellations resolve normally while genuine failures still reject", async () => {
  const controller = new AbortController();
  const queue = new CatalogQueryQueue();
  const first = deferred<string>();
  const active = queue.run(() => first.promise);
  const response = settleCatalogRequest(
    () => queue.run(async () => assert.fail("Cancelled query must not execute"), controller.signal),
    controller.signal,
  );
  controller.abort();
  const cancelled = await response;
  assert.deepEqual(cancelled, { status: "cancelled" });
  assert.throws(() => unwrapCatalogRequest(cancelled), {
    name: "AbortError",
    message: "Search cancelled.",
  });
  first.resolve("done");
  await active;

  assert.deepEqual(
    unwrapCatalogRequest(
      await settleCatalogRequest(async () => ({ cards: [], hasMore: false, total: 0 })),
    ),
    emptyPage,
  );
  await assert.rejects(
    settleCatalogRequest(async () => {
      throw new Error("Unreadable catalog");
    }),
    /Unreadable catalog/,
  );
  const racedFailure = new AbortController();
  await assert.rejects(
    settleCatalogRequest(async () => {
      racedFailure.abort();
      throw new Error("Unreadable catalog");
    }, racedFailure.signal),
    /Unreadable catalog/,
  );
  assert.throws(() => unwrapCatalogRequest({}), /Invalid/);
});

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}
