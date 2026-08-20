import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";

import { CatalogSnapshotSchema, type CatalogSnapshot } from "@mooligan/domain/catalog";
import {
  CatalogImageDescriptorSchema,
  type CatalogImageDescriptor,
} from "@mooligan/domain/catalog-detail";
import {
  CatalogReleaseSchema,
  ScryfallSetListSchema,
  type CatalogRelease,
  type ScryfallSetDownload,
} from "@mooligan/domain/catalog-sync";
import {
  CatalogSetSymbolDescriptorSchema,
  SpoilerVisibilitySnapshotSchema,
  type CatalogPrintingResult,
  type CatalogReleaseSummary,
  type CatalogSetSymbolDescriptor,
  type SpoilerRevealSummaries,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import { app, ipcMain, net, type IpcMainInvokeEvent } from "electron";
import * as z from "zod";

import { recoverInterruptedReplacement } from "./files";
import { validateCatalogPrintingId } from "./detail";
import { catalogSchemaVersion, importCatalog, readGzipJsonLines } from "./import";
import { parseCatalogQueryWorkerResponse, validateCatalogListRequest } from "./query";
import {
  validateCatalogUpcomingPrintingRequest,
  type CatalogListPage,
  type CatalogQueryOperation,
  type CatalogQueryWorkerRequest,
  type CatalogUpcomingPrintingPage,
} from "./query";
import {
  CatalogVisibilityChangedError,
  catalogVisibilitySnapshotsEqual,
  readWithStableCatalogVisibility,
} from "./stable-visibility";
import { assertTrustedSender } from "../ipc-security";

export type CatalogProgress = {
  completedBytes: number;
  completedCards: number;
  totalBytes: number;
};

export type CatalogStatus =
  | { installed: false }
  | (CatalogSnapshot & { installed: true; updateAvailable: boolean });

const apiBaseUrl = process.env.MOOLIGAN_API_URL ?? "http://127.0.0.1:3000";
const scryfallSetsUrl = "https://api.scryfall.com/sets";
const scryfallRequestHeaders = {
  Accept: "application/json",
  "User-Agent": "Mooligan/0.0.0 (https://github.com/alexrr20/mooligan)",
};
const CatalogMetadataSchema = CatalogSnapshotSchema.extend({ schemaVersion: z.number().int() });
const FileSystemErrorSchema = z.object({ code: z.string().optional() });
let activeDownload: Promise<CatalogStatus> | undefined;
let catalogEpoch = 0;
let catalogQueriesAvailable = Promise.resolve();
let catalogQueryId = 0;
let catalogQueryWorker: Worker | undefined;
let getCatalogVisibilitySnapshot: (() => SpoilerVisibilitySnapshot) | undefined;
type CatalogQueryResult =
  | CatalogListPage
  | CatalogPrintingResult
  | CatalogReleaseSummary[]
  | CatalogUpcomingPrintingPage
  | SpoilerRevealSummaries
  | string
  | null;
const catalogQueries = new Map<
  number,
  {
    operation: CatalogQueryOperation["type"];
    reject: (error: Error) => void;
    resolve: (result: CatalogQueryResult) => void;
  }
>();

export type CatalogIpcOptions = {
  getVisibilitySnapshot: () => SpoilerVisibilitySnapshot;
};

export function registerCatalogIpc(options: CatalogIpcOptions) {
  getCatalogVisibilitySnapshot = options.getVisibilitySnapshot;
  ipcMain.handle("catalog:status", (event) => {
    assertTrustedSender(event);
    return getCatalogStatus();
  });
  ipcMain.handle("catalog:list", async (event, request) => {
    assertTrustedSender(event);
    await catalogQueriesAvailable;
    const validRequest = validateCatalogListRequest(request);
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({ request: validRequest, type: "list", visibility }),
    );
  });
  ipcMain.handle("catalog:detail", async (event, printingId) => {
    assertTrustedSender(event);
    const validPrintingId = validateCatalogPrintingId(printingId);

    if (!validPrintingId) {
      return null;
    }

    await catalogQueriesAvailable;
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({ printingId: validPrintingId, type: "detail", visibility }),
    );
  });
  ipcMain.handle("catalog:upcoming", async (event) => {
    assertTrustedSender(event);
    await catalogQueriesAvailable;
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({ type: "upcoming", visibility }),
    );
  });
  ipcMain.handle("catalog:upcoming-printings", async (event, request) => {
    assertTrustedSender(event);
    await catalogQueriesAvailable;
    const validRequest = validateCatalogUpcomingPrintingRequest(request);
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({ request: validRequest, type: "upcoming-printings", visibility }),
    );
  });
  ipcMain.handle("catalog:spoiler-reveals", async (event) => {
    assertTrustedSender(event);
    await catalogQueriesAvailable;
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({
        printingIds: visibility.revealedPrintingIds,
        rootSetIds: visibility.revealedRootSetIds,
        type: "spoiler-reveals",
      }),
    );
  });
  ipcMain.handle("catalog:download", (event) => {
    assertTrustedSender(event);
    activeDownload ??= downloadCatalog(event).finally(() => {
      activeDownload = undefined;
    });

    return activeDownload;
  });
}

async function getCatalogStatus(): Promise<CatalogStatus> {
  const path = catalogPath();

  await recoverInterruptedReplacement(path, `${path}.previous`);

  try {
    await stat(path);
  } catch (error) {
    const fileSystemError = FileSystemErrorSchema.safeParse(error);
    if (fileSystemError.success && fileSystemError.data.code === "ENOENT") {
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

      const snapshot = CatalogMetadataSchema.safeParse(row);

      if (!snapshot.success || snapshot.data.schemaVersion !== catalogSchemaVersion) {
        return { installed: false };
      }

      installed = snapshot.data;
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

async function downloadCatalog(event: IpcMainInvokeEvent): Promise<CatalogStatus> {
  const release = await fetchCatalogRelease();

  const destination = catalogPath();
  const partial = `${destination}.part`;
  const backup = `${destination}.previous`;

  await mkdir(join(app.getPath("userData"), "catalog"), { recursive: true });
  await rm(partial, { force: true });

  sendProgress(event, {
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
      sendProgress(event, {
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
    const lines = readGzipJsonLines(Readable.from(monitored));
    const snapshot = await importCatalog(partial, release, sets, lines, (count) => {
      completedCards = count;
      reportProgress();
    });

    if (completedBytes !== release.compressedSize) {
      throw new Error("The card download was incomplete.");
    }

    const resumeCatalogQueries = pauseCatalogQueries();

    try {
      catalogEpoch += 1;
      await stopCatalogQueryWorker();
      await replaceCatalog(partial, destination, backup);
    } finally {
      resumeCatalogQueries();
    }

    return { installed: true, updateAvailable: false, ...snapshot };
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function fetchScryfallSets(): Promise<ScryfallSetDownload[]> {
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
  const sets = ScryfallSetListSchema.safeParse(value);
  if (!sets.success) {
    throw new Error("The Scryfall set catalog response was invalid.");
  }
  return sets.data.data;
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

  const release = CatalogReleaseSchema.safeParse(await response.json());

  if (!release.success) {
    throw new Error("The catalog service returned an invalid release.");
  }

  return release.data;
}

async function replaceCatalog(partial: string, destination: string, backup: string) {
  await recoverInterruptedReplacement(destination, backup);
  await rm(backup, { force: true });

  try {
    await rename(destination, backup);
  } catch (error) {
    const fileSystemError = FileSystemErrorSchema.safeParse(error);
    if (!fileSystemError.success || fileSystemError.data.code !== "ENOENT") {
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

function catalogPath() {
  return join(app.getPath("userData"), "catalog", "cards.sqlite");
}

function catalogUrl(path: string) {
  return new URL(path, `${apiBaseUrl.replace(/\/+$/, "")}/`).toString();
}

export async function queryCatalogImageSource(image: CatalogImageDescriptor) {
  const validImage = CatalogImageDescriptorSchema.parse(image);
  await catalogQueriesAvailable;
  try {
    return await queryAuthorizedCatalogImageSource(validImage);
  } catch (error) {
    if (error instanceof CatalogVisibilityChangedError) {
      throw error;
    }
    await catalogQueriesAvailable;
    return queryAuthorizedCatalogImageSource(validImage);
  }
}

export async function queryCatalogSetSymbolSource(symbol: CatalogSetSymbolDescriptor) {
  const validSymbol = CatalogSetSymbolDescriptorSchema.parse(symbol);
  await catalogQueriesAvailable;
  return queryCatalog({ symbol: validSymbol, type: "set-symbol-source" });
}

export async function resolveCatalogRootSetId(targetId: string) {
  const validTargetId = validateCatalogPrintingId(targetId);
  if (!validTargetId) {
    return null;
  }
  await catalogQueriesAvailable;
  return queryCatalog({ targetId: validTargetId, type: "root-set" });
}

async function queryAuthorizedCatalogImageSource(image: CatalogImageDescriptor) {
  const authorizedCatalogEpoch = catalogEpoch;
  const stable = await readWithStableCatalogVisibility(
    readCatalogVisibilitySnapshot,
    (visibility) => queryCatalog({ image, type: "image-source", visibility }),
  );

  if (authorizedCatalogEpoch !== catalogEpoch) {
    throw new CatalogVisibilityChangedError();
  }

  return stable.result
    ? {
        isCurrent: () =>
          authorizedCatalogEpoch === catalogEpoch &&
          catalogVisibilitySnapshotsEqual(stable.visibility, readCatalogVisibilitySnapshot()),
        sourceUrl: stable.result,
      }
    : null;
}

async function queryCatalogWithStableVisibility<Result>(
  query: (visibility: SpoilerVisibilitySnapshot) => Promise<Result>,
) {
  return (await readWithStableCatalogVisibility(readCatalogVisibilitySnapshot, query)).result;
}

function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "detail" }>,
): Promise<CatalogPrintingResult | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "image-source" }>,
): Promise<string | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "list" }>,
): Promise<CatalogListPage>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "root-set" }>,
): Promise<string | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "set-symbol-source" }>,
): Promise<string | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "spoiler-reveals" }>,
): Promise<SpoilerRevealSummaries>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "upcoming" }>,
): Promise<CatalogReleaseSummary[]>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "upcoming-printings" }>,
): Promise<CatalogUpcomingPrintingPage>;
function queryCatalog(operation: CatalogQueryOperation): Promise<CatalogQueryResult> {
  const id = ++catalogQueryId;

  return new Promise<CatalogQueryResult>((resolve, reject) => {
    catalogQueries.set(id, {
      operation: operation.type,
      reject,
      resolve,
    });

    try {
      const worker = getCatalogQueryWorker();
      worker.postMessage({ id, operation } satisfies CatalogQueryWorkerRequest);
    } catch {
      catalogQueries.delete(id);
      reject(catalogReadError());
    }
  });
}

function readCatalogVisibilitySnapshot() {
  if (!getCatalogVisibilitySnapshot) {
    throw new Error("Catalog spoiler protection has not been initialized.");
  }
  return SpoilerVisibilitySnapshotSchema.parse(getCatalogVisibilitySnapshot());
}

function getCatalogQueryWorker() {
  if (catalogQueryWorker) {
    return catalogQueryWorker;
  }

  const worker = new Worker(
    new URL(/* @vite-ignore */ "./catalog-query-worker.js", import.meta.url),
    { workerData: catalogPath() },
  );

  worker.on("message", (value) => {
    const envelope = z.object({ id: z.number().int().positive() }).safeParse(value);

    if (!envelope.success) {
      failCatalogQueryWorker(worker);
      return;
    }

    const pending = catalogQueries.get(envelope.data.id);

    if (!pending) {
      failCatalogQueryWorker(worker);
      return;
    }

    const response = parseCatalogQueryWorkerResponse(value, pending.operation);

    if (!response) {
      failCatalogQueryWorker(worker);
      return;
    }

    catalogQueries.delete(envelope.data.id);

    if ("error" in response) {
      pending.reject(catalogReadError());
    } else {
      pending.resolve(response.result);
    }
  });
  worker.once("error", () => failCatalogQueryWorker(worker));
  worker.once("exit", () => failCatalogQueryWorker(worker));
  catalogQueryWorker = worker;
  return worker;
}

function failCatalogQueryWorker(worker: Worker, terminate = true) {
  if (catalogQueryWorker !== worker) {
    return;
  }

  catalogQueryWorker = undefined;

  for (const pending of catalogQueries.values()) {
    pending.reject(catalogReadError());
  }

  catalogQueries.clear();

  if (terminate) {
    void worker.terminate().catch(() => undefined);
  }
}

function catalogReadError() {
  return new Error("The local card catalog could not be read.");
}

async function stopCatalogQueryWorker() {
  const worker = catalogQueryWorker;

  if (!worker) {
    return;
  }

  failCatalogQueryWorker(worker, false);
  await worker.terminate();
}

function pauseCatalogQueries() {
  let resume!: () => void;
  const barrier = new Promise<void>((resolve) => {
    resume = resolve;
  });
  catalogQueriesAvailable = barrier;

  return () => {
    resume();

    if (catalogQueriesAvailable === barrier) {
      catalogQueriesAvailable = Promise.resolve();
    }
  };
}

function sendProgress(event: IpcMainInvokeEvent, progress: CatalogProgress) {
  if (!event.sender.isDestroyed()) {
    event.sender.send("catalog:progress", progress);
  }
}
