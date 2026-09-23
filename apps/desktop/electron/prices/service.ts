import { updateExchangeRates } from "@mooligan/catalog/exchange-rates";
import { Worker } from "node:worker_threads";

import { PriceSnapshotSchema, PricePhaseSchema, type PriceStatus } from "@mooligan/domain/market";
import { Either, Schema } from "effect";

import { openPriceDatabase } from "./database.ts";
import { readPrintingPrices, readPriceSnapshot } from "@mooligan/catalog/prices";

const decodeWorkerMessage = Schema.decodeUnknownEither(
  Schema.Union(
    Schema.Struct({ snapshot: PriceSnapshotSchema }),
    Schema.Struct({ phase: PricePhaseSchema }),
  ),
);

export class PriceService {
  readonly #database;
  readonly #path: string;
  readonly #onUpdated: () => void;
  #phase: PriceStatus["phase"] = "idle";
  #error: string | null = null;
  #active: Promise<PriceStatus> | undefined;
  #worker: Worker | undefined;
  #lastAttempt = 0;
  #rates: ReturnType<typeof updateExchangeRates> | undefined;

  constructor(path: string, onUpdated: () => void) {
    this.#path = path;
    this.#database = openPriceDatabase(path);
    this.#onUpdated = onUpdated;
  }

  status(): PriceStatus {
    return { snapshot: readPriceSnapshot(this.#database), phase: this.#phase, error: this.#error };
  }

  exchangeRates() {
    this.#rates ??= updateExchangeRates(this.#database).finally(() => {
      this.#rates = undefined;
    });
    return this.#rates;
  }

  read(printingId: string) {
    return readPrintingPrices(this.#database, printingId);
  }

  refresh(force = false): Promise<PriceStatus> {
    if (this.#active) return this.#active;
    const status = this.status();
    if (
      !force &&
      (Date.now() - this.#lastAttempt < 3_600_000 ||
        (status.snapshot && Date.now() - Date.parse(status.snapshot.fetchedAt) < 86_400_000))
    ) {
      return Promise.resolve(status);
    }
    this.#lastAttempt = Date.now();
    this.#phase = "prices";
    this.#error = null;
    this.#active = new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL(/* @vite-ignore */ "./prices-import-worker.js", import.meta.url),
        {
          workerData: { path: this.#path },
        },
      );
      this.#worker = worker;
      let complete = false;
      worker.on("message", (value) => {
        const message = decodeWorkerMessage(value);
        if (Either.isLeft(message)) {
          reject(new Error("The price importer returned an invalid response."));
          void worker.terminate();
        } else if ("snapshot" in message.right) {
          complete = true;
        } else this.#phase = message.right.phase;
      });
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (complete && code === 0) resolve();
        else reject(new Error("The price import did not complete. Try updating again."));
      });
    })
      .then(() => {
        this.#onUpdated();
      })
      .catch((error) => {
        this.#error = error instanceof Error ? error.message : "Prices could not be updated.";
      })
      .finally(() => {
        this.#phase = "idle";
        this.#active = undefined;
        this.#worker = undefined;
      })
      .then(() => this.status());
    return this.#active;
  }

  async close() {
    await this.#worker?.terminate();
    await this.#active;
    await this.#rates;
    this.#database.close();
  }
}
