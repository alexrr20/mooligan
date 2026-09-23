import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ReadableStream as TransferableReadableStream } from "node:stream/web";
import { Worker } from "node:worker_threads";
import { net } from "electron";
import { Either, Schema } from "effect";
import { StrictStruct } from "@mooligan/domain/schema";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "@mooligan/domain/catalog";
import {
  CatalogReleaseSchema,
  ScryfallSetListSchema,
  type CatalogRelease,
  type ScryfallSetDownload,
} from "@mooligan/domain/catalog-download";
import { catalogSchemaVersion } from "@mooligan/catalog/import";
import type { CatalogProgress, CatalogStatus } from "../../shared/desktop-api.ts";
import { isFileNotFound, recoverInterruptedReplacement } from "./files.ts";

const apiBaseUrl = process.env.MOOLIGAN_API_URL ?? "http://127.0.0.1:3000";
const scryfallSetsUrl = "https://api.scryfall.com/sets";
const scryfallRequestHeaders = {
  Accept: "application/json",
  "User-Agent": "Mooligan/0.0.0 (https://github.com/alexrr20/mooligan)",
};
const CatalogMetadataSchema = Schema.Struct({
  ...CatalogSnapshotSchema.fields,
  schemaVersion: Schema.Int,
});
const CatalogImportWorkerMessageSchema = Schema.Union(
  StrictStruct({ completedCards: Schema.NonNegativeInt, type: Schema.Literal("progress") }),
  StrictStruct({ snapshot: CatalogSnapshotSchema, type: Schema.Literal("complete") }),
);

export function createCatalogInstaller(
  catalogPath: string,
  replace: (install: () => Promise<void>) => Promise<void>,
) {
  let activeDownload: Promise<CatalogStatus> | undefined;
  return {
    status: getCatalogStatus,
    download(onProgress: (progress: CatalogProgress) => void) {
      activeDownload ??= downloadCatalog(onProgress).finally(() => {
        activeDownload = undefined;
      });
      return activeDownload;
    },
  };

  async function getCatalogStatus(): Promise<CatalogStatus> {
    const path = catalogPath;

    await recoverInterruptedReplacement(path, `${path}.previous`);

    try {
      await stat(path);
    } catch (error) {
      if (isFileNotFound(error)) {
        return { installed: false };
      }

      throw error;
    }

    let installed: CatalogSnapshot;

    try {
      const database = new DatabaseSync(path, { readOnly: true });

      try {
        const row = database
          .prepare(
            `SELECT schema_version AS schemaVersion,
                  card_count AS cardCount,
                  updated_at AS updatedAt
           FROM catalog_meta
           WHERE singleton = 1`,
          )
          .get();

        const snapshot = Schema.decodeUnknownEither(CatalogMetadataSchema)(row);

        if (Either.isLeft(snapshot) || snapshot.right.schemaVersion !== catalogSchemaVersion) {
          return { installed: false };
        }

        installed = snapshot.right;
      } finally {
        database.close();
      }
    } catch {
      return { installed: false };
    }

    try {
      const latest = await fetchCatalogRelease();

      return {
        installed: true,
        updateAvailable: latest.updatedAt !== installed.updatedAt,
        ...installed,
      };
    } catch {
      return { installed: true, updateAvailable: false, ...installed };
    }
  }

  async function downloadCatalog(
    onProgress: (progress: CatalogProgress) => void,
  ): Promise<CatalogStatus> {
    const release = await fetchCatalogRelease();

    const destination = catalogPath;
    const partial = `${destination}.part`;
    const backup = `${destination}.previous`;

    await mkdir(dirname(catalogPath), { recursive: true });
    await rm(partial, { force: true });

    onProgress({
      completedBytes: 0,
      completedCards: 0,
      totalBytes: release.compressedSize,
    });

    try {
      const sets = await fetchScryfallSets();
      const response = await net.fetch(release.downloadUrl, {
        headers: { Accept: "application/gzip,application/octet-stream;q=0.9,*/*;q=0.8" },
      });

      if (!response.ok || !response.body) {
        throw new Error(`The card download returned HTTP ${response.status}.`);
      }

      let completedBytes = 0;
      let completedCards = 0;
      let lastReportedBytes = 0;
      const reportProgress = () => {
        onProgress({
          completedBytes,
          completedCards,
          totalBytes: release.compressedSize,
        });
      };
      const monitored = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            completedBytes += chunk.byteLength;

            if (
              completedBytes === release.compressedSize ||
              completedBytes - lastReportedBytes >= 1024 * 1024
            ) {
              lastReportedBytes = completedBytes;
              reportProgress();
            }

            controller.enqueue(chunk);
          },
        }),
      );
      const snapshot = await importCatalogInWorker(
        partial,
        TransferableReadableStream.from(monitored),
        release,
        sets,
        (count) => {
          completedCards = count;
          reportProgress();
        },
      );

      if (completedBytes !== release.compressedSize) {
        throw new Error("The card download was incomplete.");
      }

      await replace(() => replaceCatalog(partial, destination, backup));

      return { installed: true, updateAvailable: false, ...snapshot };
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
  }
}

function importCatalogInWorker(
  destinationPath: string,
  archive: TransferableReadableStream<Uint8Array>,
  release: CatalogRelease,
  sets: readonly ScryfallSetDownload[],
  onProgress: (completedCards: number) => void,
) {
  const worker = new Worker(
    new URL(/* @vite-ignore */ "./catalog-import-worker.js", import.meta.url),
    {
      transferList: [archive],
      workerData: { archive, destinationPath, release, sets },
    },
  );

  return new Promise<CatalogSnapshot>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    worker.on("message", (value) => {
      const message = Schema.decodeUnknownEither(CatalogImportWorkerMessageSchema)(value);
      if (Either.isLeft(message)) {
        void worker.terminate().catch(() => undefined);
        fail(new Error("The catalog import worker returned an invalid response."));
        return;
      }
      if (message.right.type === "progress") {
        onProgress(message.right.completedCards);
        return;
      }

      settled = true;
      resolve(message.right.snapshot);
    });
    worker.once("error", fail);
    worker.once("exit", (code) => {
      if (code !== 0) {
        fail(new Error("The catalog import worker stopped before the import completed."));
      } else if (!settled) {
        fail(new Error("The catalog import worker exited without a result."));
      }
    });
  });
}

async function fetchScryfallSets(): Promise<readonly ScryfallSetDownload[]> {
  const response = await net.fetch(scryfallSetsUrl, { headers: scryfallRequestHeaders });
  if (!response.ok) {
    throw new Error(`The Scryfall set catalog returned HTTP ${response.status}.`);
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The Scryfall set catalog returned invalid JSON.");
  }
  const sets = Schema.decodeUnknownEither(ScryfallSetListSchema)(value);
  if (Either.isLeft(sets)) {
    throw new Error("The Scryfall set catalog response was invalid.");
  }
  return sets.right.data;
}

async function fetchCatalogRelease(): Promise<CatalogRelease> {
  const response = await net.fetch(catalogUrl("catalog/release"));

  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? "The card catalog release has not been published yet."
        : `The catalog service returned HTTP ${response.status}.`,
    );
  }

  const release = Schema.decodeUnknownEither(CatalogReleaseSchema)(await response.json());

  if (Either.isLeft(release)) {
    throw new Error("The catalog service returned an invalid release.");
  }

  return release.right;
}

async function replaceCatalog(partial: string, destination: string, backup: string) {
  await recoverInterruptedReplacement(destination, backup);
  await rm(backup, { force: true });

  try {
    await rename(destination, backup);
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }

  try {
    await rename(partial, destination);
  } catch (error) {
    try {
      await rename(backup, destination);
    } catch {
      // The previous catalog did not exist or could not be restored.
    }

    throw error;
  }

  await rm(backup, { force: true }).catch(() => undefined);
}

function catalogUrl(path: string) {
  return new URL(path, `${apiBaseUrl.replace(/\/+$/, "")}/`).toString();
}

export type CatalogInstaller = ReturnType<typeof createCatalogInstaller>;
