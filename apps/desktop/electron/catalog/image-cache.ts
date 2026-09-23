import { createRemoteAssetCache, type RemoteAssetCacheOptions } from "./remote-asset-cache.ts";

export type {
  RemoteAssetCache as CatalogImageCache,
  RemoteAssetFetcher as CatalogImageFetcher,
} from "./remote-asset-cache.ts";

export const CATALOG_IMAGE_CACHE_MAX_BYTES = 512 * 1024 * 1024;
export const CATALOG_IMAGE_MAX_RESPONSE_BYTES = 15 * 1024 * 1024;

export function createCatalogImageCache(options: RemoteAssetCacheOptions) {
  return createRemoteAssetCache(options, {
    origin: "https://cards.scryfall.io",
    contentTypes: new Map([
      ["jpeg", "image/jpeg"],
      ["jpg", "image/jpeg"],
      ["png", "image/png"],
      ["webp", "image/webp"],
    ]),
    maxBytes: CATALOG_IMAGE_CACHE_MAX_BYTES,
    maxResponseBytes: CATALOG_IMAGE_MAX_RESPONSE_BYTES,
  });
}
