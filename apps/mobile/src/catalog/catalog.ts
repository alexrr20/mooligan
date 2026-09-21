import { updateExchangeRates } from "@mooligan/catalog/exchange-rates";
import { AppState } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { defaultDatabaseDirectory, deleteDatabaseSync } from "expo-sqlite";
import { useSyncExternalStore } from "react";
import * as z from "zod";
import { createCatalogSchema, importCatalogData } from "@mooligan/catalog/import";
import { createCatalogDetailQuery, createCatalogImageSourceQuery } from "@mooligan/catalog/detail";
import {
  createCatalogQuery,
  createCatalogRootSetQuery,
  createCatalogUpcomingQuery,
  createCatalogUpcomingPrintingsQuery,
  createCatalogSpoilerRevealSummariesQuery,
} from "@mooligan/catalog/query";
import { createCollectionProjection } from "@mooligan/catalog/collection-projection";
import { createCollectionQuery } from "@mooligan/catalog/collection-query";
import { createCatalogVisibilityQuery } from "@mooligan/catalog/visibility";
import {
  initializePriceDatabase,
  readPrintingPrices,
  readPriceSnapshot,
  readPriceMetadata,
} from "@mooligan/catalog/prices";
import { importPriceData } from "@mooligan/catalog/price-import";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "@mooligan/domain/catalog";
import { ScryfallBulkDataSchema, ScryfallSetListSchema } from "@mooligan/domain/catalog-download";
import {
  ExchangeRatesSchema,
  type ExchangeRates,
  type PriceSnapshot,
} from "@mooligan/domain/market";
import type { CollectionLot } from "@mooligan/domain/collection";
import { openCatalogDatabase } from "./sqlite";
import { fileChunks, downloadPriceFeed } from "./download";
import { catalogLines } from "./gzip-lines";

type ReferenceSnapshot = {
  catalog: ReturnType<typeof catalogQueries>;
  snapshot: CatalogSnapshot | null;
  prices: PriceSnapshot | null;
  rates: ExchangeRates | null;
  busy: boolean;
  progress: string | null;
  error: string | null;
  revision: number;
};

function catalogQueries(database: ReturnType<typeof openCatalogDatabase>) {
  const projection = createCollectionProjection(database);
  return {
    isVisible: createCatalogVisibilityQuery(database),
    detail: createCatalogDetailQuery(database),
    image: createCatalogImageSourceQuery(database),
    list: createCatalogQuery(database),
    collection: createCollectionQuery(database),
    rootSet: createCatalogRootSetQuery(database),
    upcoming: createCatalogUpcomingQuery(database),
    upcomingPrintings: createCatalogUpcomingPrintingsQuery(database),
    reveals: createCatalogSpoilerRevealSummariesQuery(database),
    project: (lots: CollectionLot[]) => projection.replace(lots),
  };
}

class ReferenceData {
  readonly #registry = openCatalogDatabase("reference-registry.sqlite");
  readonly #prices = openCatalogDatabase("prices.sqlite");
  #database: ReturnType<typeof openCatalogDatabase>;
  #snapshot: ReferenceSnapshot;
  readonly #listeners = new Set<() => void>();
  constructor() {
    this.#registry.exec(
      "CREATE TABLE IF NOT EXISTS catalog_install (id INTEGER PRIMARY KEY CHECK(id = 1), name TEXT NOT NULL)",
    );
    initializePriceDatabase(this.#prices);
    const installed = this.#registry.prepare("SELECT name FROM catalog_install WHERE id = 1").get();
    const name = installed
      ? z.object({ name: z.string() }).parse(installed).name
      : "catalog-empty.sqlite";
    // A terminated import never becomes active. Reclaim only our abandoned reference files.
    for (const file of new Directory(defaultDatabaseDirectory).list()) {
      if (
        file instanceof File &&
        /^(catalog|prices)-[0-9a-f-]{36}\.sqlite$/.test(file.name) &&
        file.name !== name
      )
        deleteDatabaseSync(file.name);
    }
    for (const archiveName of [
      "catalog.jsonl.gz",
      "AllPricesToday.json.gz",
      "AllIdentifiers.json.gz",
    ]) {
      const archive = new File(Paths.cache, archiveName);
      if (archive.exists) archive.delete();
    }
    this.#database = openCatalogDatabase(name);
    if (
      !installed &&
      !this.#database.prepare("SELECT name FROM sqlite_master WHERE name = 'cards'").get()
    )
      createCatalogSchema(this.#database);
    this.#database.prepare("ATTACH DATABASE ? AS market_prices").run(this.#prices.path);
    const metadata = this.#database
      .prepare(
        "SELECT card_count AS cardCount, updated_at AS updatedAt FROM catalog_meta WHERE singleton = 1",
      )
      .get();
    const rates = readPriceMetadata(this.#prices, "exchange_rates");
    this.#snapshot = {
      catalog: catalogQueries(this.#database),
      snapshot: metadata ? CatalogSnapshotSchema.parse(metadata) : null,
      prices: readPriceSnapshot(this.#prices),
      rates: rates ? ExchangeRatesSchema.parse(JSON.parse(rates)) : null,
      busy: false,
      progress: null,
      error: null,
      revision: 0,
    };
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getSnapshot = () => this.#snapshot;
  prices(printingId: string) {
    return readPrintingPrices(this.#prices, printingId);
  }
  async updateCatalog() {
    if (this.#snapshot.busy) return;
    this.#set({ busy: true, error: null, progress: "Checking the card catalog…" });
    const name = `catalog-${crypto.randomUUID()}.sqlite`;
    const archive = new File(Paths.cache, "catalog.jsonl.gz");
    let incoming: ReturnType<typeof openCatalogDatabase> | undefined;
    try {
      const response = await fetch("https://api.scryfall.com/bulk-data/default_cards");
      if (!response.ok) throw new Error("The catalog download is unavailable.");
      const bulk = ScryfallBulkDataSchema.parse(await response.json());
      const setsResponse = await fetch("https://api.scryfall.com/sets");
      if (!setsResponse.ok) throw new Error("The set catalog is unavailable.");
      const sets = ScryfallSetListSchema.parse(await setsResponse.json()).data;
      this.#set({
        progress: `Downloading ${Math.ceil(bulk.compressed_size / 1_000_000)} MB of cards…`,
      });
      await File.downloadFileAsync(bulk.jsonl_download_uri, archive, { idempotent: true });
      incoming = openCatalogDatabase(name);
      const snapshot = await importCatalogData(
        incoming,
        {
          compressedSize: bulk.compressed_size,
          downloadUrl: bulk.jsonl_download_uri,
          updatedAt: bulk.updated_at,
        },
        sets,
        catalogLines(fileChunks(archive)),
        (count) => this.#set({ progress: `Installing ${count.toLocaleString()} printings…` }),
      );
      incoming.prepare("ATTACH DATABASE ? AS market_prices").run(this.#prices.path);
      const queries = catalogQueries(incoming);
      const previous = this.#registry
        .prepare("SELECT name FROM catalog_install WHERE id = 1")
        .get();
      this.#registry.prepare("INSERT OR REPLACE INTO catalog_install VALUES (1, ?)").run(name);
      const old = this.#database;
      this.#database = incoming;
      incoming = undefined;
      this.#set({ catalog: queries, snapshot, revision: this.#snapshot.revision + 1 });
      old.close();
      if (previous) deleteDatabaseSync(z.object({ name: z.string() }).parse(previous).name);
    } catch (error) {
      this.#set({
        error: error instanceof Error ? error.message : "The catalog could not be installed.",
      });
    } finally {
      if (incoming) {
        incoming.close();
        deleteDatabaseSync(name);
      }
      if (archive.exists) archive.delete();
      this.#set({ busy: false, progress: null });
    }
  }
  async updatePrices() {
    if (this.#snapshot.busy) return;
    this.#set({ busy: true, error: null, progress: "Downloading daily market prices…" });
    const name = `prices-${crypto.randomUUID()}.sqlite`;
    const live = openCatalogDatabase("prices.sqlite");
    const staging = openCatalogDatabase(name);
    try {
      const prices = await importPriceData(
        live,
        staging,
        live.path,
        staging.path,
        downloadPriceFeed,
        (phase) =>
          this.#set({
            progress:
              phase === "identifiers"
                ? "Downloading printing identifiers…"
                : phase === "installing"
                  ? "Installing prices…"
                  : "Downloading daily market prices…",
          }),
      );
      this.#set({ prices, revision: this.#snapshot.revision + 1 });
      await this.updateRates();
    } catch (error) {
      this.#set({ error: error instanceof Error ? error.message : "Prices could not be updated." });
    } finally {
      staging.close();
      live.close();
      deleteDatabaseSync(name);
      this.#set({ busy: false, progress: null });
    }
  }
  startPriceUpdates() {
    const check = () => {
      const snapshot = this.#snapshot;
      if (AppState.currentState !== "active" || snapshot.busy || !snapshot.prices) return;
      if (Date.now() - Date.parse(snapshot.prices.fetchedAt) >= 86_400_000)
        void this.updatePrices();
      else if (!snapshot.rates || Date.now() - Date.parse(snapshot.rates.fetchedAt) >= 86_400_000)
        void this.updateRates();
    };
    check();
    const timer = setInterval(check, 3_600_000);
    const subscription = AppState.addEventListener("change", check);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }
  async updateRates() {
    const rates = await updateExchangeRates(this.#prices);
    this.#set({ rates });
  }
  #set(update: Partial<ReferenceSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) listener();
  }
}
let reference: ReferenceData | undefined;
export function getReferenceData() {
  return (reference ??= new ReferenceData());
}
export function useReferenceData() {
  const reference = getReferenceData();
  return { reference, ...useSyncExternalStore(reference.subscribe, reference.getSnapshot) };
}
