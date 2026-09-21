import assert from "node:assert/strict";
import { test } from "node:test";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise, StoreInternalsSymbol } from "@livestore/livestore";
import { Effect, Schema } from "effect";
import { workspaceBackupSchema } from "@mooligan/workspace/backup";
import {
  events,
  priceCurrencyQuery,
  readPriceCurrency,
  priceProviders,
  priceProviderPreferencesQuery,
  readEnabledPriceProviders,
  workspaceSchema,
  workspaceSyncedEventSchema,
} from "@mooligan/workspace/schema";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";

void test("price providers belong to each Workspace and survive backup restore and event replay", async () => {
  const source = await createStorePromise({
    schema: workspaceSchema,
    adapter: makeInMemoryAdapter(),
    storeId: "price-source",
  });
  const other = await createStorePromise({
    schema: workspaceSchema,
    adapter: makeInMemoryAdapter(),
    storeId: "price-other",
  });
  try {
    assert.deepEqual(
      readEnabledPriceProviders(source.query(priceProviderPreferencesQuery)),
      priceProviders.map(({ id }) => id),
    );
    for (const { id: provider } of priceProviders) {
      source.commit(events.priceProviderChanged({ provider, enabled: provider === "cardmarket" }));
    }
    assert.deepEqual(readEnabledPriceProviders(source.query(priceProviderPreferencesQuery)), [
      "cardmarket",
    ]);
    assert.equal(readEnabledPriceProviders(other.query(priceProviderPreferencesQuery)).length, 5);
    assert.equal(readPriceCurrency(other.query(priceCurrencyQuery)), "EUR");
    source.commit(events.priceCurrencyChanged({ currency: "JPY" }));
    const backup = createWorkspaceBackup(source);
    assert.equal(backup.priceCurrency, "JPY");
    Schema.decodeUnknownSync(workspaceBackupSchema)(backup);
    assert.deepEqual(backup.priceProviders, ["cardmarket"]);
    await restoreWorkspaceBackup(other, backup);
    assert.equal(readPriceCurrency(other.query(priceCurrencyQuery)), "JPY");
    assert.deepEqual(readEnabledPriceProviders(other.query(priceProviderPreferencesQuery)), [
      "cardmarket",
    ]);
    source.commit(events.priceProviderChanged({ provider: "cardmarket", enabled: false }));
    assert.deepEqual(readEnabledPriceProviders(source.query(priceProviderPreferencesQuery)), []);
    const deadline = Date.now() + 5000;
    while (!source.syncStatus().isSynced) {
      assert.ok(Date.now() < deadline, "provider change persisted locally");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const exported = await source[StoreInternalsSymbol].clientSession.leaderThread.export.pipe(
      Effect.runPromise,
    );
    const replay = await createStorePromise({
      schema: workspaceSchema,
      adapter: makeInMemoryAdapter({ importSnapshot: exported }),
      storeId: "price-replay",
    });
    try {
      assert.equal(readPriceCurrency(replay.query(priceCurrencyQuery)), "JPY");
      assert.deepEqual(readEnabledPriceProviders(replay.query(priceProviderPreferencesQuery)), []);
    } finally {
      await replay.shutdownPromise();
    }
  } finally {
    await Promise.all([source.shutdownPromise(), other.shutdownPromise()]);
  }
});

void test("synced provider changes reject invalid providers", () => {
  const decode = Schema.decodeUnknownSync(workspaceSyncedEventSchema, {
    onExcessProperty: "error",
  });
  assert.doesNotThrow(() =>
    decode({
      name: events.priceProviderChanged.name,
      args: { provider: "cardmarket", enabled: false },
    }),
  );
  assert.throws(() =>
    decode({
      name: events.priceProviderChanged.name,
      args: { provider: "unknown", enabled: false },
    }),
  );
});
