import assert from "node:assert/strict";
import { test } from "node:test";

import type { CollectionListPage } from "@mooligan/domain/collection";
import { QueryClient } from "@tanstack/react-query";

import {
  CollectionSearchNotReadyError,
  globalSearchCollectionQueryOptions,
} from "../src/features/search/global-search-collection-query.ts";

const emptyCollection: CollectionListPage = {
  holdings: [],
  hasMore: false,
  sets: [],
  total: { cards: 0, copies: 0, holdings: 0 },
  filtered: { cards: 0, copies: 0, holdings: 0 },
  protectedCopies: 0,
};

void test("Collection search retries a starting projection and finishes loading when ready", async () => {
  const client = new QueryClient();
  let attempts = 0;
  const options = globalSearchCollectionQueryOptions(
    async (request) => {
      assert.deepEqual(request, { query: "sol ring", limit: 4 });
      attempts += 1;
      return attempts < 3 ? { status: "not-ready" } : { status: "ready", page: emptyCollection };
    },
    "sol ring",
    "workspace",
    "protected",
    true,
  );
  try {
    assert.deepEqual(await client.fetchQuery(options), emptyCollection);
    assert.equal(attempts, 3);
    assert.equal(client.isFetching(), 0);
    assert.equal(client.getQueryState(options.queryKey)?.status, "success");
  } finally {
    client.clear();
  }
});

void test("a persistently unavailable Collection stops loading and can be retried", async () => {
  const client = new QueryClient();
  let ready = false;
  let attempts = 0;
  const options = globalSearchCollectionQueryOptions(
    async () => {
      attempts += 1;
      return ready ? { status: "ready", page: emptyCollection } : { status: "not-ready" };
    },
    "sol ring",
    "workspace",
    "protected",
    true,
  );
  try {
    await assert.rejects(client.fetchQuery(options), CollectionSearchNotReadyError);
    assert.equal(attempts, 3);
    assert.equal(client.isFetching(), 0);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");

    ready = true;
    await client.refetchQueries({ queryKey: options.queryKey });
    assert.equal(attempts, 4);
    assert.equal(client.isFetching(), 0);
    assert.deepEqual(client.getQueryData(options.queryKey), emptyCollection);
    assert.equal(client.getQueryState(options.queryKey)?.error, null);
  } finally {
    client.clear();
  }
});

void test("other Collection errors settle immediately without startup retries", async () => {
  const client = new QueryClient();
  let attempts = 0;
  const options = globalSearchCollectionQueryOptions(
    async () => {
      attempts += 1;
      throw new Error("unreadable index");
    },
    "sol ring",
    "workspace",
    "protected",
    true,
  );
  try {
    await assert.rejects(client.fetchQuery(options), /unreadable index/);
    assert.equal(attempts, 1);
    assert.equal(client.isFetching(), 0);
  } finally {
    client.clear();
  }
});
