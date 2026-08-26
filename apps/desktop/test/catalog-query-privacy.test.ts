import assert from "node:assert/strict";
import { test } from "node:test";

import type { CatalogListPage } from "@mooligan/domain/catalog-search";
import type { SpoilerState } from "@mooligan/domain/spoilers";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";

import { catalogSearchQueryOptions } from "../src/features/search/catalog-search-query-options.ts";
import { spoilerCatalogCacheKey } from "../src/features/spoilers/spoiler-cache-key.ts";

const visibleSearch: CatalogListPage = {
  cards: [
    {
      collectorNumber: "1",
      gridImage: null,
      id: "future-printing",
      image: null,
      isDigital: false,
      name: "Account A Secret",
      rarity: "rare",
      setCode: "SEC",
      setName: "Secret Release",
      typeLine: "Creature",
    },
  ],
  hasMore: false,
  total: 1,
};
const protectedSearch: CatalogListPage = { cards: [], hasMore: false, total: 0 };
const visibleSpoilers: SpoilerState = {
  activePrintingIds: [],
  activeRootSetIds: [],
  policy: "show",
  revision: 0,
};
const protectedSpoilers: SpoilerState = {
  activePrintingIds: [],
  activeRootSetIds: [],
  policy: "protect",
  revision: 0,
};

void test("search placeholders never cross spoiler visibility contexts", async () => {
  const sameContextRequest = deferred<CatalogListPage>();
  const nextContextRequest = deferred<CatalogListPage>();
  const list: Window["catalog"]["list"] = (request) => {
    if (request?.query === "same-context") return sameContextRequest.promise;
    if (request?.query === "next-context") return nextContextRequest.promise;
    return Promise.resolve(visibleSearch);
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const visibilityA = spoilerCatalogCacheKey(visibleSpoilers);
  const visibilityB = spoilerCatalogCacheKey(protectedSpoilers);
  const initial = catalogSearchQueryOptions(
    list,
    "initial",
    false,
    false,
    false,
    false,
    false,
    undefined,
    visibilityA,
  );

  await queryClient.fetchInfiniteQuery(initial);
  const observer = new InfiniteQueryObserver(queryClient, initial);
  const stop = observer.subscribe(() => undefined);

  try {
    observer.setOptions(
      catalogSearchQueryOptions(
        list,
        "same-context",
        false,
        false,
        false,
        false,
        false,
        undefined,
        visibilityA,
      ),
    );
    assert.equal(observer.getCurrentResult().isPlaceholderData, true);
    assert.deepEqual(observer.getCurrentResult().data?.pages[0], visibleSearch);

    sameContextRequest.resolve(protectedSearch);
    await flushPromises();
    assert.equal(observer.getCurrentResult().isPlaceholderData, false);
    assert.deepEqual(observer.getCurrentResult().data?.pages[0], protectedSearch);

    observer.setOptions(
      catalogSearchQueryOptions(
        list,
        "next-context",
        false,
        false,
        false,
        false,
        false,
        undefined,
        visibilityB,
      ),
    );
    assert.equal(observer.getCurrentResult().isPlaceholderData, false);
    assert.equal(observer.getCurrentResult().data, undefined);
  } finally {
    nextContextRequest.resolve(protectedSearch);
    stop();
    queryClient.clear();
  }
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
