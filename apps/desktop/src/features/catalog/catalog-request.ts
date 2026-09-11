import type { CatalogListRequest } from "@mooligan/domain/catalog-search";
import type { CollectionListRequest } from "@mooligan/domain/collection";

export function listCatalog(request: CatalogListRequest, signal: AbortSignal) {
  return readCatalogRequest(
    (id) => window.catalog.list(request, id),
    window.catalog.cancelQuery,
    signal,
  );
}

export function listCollection(request: CollectionListRequest, signal: AbortSignal) {
  return readCatalogRequest(
    (id) => window.collection.list(request, id),
    window.catalog.cancelQuery,
    signal,
  );
}

export async function readCatalogRequest<Result>(
  read: (requestId: string) => Promise<Result>,
  cancel: (requestId: string) => Promise<void>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  const abort = () => {
    void cancel(requestId).catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await read(requestId);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
