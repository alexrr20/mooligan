import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ReadableStream as TransferableReadableStream } from "node:stream/web";
import { Worker } from "node:worker_threads";

import {
  CatalogSnapshotSchema,
  type CatalogSnapshot,
  type Color,
  type Finish,
} from "@mooligan/domain/catalog";
import { DeckCostRequestSchema } from "@mooligan/workspace/transport";
import { type DeckCost } from "@mooligan/domain/deck-cost";
import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { CatalogListPage, CatalogUpcomingPrintingPage } from "@mooligan/domain/catalog-search";
import {
  CollectionPrintingValidationRequestSchema,
  type CollectionListPage,
} from "@mooligan/domain/collection";
import type { CollectionLot } from "@mooligan/workspace/collection-contract";
import {
  CatalogReleaseSchema,
  ScryfallSetListSchema,
  type CatalogRelease,
  type ScryfallSetDownload,
} from "@mooligan/domain/catalog-download";
import {
  type CatalogPrintingResult,
  type CatalogReleaseSummary,
  type CatalogSetSymbolDescriptor,
  type SpoilerRevealSummaries,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import { app, ipcMain, net, type IpcMainInvokeEvent } from "electron";
import { Either, Schema } from "effect";
import { UuidSchema, StrictStruct, type JsonValue } from "@mooligan/domain/schema";

import type { CatalogProgress, CatalogStatus } from "../../shared/desktop-api.ts";
import { settleCatalogRequest } from "../../shared/catalog-request.ts";
import { isFileNotFound, recoverInterruptedReplacement } from "./files";
import { CatalogQueryQueue } from "./query-queue";
import { validateCatalogPrintingId } from "@mooligan/catalog/detail";
import { catalogSchemaVersion } from "@mooligan/catalog/import";
import {
  CatalogColorPrintingIdsSchema,
  parseCatalogQueryWorkerResponse,
  validateCatalogListRequest,
} from "@mooligan/catalog/query";
import { validateCollectionListRequest } from "@mooligan/catalog/collection-query";
import {
  validateCatalogUpcomingPrintingRequest,
  type CatalogQueryOperation,
  type CatalogQueryWorkerRequest,
} from "@mooligan/catalog/query";
import {
  CatalogVisibilityChangedError,
  catalogVisibilitySnapshotsEqual,
  readWithStableCatalogVisibility,
} from "./stable-visibility";
import { assertTrustedSender } from "../ipc-security";
import {
  parseCollectionProjectionWorkerResponse,
  type CollectionProjectionWorkerOperation,
  type CollectionProjectionWorkerRequest,
} from "@mooligan/catalog/collection-projection";

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
const decodeRequestId = Schema.decodeUnknownSync(UuidSchema);
const decodeWorkerEnvelope = Schema.decodeUnknownEither(
  Schema.Struct({ id: Schema.Int.pipe(Schema.positive()) }),
);
let activeDownload: Promise<CatalogStatus> | undefined;
let catalogEpoch = 0;
let pricePath: string;
let catalogQueriesAvailable = Promise.resolve();
let catalogQueryId = 0;
let catalogQueryWorker: Worker | undefined;
let catalogQueryWorkerIdentity: string | undefined;
let getCatalogVisibilitySnapshot: (() => SpoilerVisibilitySnapshot) | undefined;
let getCollectionProjectionLots: (() => CollectionLot[]) | undefined;
let isCollectionProjectionReady: (() => boolean) | undefined;
let onCollectionProjectionInvalidated: (() => void) | undefined;
type CatalogQueryResult =
  | DeckCost
  | readonly Color[]
  | CatalogListPage
  | CollectionListPage
  | CatalogPrintingResult
  | readonly CatalogReleaseSummary[]
  | CatalogUpcomingPrintingPage
  | SpoilerRevealSummaries
  | string
  | null;
const catalogQueryQueue = new CatalogQueryQueue();
const catalogRequestControllers = new Map<string, AbortController>();
const catalogQueries = new Map<
  number,
  {
    operation: CatalogQueryOperation["type"];
    reject: (error: Error) => void;
    resolve: (result: CatalogQueryResult) => void;
  }
>();
const collectionProjectionRequests = new Map<
  number,
  {
    operation: CollectionProjectionWorkerOperation["type"];
    reject: (error: Error) => void;
    resolve: () => void;
  }
>();

export type CatalogIpcOptions = {
  pricePath: string;
  getCollectionProjectionLots: () => CollectionLot[];
  getVisibilitySnapshot: () => SpoilerVisibilitySnapshot;
  isCollectionProjectionReady: () => boolean;
  onCollectionProjectionInvalidated: () => void;
};

export function registerCatalogIpc(options: CatalogIpcOptions) {
  pricePath = options.pricePath;
  getCatalogVisibilitySnapshot = options.getVisibilitySnapshot;
  getCollectionProjectionLots = options.getCollectionProjectionLots;
  isCollectionProjectionReady = options.isCollectionProjectionReady;
  onCollectionProjectionInvalidated = options.onCollectionProjectionInvalidated;
  ipcMain.handle("catalog:status", (event) => {
    assertTrustedSender(event);
    return getCatalogStatus();
  });
  ipcMain.handle("catalog:cancel-query", (event, requestId) => {
    assertTrustedSender(event);
    const key = `${event.sender.id}:${decodeRequestId(requestId)}`;
    catalogRequestControllers.get(key)?.abort();
  });
  ipcMain.handle("catalog:list", (event, request, requestId) => {
    assertTrustedSender(event);
    const validRequest = validateCatalogListRequest(request);
    return withCatalogRequest(event, requestId, async (signal) => {
      await catalogQueriesAvailable;
      return queryCatalogWithStableVisibility((visibility) =>
        queryCatalog({ request: validRequest, type: "list", visibility }, signal),
      );
    });
  });
  ipcMain.handle("catalog:colors", async (event, printingIds) => {
    assertTrustedSender(event);
    const ids = Schema.decodeUnknownSync(CatalogColorPrintingIdsSchema)(printingIds);
    await catalogQueriesAvailable;
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({ type: "colors", printingIds: ids, visibility }),
    );
  });
  ipcMain.handle("catalog:detail", async (event, printingId) => {
    assertTrustedSender(event);
    return queryCatalogPrintingDetail(printingId);
  });
  ipcMain.handle("catalog:deck-cost", async (event, value) => {
    assertTrustedSender(event);
    const request = Schema.decodeUnknownSync(DeckCostRequestSchema)(value);
    await catalogQueriesAvailable;
    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog({ type: "deck-cost", request, visibility }),
    );
  });
  ipcMain.handle("catalog:validate-collection-printing", async (event, value) => {
    assertTrustedSender(event);
    const request = Schema.decodeUnknownSync(CollectionPrintingValidationRequestSchema)(value);
    const result = await queryCatalogPrintingDetail(request.printingId);
    assertPrintingCanUseFinish(result, request);
  });
  ipcMain.handle("catalog:root-set", async (event, targetId) => {
    assertTrustedSender(event);
    return resolveCatalogRootSetId(targetId);
  });
  ipcMain.handle("collection:list", (event, request, requestId) => {
    assertTrustedSender(event);
    const validRequest = validateCollectionListRequest(request);
    return withCatalogRequest(event, requestId, async (signal) => {
      if (!readCollectionProjectionReady()) {
        return { status: "not-ready" } as const;
      }
      await catalogQueriesAvailable;
      if (!readCollectionProjectionReady()) {
        return { status: "not-ready" } as const;
      }
      const result = await queryCatalogWithStableVisibility((visibility) =>
        queryCatalog({ request: validRequest, type: "collection-list", visibility }, signal),
      );

      if (!readCollectionProjectionReady()) {
        return { status: "not-ready" } as const;
      }

      return { page: result, status: "ready" } as const;
    });
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

async function withCatalogRequest<Result>(
  event: IpcMainInvokeEvent,
  requestId: JsonValue | undefined,
  read: (signal?: AbortSignal) => Promise<Result>,
) {
  if (requestId === undefined) return settleCatalogRequest(() => read());
  const key = `${event.sender.id}:${decodeRequestId(requestId)}`;
  if (catalogRequestControllers.has(key)) throw new Error("Duplicate catalog request.");
  const controller = new AbortController();
  catalogRequestControllers.set(key, controller);
  try {
    return await settleCatalogRequest(() => read(controller.signal), controller.signal);
  } finally {
    catalogRequestControllers.delete(key);
  }
}

export function replaceCatalogCollectionProjection(lots: readonly CollectionLot[]) {
  return catalogQueryWorker
    ? sendCollectionProjectionOperation({ lots, type: "collection-projection-replace" })
    : Promise.resolve();
}

export function applyCatalogCollectionProjection(
  delta: Readonly<{ deletedLotIds: readonly string[]; upserts: readonly CollectionLot[] }>,
) {
  return catalogQueryWorker
    ? sendCollectionProjectionOperation({ ...delta, type: "collection-projection-apply" })
    : Promise.resolve();
}

async function getCatalogStatus(): Promise<CatalogStatus> {
  const path = catalogPath();

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

function catalogPath() {
  return join(app.getPath("userData"), "catalog", "cards.sqlite");
}

function catalogUrl(path: string) {
  return new URL(path, `${apiBaseUrl.replace(/\/+$/, "")}/`).toString();
}

export async function queryCatalogImageSource(image: CatalogImageDescriptor) {
  await catalogQueriesAvailable;
  try {
    return await queryAuthorizedCatalogImageSource(image);
  } catch (error) {
    if (error instanceof CatalogVisibilityChangedError) {
      throw error;
    }
    await catalogQueriesAvailable;
    return queryAuthorizedCatalogImageSource(image);
  }
}

export async function queryCatalogSetSymbolSource(symbol: CatalogSetSymbolDescriptor) {
  await catalogQueriesAvailable;
  return queryCatalog({ symbol, type: "set-symbol-source" });
}

export async function resolveCatalogRootSetId(targetId: string) {
  const validTargetId = validateCatalogPrintingId(targetId);
  if (!validTargetId) {
    return null;
  }
  await catalogQueriesAvailable;
  return queryCatalog({ targetId: validTargetId, type: "root-set" });
}

export async function queryCatalogPrintingDetail(
  printingId: JsonValue,
): Promise<CatalogPrintingResult | null> {
  const validPrintingId = validateCatalogPrintingId(printingId);

  if (!validPrintingId) {
    return null;
  }

  await catalogQueriesAvailable;
  return queryCatalogWithStableVisibility((visibility) =>
    queryCatalog({ printingId: validPrintingId, type: "detail", visibility }),
  );
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
  operation: Extract<CatalogQueryOperation, { type: "deck-cost" }>,
): Promise<DeckCost>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "colors" }>,
): Promise<readonly Color[] | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "detail" }>,
): Promise<CatalogPrintingResult | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "image-source" }>,
): Promise<string | null>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "list" }>,
  signal?: AbortSignal,
): Promise<CatalogListPage>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "collection-list" }>,
  signal?: AbortSignal,
): Promise<CollectionListPage>;
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
): Promise<readonly CatalogReleaseSummary[]>;
function queryCatalog(
  operation: Extract<CatalogQueryOperation, { type: "upcoming-printings" }>,
): Promise<CatalogUpcomingPrintingPage>;
function queryCatalog(
  operation: CatalogQueryOperation,
  signal?: AbortSignal,
): Promise<CatalogQueryResult> {
  return catalogQueryQueue.run(() => sendCatalogQuery(operation), signal);
}

function sendCatalogQuery(operation: CatalogQueryOperation): Promise<CatalogQueryResult> {
  const id = ++catalogQueryId;
  let worker: Worker;

  try {
    worker = getCatalogQueryWorker();
  } catch {
    return Promise.reject(catalogReadError());
  }

  return new Promise<CatalogQueryResult>((resolve, reject) => {
    catalogQueries.set(id, {
      operation: operation.type,
      reject,
      resolve,
    });

    try {
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
  return getCatalogVisibilitySnapshot();
}

function readCollectionProjectionReady() {
  if (!isCollectionProjectionReady) {
    throw new Error("The Collection projection has not been initialized.");
  }
  return isCollectionProjectionReady();
}

function getCatalogQueryWorker() {
  if (!getCollectionProjectionLots) {
    throw new Error("The Collection projection has not been initialized.");
  }
  const startup = {
    pricePath,
    catalogPath: catalogPath(),
    collectionLots: getCollectionProjectionLots(),
  };
  const identity = startup.catalogPath;

  if (catalogQueryWorker && catalogQueryWorkerIdentity === identity) {
    return catalogQueryWorker;
  }

  if (catalogQueryWorker) {
    failCatalogQueryWorker(catalogQueryWorker);
  }

  const worker = new Worker(
    new URL(/* @vite-ignore */ "./catalog-query-worker.js", import.meta.url),
    { workerData: startup },
  );

  worker.on("message", (value) => {
    const envelope = decodeWorkerEnvelope(value);

    if (Either.isLeft(envelope)) {
      failCatalogQueryWorker(worker);
      return;
    }

    const projectionPending = collectionProjectionRequests.get(envelope.right.id);
    if (projectionPending) {
      const response = parseCollectionProjectionWorkerResponse(value, projectionPending.operation);
      if (!response) {
        failCatalogQueryWorker(worker);
        return;
      }
      collectionProjectionRequests.delete(envelope.right.id);
      if ("error" in response) projectionPending.reject(catalogReadError());
      else projectionPending.resolve();
      return;
    }

    const pending = catalogQueries.get(envelope.right.id);
    if (!pending) {
      failCatalogQueryWorker(worker);
      return;
    }

    const response = parseCatalogQueryWorkerResponse(value, pending.operation);

    if (!response) {
      failCatalogQueryWorker(worker);
      return;
    }

    catalogQueries.delete(envelope.right.id);

    if ("error" in response) {
      pending.reject(catalogReadError());
    } else {
      pending.resolve(response.result);
    }
  });
  worker.once("error", () => failCatalogQueryWorker(worker));
  worker.once("exit", () => failCatalogQueryWorker(worker));
  catalogQueryWorker = worker;
  catalogQueryWorkerIdentity = identity;
  return worker;
}

function failCatalogQueryWorker(worker: Worker, terminate = true) {
  if (catalogQueryWorker !== worker) {
    return;
  }

  catalogQueryWorker = undefined;
  catalogQueryWorkerIdentity = undefined;
  catalogQueryQueue.clear(catalogReadError());

  for (const pending of catalogQueries.values()) {
    pending.reject(catalogReadError());
  }

  catalogQueries.clear();
  for (const pending of collectionProjectionRequests.values()) {
    pending.reject(catalogReadError());
  }
  collectionProjectionRequests.clear();
  onCollectionProjectionInvalidated?.();

  if (terminate) {
    void worker.terminate().catch(() => undefined);
  }
}

function sendCollectionProjectionOperation(operation: CollectionProjectionWorkerOperation) {
  const worker = catalogQueryWorker;
  if (!worker) return Promise.resolve();
  const id = ++catalogQueryId;
  return new Promise<void>((resolve, reject) => {
    collectionProjectionRequests.set(id, { operation: operation.type, reject, resolve });
    try {
      worker.postMessage({ id, operation } satisfies CollectionProjectionWorkerRequest);
    } catch {
      collectionProjectionRequests.delete(id);
      reject(catalogReadError());
    }
  });
}

function assertPrintingCanUseFinish(
  result: CatalogPrintingResult | null,
  request: {
    existingFinish?: Finish;
    finish: Finish;
  },
) {
  if (!result) {
    if (request.existingFinish === request.finish) return;
    throw new Error("This printing is not present in the installed catalog.");
  }
  if (result.status === "protected") {
    throw new Error("Reveal this printing before adding it to the Collection.");
  }
  if (result.detail.selectedPrinting.isDigital) {
    throw new Error("Digital printings cannot be added to the Collection.");
  }
  if (!result.detail.selectedPrinting.finishes?.includes(request.finish)) {
    throw new Error("This finish is not available for the selected printing.");
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
