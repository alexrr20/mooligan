import assert from "node:assert/strict";
import { test } from "node:test";

import { QueryClient } from "@tanstack/react-query";

import { subscribeToCollectionChanges } from "../src/features/collection/collection-cache.ts";

void test("collection changes invalidate cached pages while the route is unmounted", () => {
  const queryClient = new QueryClient();
  const queryKey = ["collection", "visible", {}] as const;
  let notify: (() => void) | undefined;
  let stopped = false;
  queryClient.setQueryData(queryKey, { holdings: [] });

  const stop = subscribeToCollectionChanges(queryClient, {
    onChanged(callback) {
      notify = callback;
      return () => {
        stopped = true;
      };
    },
  });

  assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, false);
  notify?.();
  assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, true);

  stop();
  assert.equal(stopped, true);
});
