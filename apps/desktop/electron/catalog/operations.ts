import type { CatalogDatabase } from "@mooligan/catalog/database";
import {
  createCatalogColorsQuery,
  createCatalogQuery,
  createCatalogRootSetQuery,
  createCatalogSpoilerRevealSummariesQuery,
  createCatalogUpcomingPrintingsQuery,
  createCatalogUpcomingQuery,
} from "@mooligan/catalog/query";
import {
  createCatalogDetailQuery,
  createCatalogImageSourceQuery,
  createCatalogSetSymbolSourceQuery,
} from "@mooligan/catalog/detail";
import { createCollectionQuery } from "@mooligan/catalog/collection-query";
import { createCollectionProjection } from "@mooligan/catalog/collection-projection";
import { createDeckCostQuery } from "@mooligan/catalog/deck-cost";

export function createCatalogOperations(database: CatalogDatabase) {
  const collection = createCollectionProjection(database);
  return {
    "deck-cost": createDeckCostQuery(database),
    colors: createCatalogColorsQuery(database),
    detail: createCatalogDetailQuery(database),
    "image-source": createCatalogImageSourceQuery(database),
    list: createCatalogQuery(database),
    "collection-list": createCollectionQuery(database),
    "root-set": createCatalogRootSetQuery(database),
    "set-symbol-source": createCatalogSetSymbolSourceQuery(database),
    "spoiler-reveals": createCatalogSpoilerRevealSummariesQuery(database),
    upcoming: createCatalogUpcomingQuery(database),
    "upcoming-printings": createCatalogUpcomingPrintingsQuery(database),
    "collection-projection-replace": collection.replace,
    "collection-projection-apply": collection.apply,
  };
}

type CatalogOperations = ReturnType<typeof createCatalogOperations>;
export type CatalogOperation = keyof CatalogOperations;
export type CatalogOperationArguments<Operation extends CatalogOperation> = Parameters<
  CatalogOperations[Operation]
>;
export type CatalogOperationResult<Operation extends CatalogOperation> = ReturnType<
  CatalogOperations[Operation]
>;

// These messages stay between the main process and its bundled worker. Validate
// renderer input in IPC handlers and stored data in the shared catalog queries.
export type CatalogWorkerRequest<Operation extends CatalogOperation = CatalogOperation> = {
  id: number;
  operation: Operation;
  args: CatalogOperationArguments<Operation>;
};
export type CatalogWorkerResponse<Operation extends CatalogOperation = CatalogOperation> = {
  id: number;
  operation: Operation;
} & ({ result: CatalogOperationResult<Operation> } | { error: string });

export function executeCatalogRequest<Operation extends CatalogOperation>(
  operations: CatalogOperations,
  request: CatalogWorkerRequest<Operation>,
): CatalogWorkerResponse<Operation> {
  const { id, operation, args } = request;
  try {
    // SAFETY: the request arguments and result are derived from this exact handler key.
    const handler = operations[operation] as (
      ...values: CatalogOperationArguments<Operation>
    ) => CatalogOperationResult<Operation>;
    return { id, operation, result: handler(...args) };
  } catch (error) {
    return { id, operation, error: error instanceof Error ? error.message : String(error) };
  }
}
