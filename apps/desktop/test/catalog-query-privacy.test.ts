import assert from "node:assert/strict";
import { test } from "node:test";

import type { CatalogPrintingResult, SpoilerState } from "@mooligan/domain/spoilers";
import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";

import type { CatalogListPage, CatalogUpcomingPrintingPage } from "../electron/catalog/query.ts";
import { catalogCardDetailQueryOptions } from "../src/features/cards/use-card-detail.ts";
import { catalogSearchQueryOptions } from "../src/features/search/use-catalog-search.ts";
import { catalogUpcomingPrintingsQueryOptions } from "../src/features/search/use-catalog-upcoming-printings.ts";
import {
  spoilerCatalogCacheKey,
  spoilerStateQueryKey,
  subscribeToSpoilerState,
} from "../src/features/spoilers/use-spoilers.ts";

const visibleDetail: CatalogPrintingResult = {
  detail: {
    card: {
      colorIdentity: [],
      faces: [{ name: "Account A Secret", typeLine: "Creature" }],
      hasSharedIdentity: false,
      id: "future-printing",
      keywords: [],
      name: "Account A Secret",
    },
    legalities: [],
    selectedPrinting: {
      collectorNumber: "1",
      id: "future-printing",
      images: [],
      isDigital: false,
      isPromo: false,
      rarity: "rare",
      setCode: "SEC",
      setName: "Secret Release",
    },
    siblingPrintings: [],
  },
  status: "visible",
  visibility: {
    reason: "global",
    release: {
      code: "sec",
      name: "Secret Release",
      nextReleaseOn: "2027-01-01",
      rootSetId: "secret-release",
      symbol: { setId: "secret-release" },
    },
  },
};

const protectedDetail: CatalogPrintingResult = {
  printingId: "future-printing",
  release: {
    code: "sec",
    name: "Secret Release",
    nextReleaseOn: "2027-01-01",
    rootSetId: "secret-release",
    symbol: { setId: "secret-release" },
  },
  releasedOn: "2027-01-01",
  status: "protected",
};

const visibleSearch: CatalogListPage = {
  cards: [
    {
      collectorNumber: "1",
      gridImage: null,
      id: "future-printing",
      image: null,
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

const visibleUpcoming: CatalogUpcomingPrintingPage = {
  hasMore: false,
  printings: [
    {
      card: visibleSearch.cards[0]!,
      release: protectedDetail.release,
      releasedOn: "2027-01-01",
      status: "visible",
    },
  ],
  total: 1,
};

const protectedUpcoming: CatalogUpcomingPrintingPage = {
  hasMore: false,
  printings: [protectedDetail],
  total: 1,
};

const accountASpoilers: SpoilerState = {
  activePrintingIds: [],
  activeRootSetIds: [],
  policy: "show",
  revision: 7,
};

const accountBSpoilers: SpoilerState = {
  activePrintingIds: [],
  activeRootSetIds: [],
  policy: "protect",
  revision: 0,
};

void test("an account switch clears visible catalog data before protected refetches", async () => {
  const oldDetailRequest = deferred<CatalogPrintingResult | null>();
  const oldSearchRequest = deferred<CatalogListPage>();
  const oldUpcomingRequest = deferred<CatalogUpcomingPrintingPage>();
  const protectedDetailRequest = deferred<CatalogPrintingResult | null>();
  const protectedSearchRequest = deferred<CatalogListPage>();
  const protectedUpcomingRequest = deferred<CatalogUpcomingPrintingPage>();
  let detailCalls = 0;
  let searchCalls = 0;
  let upcomingCalls = 0;
  const detail: Window["catalog"]["detail"] = () => {
    detailCalls += 1;
    if (detailCalls === 1) {
      return Promise.resolve(visibleDetail);
    }
    return detailCalls === 2 ? oldDetailRequest.promise : protectedDetailRequest.promise;
  };
  const list: Window["catalog"]["list"] = () => {
    searchCalls += 1;
    if (searchCalls === 1) {
      return Promise.resolve(visibleSearch);
    }
    return searchCalls === 2 ? oldSearchRequest.promise : protectedSearchRequest.promise;
  };
  const upcomingPrintings: Window["catalog"]["upcomingPrintings"] = () => {
    upcomingCalls += 1;
    if (upcomingCalls === 1) {
      return Promise.resolve(visibleUpcoming);
    }
    return upcomingCalls === 2 ? oldUpcomingRequest.promise : protectedUpcomingRequest.promise;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const detailOptions = catalogCardDetailQueryOptions(detail, "future-printing");
  const searchOptions = catalogSearchQueryOptions(
    list,
    "",
    false,
    false,
    false,
    false,
    false,
    undefined,
    spoilerCatalogCacheKey(accountASpoilers),
  );
  const upcomingOptions = catalogUpcomingPrintingsQueryOptions(upcomingPrintings);

  await Promise.all([
    queryClient.fetchQuery(detailOptions),
    queryClient.fetchInfiniteQuery(searchOptions),
    queryClient.fetchInfiniteQuery(upcomingOptions),
  ]);
  queryClient.setQueryData(spoilerStateQueryKey, accountASpoilers);

  const detailObserver = new QueryObserver(queryClient, detailOptions);
  const searchObserver = new InfiniteQueryObserver(queryClient, searchOptions);
  const upcomingObserver = new InfiniteQueryObserver(queryClient, upcomingOptions);
  const stopDetail = detailObserver.subscribe(() => undefined);
  const stopSearch = searchObserver.subscribe(() => undefined);
  const stopUpcoming = upcomingObserver.subscribe(() => undefined);
  let notifySpoilerChange: ((state: SpoilerState) => void) | undefined;
  const stopSpoilers = subscribeToSpoilerState(queryClient, {
    onChanged(callback) {
      notifySpoilerChange = callback;
      return () => {
        notifySpoilerChange = undefined;
      };
    },
  });

  try {
    assert.equal(detailObserver.getCurrentResult().data?.status, "visible");
    assert.equal(
      searchObserver.getCurrentResult().data?.pages[0]?.cards[0]?.name,
      "Account A Secret",
    );
    assert.equal(
      upcomingObserver.getCurrentResult().data?.pages[0]?.printings[0]?.status,
      "visible",
    );

    void detailObserver.refetch();
    void searchObserver.refetch();
    void upcomingObserver.refetch();
    assert.equal(detailCalls, 2);
    assert.equal(searchCalls, 2);
    assert.equal(upcomingCalls, 2);

    if (!notifySpoilerChange) {
      assert.fail("Spoiler state listener was not registered");
    }
    notifySpoilerChange(accountBSpoilers);

    assert.equal(detailCalls, 3);
    assert.equal(searchCalls, 3);
    assert.equal(upcomingCalls, 3);
    assert.equal(detailObserver.getCurrentResult().data, undefined);
    assert.equal(searchObserver.getCurrentResult().data, undefined);
    assert.equal(upcomingObserver.getCurrentResult().data, undefined);
    assert.equal(queryClient.getQueryData(detailOptions.queryKey), undefined);
    assert.equal(queryClient.getQueryData(searchOptions.queryKey), undefined);
    assert.equal(queryClient.getQueryData(upcomingOptions.queryKey), undefined);
    assert.deepEqual(queryClient.getQueryData(spoilerStateQueryKey), accountBSpoilers);

    notifySpoilerChange(accountBSpoilers);
    assert.equal(detailCalls, 3);
    assert.equal(searchCalls, 3);
    assert.equal(upcomingCalls, 3);

    oldDetailRequest.resolve(visibleDetail);
    oldSearchRequest.resolve(visibleSearch);
    oldUpcomingRequest.resolve(visibleUpcoming);
    await flushPromises();

    assert.equal(detailObserver.getCurrentResult().data, undefined);
    assert.equal(searchObserver.getCurrentResult().data, undefined);
    assert.equal(upcomingObserver.getCurrentResult().data, undefined);

    protectedDetailRequest.resolve(protectedDetail);
    protectedSearchRequest.resolve(protectedSearch);
    protectedUpcomingRequest.resolve(protectedUpcoming);
    await flushPromises();

    assert.equal(detailObserver.getCurrentResult().data?.status, "protected");
    assert.deepEqual(searchObserver.getCurrentResult().data?.pages[0], protectedSearch);
    assert.deepEqual(upcomingObserver.getCurrentResult().data?.pages[0], protectedUpcoming);

    notifySpoilerChange({ ...accountBSpoilers, revision: 1 });
    assert.equal(detailCalls, 4);
    assert.equal(searchCalls, 4);
    assert.equal(upcomingCalls, 4);
    assert.equal(detailObserver.getCurrentResult().data, undefined);
    assert.equal(searchObserver.getCurrentResult().data, undefined);
    assert.equal(upcomingObserver.getCurrentResult().data, undefined);
  } finally {
    stopSpoilers();
    stopUpcoming();
    stopSearch();
    stopDetail();
    queryClient.clear();
  }
});

void test("search placeholders never cross spoiler visibility contexts", async () => {
  const sameContextRequest = deferred<CatalogListPage>();
  const nextContextRequest = deferred<CatalogListPage>();
  const list: Window["catalog"]["list"] = (request) => {
    if (request?.query === "same-context") return sameContextRequest.promise;
    if (request?.query === "next-context") return nextContextRequest.promise;
    return Promise.resolve(visibleSearch);
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const visibilityA = spoilerCatalogCacheKey(accountASpoilers);
  const visibilityB = spoilerCatalogCacheKey(accountBSpoilers);
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
