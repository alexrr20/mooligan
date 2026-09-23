import { createRemoteAssetCache, type RemoteAssetCacheOptions } from "./remote-asset-cache.ts";

export const CATALOG_SET_SYMBOL_MAX_RESPONSE_BYTES = 256 * 1024;
export type { RemoteAssetCache as CatalogSetSymbolCache } from "./remote-asset-cache.ts";

export function createCatalogSetSymbolCache(options: RemoteAssetCacheOptions) {
  return createRemoteAssetCache(options, {
    origin: "https://svgs.scryfall.io",
    contentTypes: new Map([["svg", "image/svg+xml"]]),
    maxResponseBytes: CATALOG_SET_SYMBOL_MAX_RESPONSE_BYTES,
  });
}
