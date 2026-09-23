import { Worker } from "node:worker_threads";
import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type {
  CollectionListRequest,
  CollectionListResult,
  CollectionLot,
} from "@mooligan/domain/collection";
import type {
  CatalogPrintingResult,
  CatalogSetSymbolDescriptor,
  SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import type { JSONType } from "zod";
import { validateCatalogPrintingId } from "@mooligan/catalog/detail";
import type { CollectionProjection } from "../collection/projection.ts";
import { CatalogQueryQueue } from "./query-queue.ts";
import {
  CatalogVisibilityChangedError,
  catalogVisibilitySnapshotsEqual,
  readWithStableCatalogVisibility,
} from "./stable-visibility.ts";
import type {
  CatalogOperation,
  CatalogOperationArguments,
  CatalogOperationResult,
  CatalogWorkerRequest,
  CatalogWorkerResponse,
} from "./operations.ts";

type CatalogServiceOptions = {
  catalogPath: string;
  pricePath: string;
  workerUrl: URL;
  collection: Pick<CollectionProjection, "lots" | "isReady" | "workerInvalidated">;
  readVisibility: () => SpoilerVisibilitySnapshot;
};

export function createCatalogService(options: CatalogServiceOptions) {
  let catalogEpoch = 0;
  let catalogReplacement: Promise<void> | undefined;
  let catalogQueryId = 0;
  let catalogQueryWorker: Worker | undefined;
  const catalogQueryQueue = new CatalogQueryQueue();
  const catalogQueries = new Map<
    number,
    {
      operation: CatalogOperation;
      reject: (error: Error) => void;
      resolve: (result: CatalogOperationResult<CatalogOperation>) => void;
    }
  >();
  return {
    query: queryCatalog,
    read: queryCatalogWithStableVisibility,
    printingDetail: queryCatalogPrintingDetail,
    imageSource: queryCatalogImageSource,
    setSymbolSource: queryCatalogSetSymbolSource,
    rootSetId: resolveCatalogRootSetId,
    replaceCollection: replaceCatalogCollectionProjection,
    applyCollection: applyCatalogCollectionProjection,
    listCollection,
    replace,
    close: stopCatalogQueryWorker,
  };

  async function replace(install: () => Promise<void>) {
    const resume = pauseCatalogQueries();
    try {
      catalogEpoch += 1;
      await stopCatalogQueryWorker();
      await install();
    } finally {
      resume();
    }
  }

  async function listCollection(
    request: CollectionListRequest,
    signal?: AbortSignal,
  ): Promise<CollectionListResult> {
    if (!options.collection.isReady()) return { status: "not-ready" };
    return whenAvailable(async () => {
      if (!options.collection.isReady()) return { status: "not-ready" };
      const page = await queryCatalogWithStableVisibility((visibility) =>
        queryCatalog("collection-list", [request, visibility], signal),
      );
      if (!options.collection.isReady()) return { status: "not-ready" };
      return { status: "ready", page };
    });
  }

  async function queryCatalogImageSource(image: CatalogImageDescriptor) {
    try {
      return await queryAuthorizedCatalogImageSource(image);
    } catch (error) {
      if (error instanceof CatalogVisibilityChangedError) {
        throw error;
      }
      return queryAuthorizedCatalogImageSource(image);
    }
  }

  async function queryCatalogSetSymbolSource(symbol: CatalogSetSymbolDescriptor) {
    return queryCatalog("set-symbol-source", [symbol]);
  }

  async function resolveCatalogRootSetId(targetId: string) {
    const validTargetId = validateCatalogPrintingId(targetId);
    if (!validTargetId) {
      return null;
    }
    return queryCatalog("root-set", [validTargetId]);
  }

  async function queryCatalogPrintingDetail(
    printingId: JSONType,
  ): Promise<CatalogPrintingResult | null> {
    const validPrintingId = validateCatalogPrintingId(printingId);

    if (!validPrintingId) {
      return null;
    }

    return queryCatalogWithStableVisibility((visibility) =>
      queryCatalog("detail", [validPrintingId, visibility]),
    );
  }

  async function queryAuthorizedCatalogImageSource(image: CatalogImageDescriptor) {
    return whenAvailable(async () => {
      const authorizedCatalogEpoch = catalogEpoch;
      const stable = await readWithStableCatalogVisibility(options.readVisibility, (visibility) =>
        queryCatalog("image-source", [image, visibility]),
      );

      if (authorizedCatalogEpoch !== catalogEpoch) {
        throw new CatalogVisibilityChangedError();
      }

      return stable.result
        ? {
            isCurrent: () =>
              authorizedCatalogEpoch === catalogEpoch &&
              catalogVisibilitySnapshotsEqual(stable.visibility, options.readVisibility()),
            sourceUrl: stable.result,
          }
        : null;
    });
  }

  async function queryCatalogWithStableVisibility<Result>(
    query: (visibility: SpoilerVisibilitySnapshot) => Promise<Result>,
  ) {
    return whenAvailable(
      async () => (await readWithStableCatalogVisibility(options.readVisibility, query)).result,
    );
  }

  function queryCatalog<Operation extends CatalogOperation>(
    operation: Operation,
    args: CatalogOperationArguments<NoInfer<Operation>>,
    signal?: AbortSignal,
  ): Promise<CatalogOperationResult<Operation>> {
    return catalogQueryQueue.run(
      () =>
        whenAvailable(() => {
          signal?.throwIfAborted();
          try {
            return sendCatalogOperation(getCatalogQueryWorker(), operation, args);
          } catch {
            return Promise.reject(catalogReadError());
          }
        }),
      signal,
    );
  }

  async function whenAvailable<Result>(read: () => Result | Promise<Result>): Promise<Result> {
    while (catalogReplacement) await catalogReplacement;
    return read();
  }

  function sendCatalogOperation<Operation extends CatalogOperation>(
    worker: Worker,
    operation: Operation,
    args: CatalogOperationArguments<NoInfer<Operation>>,
  ): Promise<CatalogOperationResult<Operation>> {
    const id = ++catalogQueryId;
    return new Promise((resolve, reject) => {
      catalogQueries.set(id, {
        operation,
        reject,
        // SAFETY: replies are matched to this request's ID and operation before resolving.
        resolve: (result) => resolve(result as CatalogOperationResult<Operation>),
      });
      try {
        worker.postMessage({ id, operation, args } satisfies CatalogWorkerRequest<Operation>);
      } catch {
        catalogQueries.delete(id);
        reject(catalogReadError());
      }
    });
  }

  function getCatalogQueryWorker() {
    if (catalogQueryWorker) return catalogQueryWorker;
    const startup = {
      pricePath: options.pricePath,
      catalogPath: options.catalogPath,
      collectionLots: options.collection.lots(),
    };
    const worker = new Worker(options.workerUrl, { workerData: startup });

    worker.on("message", (response: CatalogWorkerResponse) => {
      if (catalogQueryWorker !== worker) return;
      const pending = catalogQueries.get(response.id);
      if (!pending || pending.operation !== response.operation) {
        failCatalogQueryWorker(worker);
        return;
      }
      catalogQueries.delete(response.id);
      if ("error" in response) pending.reject(catalogReadError());
      else pending.resolve(response.result);
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
    catalogQueryQueue.clear(catalogReadError());

    for (const pending of catalogQueries.values()) {
      pending.reject(catalogReadError());
    }

    catalogQueries.clear();
    options.collection.workerInvalidated();

    if (terminate) {
      void worker.terminate().catch(() => undefined);
    }
  }

  function replaceCatalogCollectionProjection(lots: CollectionLot[]) {
    return catalogQueryWorker
      ? sendCatalogOperation(catalogQueryWorker, "collection-projection-replace", [lots])
      : Promise.resolve();
  }

  function applyCatalogCollectionProjection(
    delta: Readonly<{ deletedLotIds: string[]; upserts: CollectionLot[] }>,
  ) {
    return catalogQueryWorker
      ? sendCatalogOperation(catalogQueryWorker, "collection-projection-apply", [delta])
      : Promise.resolve();
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
    catalogReplacement = barrier;

    return () => {
      resume();

      if (catalogReplacement === barrier) {
        catalogReplacement = undefined;
      }
    };
  }
}

export type CatalogService = ReturnType<typeof createCatalogService>;
