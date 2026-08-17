import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  utimes,
  type FileHandle,
} from "node:fs/promises";
import { extname, join } from "node:path";
import * as z from "zod";

export const CATALOG_IMAGE_CACHE_MAX_BYTES = 512 * 1024 * 1024;
export const CATALOG_IMAGE_MAX_RESPONSE_BYTES = 15 * 1024 * 1024;

const SCRYFALL_IMAGE_ORIGIN = "https://cards.scryfall.io";
const SCRYFALL_IMAGE_REQUEST_HEADERS = { "user-agent": "Mooligan/desktop" };
const CACHE_FILE_PATTERN = /^[a-f0-9]{64}\.(?:jpe?g|png|webp)$/;
const UNAVAILABLE = { status: "unavailable" } as const;

const imageContentTypes = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

type CatalogImageExtension = keyof typeof imageContentTypes;
const CatalogImageExtensionSchema = z.enum(["jpeg", "jpg", "png", "webp"]);

export type CatalogImageContentType = (typeof imageContentTypes)[CatalogImageExtension];

export type CatalogImageCacheResult =
  | {
      status: "available";
      path: string;
      contentType: CatalogImageContentType;
      source: "cache" | "network";
    }
  | typeof UNAVAILABLE;

export type CatalogImageFetcher = (
  url: string,
  init: { headers: Record<string, string>; redirect: "error" },
) => Promise<Response>;

export interface CatalogImageCacheOptions {
  cacheDirectory: string;
  fetch?: CatalogImageFetcher;
  maxBytes?: number;
  maxResponseBytes?: number;
  now?: () => number;
}

export interface CatalogImageCache {
  initialize(): Promise<void>;
  get(sourceUrl: string): Promise<CatalogImageCacheResult>;
}

interface CatalogImageSource {
  canonicalUrl: string;
  contentType: CatalogImageContentType;
  fileName: string;
}

interface CacheEntry {
  atimeMs: number;
  mtimeMs: number;
  name: string;
  path: string;
  size: number;
}

/**
 * Creates the process-owned persistent image cache. The service deliberately uses
 * Node's fetch by default: Electron's net.fetch rejects Scryfall responses whose
 * Content-Disposition filename contains Unicode. Tests can inject a fetcher.
 */
export function createCatalogImageCache(options: CatalogImageCacheOptions): CatalogImageCache {
  const cacheDirectory = options.cacheDirectory;
  const fetchImage = options.fetch ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? CATALOG_IMAGE_CACHE_MAX_BYTES;
  const maxResponseBytes = options.maxResponseBytes ?? CATALOG_IMAGE_MAX_RESPONSE_BYTES;
  const now = options.now ?? Date.now;

  if (cacheDirectory.length === 0) {
    throw new TypeError("A cache directory is required");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("The cache size must be a positive safe integer");
  }
  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes <= 0 ||
    maxResponseBytes > CATALOG_IMAGE_MAX_RESPONSE_BYTES
  ) {
    throw new TypeError("The response size limit must be between 1 byte and 15 MiB");
  }

  const failedSources = new Set<string>();
  const downloads = new Map<string, Promise<CatalogImageCacheResult>>();
  let evictionQueue = Promise.resolve();
  let initialization: Promise<void> | undefined;

  function initialize() {
    initialization ??= prepareCacheDirectory(cacheDirectory);
    return initialization;
  }

  async function get(sourceUrl: string): Promise<CatalogImageCacheResult> {
    if (failedSources.has(sourceUrl)) {
      return UNAVAILABLE;
    }

    let source: CatalogImageSource;

    try {
      source = describeSource(sourceUrl);
    } catch {
      failedSources.add(sourceUrl);
      return UNAVAILABLE;
    }

    try {
      await initialize();

      const cached = await readCacheHit(cacheDirectory, source, now());
      if (cached) {
        return cached;
      }

      if (failedSources.has(source.canonicalUrl)) {
        return UNAVAILABLE;
      }

      const existingDownload = downloads.get(source.fileName);
      if (existingDownload) {
        return existingDownload;
      }

      const download = downloadAndCache({
        cacheDirectory,
        evict: (newestPath) => {
          const eviction = evictionQueue.then(() =>
            evictLeastRecentlyUsed(cacheDirectory, maxBytes, newestPath),
          );
          evictionQueue = eviction.catch(() => undefined);
          return eviction;
        },
        fetchImage,
        maxResponseBytes,
        now,
        source,
      })
        .catch(() => {
          failedSources.add(source.canonicalUrl);
          return UNAVAILABLE;
        })
        .finally(() => downloads.delete(source.fileName));

      downloads.set(source.fileName, download);
      return download;
    } catch {
      failedSources.add(source.canonicalUrl);
      return UNAVAILABLE;
    }
  }

  return { get, initialize };
}

function describeSource(sourceUrl: string): CatalogImageSource {
  const url = new URL(sourceUrl);

  if (url.origin !== SCRYFALL_IMAGE_ORIGIN || url.username.length > 0 || url.password.length > 0) {
    throw new TypeError("Unsupported catalog image origin");
  }

  const extension = CatalogImageExtensionSchema.safeParse(
    extname(url.pathname).slice(1).toLowerCase(),
  );
  if (!extension.success) {
    throw new TypeError("Unsupported catalog image extension");
  }
  const contentType = imageContentTypes[extension.data];

  const canonicalUrl = url.href;
  const key = createHash("sha256").update(canonicalUrl).digest("hex");

  return {
    canonicalUrl,
    contentType,
    fileName: `${key}.${extension.data}`,
  };
}

async function prepareCacheDirectory(cacheDirectory: string) {
  await mkdir(cacheDirectory, { recursive: true });
  const entries = await readdir(cacheDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.name.endsWith(".part") || (!entry.isFile() && !entry.isSymbolicLink())) {
        return;
      }

      try {
        await unlink(join(cacheDirectory, entry.name));
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }
    }),
  );
}

async function readCacheHit(
  cacheDirectory: string,
  source: CatalogImageSource,
  accessedAt: number,
): Promise<CatalogImageCacheResult | null> {
  const path = join(cacheDirectory, source.fileName);

  try {
    const file = await stat(path);
    if (!file.isFile()) {
      return null;
    }

    await utimes(path, new Date(accessedAt), file.mtime);
    return {
      status: "available",
      path,
      contentType: source.contentType,
      source: "cache",
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function downloadAndCache({
  cacheDirectory,
  evict,
  fetchImage,
  maxResponseBytes,
  now,
  source,
}: {
  cacheDirectory: string;
  evict: (newestPath: string) => Promise<void>;
  fetchImage: CatalogImageFetcher;
  maxResponseBytes: number;
  now: () => number;
  source: CatalogImageSource;
}): Promise<CatalogImageCacheResult> {
  const response = await fetchImage(source.canonicalUrl, {
    headers: SCRYFALL_IMAGE_REQUEST_HEADERS,
    redirect: "error",
  });

  if (!response.ok || !response.body) {
    throw new Error("Catalog image download failed");
  }
  if (
    response.url.length > 0 &&
    describeSource(response.url).canonicalUrl !== source.canonicalUrl
  ) {
    throw new Error("Catalog image redirect is not allowed");
  }

  const responseContentType = parseContentType(response.headers.get("content-type"));
  if (responseContentType !== source.contentType) {
    throw new Error("Catalog image response has an unexpected content type");
  }

  validateDeclaredContentLength(response.headers.get("content-length"), maxResponseBytes);

  const destination = join(cacheDirectory, source.fileName);
  const partial = join(cacheDirectory, `${source.fileName}.${randomUUID()}.part`);
  let partialFile: FileHandle | undefined;

  try {
    partialFile = await open(partial, "wx");
    const bytesWritten = await writeResponseBody(partialFile, response.body, maxResponseBytes);

    if (bytesWritten === 0) {
      throw new Error("Catalog image response is empty");
    }

    await partialFile.sync();
    await partialFile.close();
    partialFile = undefined;
    await rename(partial, destination);

    const accessedAt = now();
    await utimes(destination, new Date(accessedAt), new Date(accessedAt));
    await evict(destination);

    try {
      await stat(destination);
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new Error("Catalog image exceeds the cache capacity");
      }
      throw error;
    }

    return {
      status: "available",
      path: destination,
      contentType: source.contentType,
      source: "network",
    };
  } finally {
    await partialFile?.close().catch(() => undefined);
    await rm(partial, { force: true }).catch(() => undefined);
  }
}

function parseContentType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase();
}

function validateDeclaredContentLength(value: string | null, maxResponseBytes: number) {
  if (value === null) {
    return;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("Catalog image response has an invalid content length");
  }

  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength > maxResponseBytes) {
    throw new Error("Catalog image response exceeds the size limit");
  }
}

async function writeResponseBody(
  file: FileHandle,
  body: ReadableStream<Uint8Array>,
  maxResponseBytes: number,
) {
  const reader = body.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return totalBytes;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Catalog image response exceeds the size limit");
      }

      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await file.write(value, offset, value.byteLength - offset, null);
        if (bytesWritten === 0) {
          throw new Error("Catalog image cache write made no progress");
        }
        offset += bytesWritten;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function evictLeastRecentlyUsed(
  cacheDirectory: string,
  maxBytes: number,
  newestPath: string,
) {
  const entries = await listCacheEntries(cacheDirectory);
  let totalBytes = entries.reduce((total, entry) => total + entry.size, 0);

  if (totalBytes <= maxBytes) {
    return;
  }

  entries.sort(
    (left, right) =>
      Number(left.path === newestPath) - Number(right.path === newestPath) ||
      left.atimeMs - right.atimeMs ||
      left.mtimeMs - right.mtimeMs ||
      left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    try {
      await unlink(entry.path);
      totalBytes -= entry.size;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    if (totalBytes <= maxBytes) {
      return;
    }
  }
}

async function listCacheEntries(cacheDirectory: string) {
  const directoryEntries = await readdir(cacheDirectory, { withFileTypes: true });
  const cacheEntries: CacheEntry[] = [];

  for (const entry of directoryEntries) {
    if (!entry.isFile() || !CACHE_FILE_PATTERN.test(entry.name)) {
      continue;
    }

    const path = join(cacheDirectory, entry.name);
    try {
      const file = await stat(path);
      cacheEntries.push({
        atimeMs: file.atimeMs,
        mtimeMs: file.mtimeMs,
        name: entry.name,
        path,
        size: file.size,
      });
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }

  return cacheEntries;
}

function isMissingFileError(cause: unknown) {
  const error = z.object({ code: z.string().optional() }).safeParse(cause);
  return error.success && error.data.code === "ENOENT";
}
