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

import { isFileNotFound } from "./files.ts";

const REQUEST_HEADERS = { "user-agent": "Mooligan/desktop" };
const UNAVAILABLE = { status: "unavailable" } as const;

export type RemoteAssetCacheResult =
  | {
      status: "available";
      path: string;
      contentType: string;
      source: "cache" | "network";
    }
  | typeof UNAVAILABLE;

export type RemoteAssetFetcher = (
  url: string,
  init: { headers: Record<string, string>; redirect: "error" },
) => Promise<Response>;

export interface RemoteAssetCacheOptions {
  cacheDirectory: string;
  fetch?: RemoteAssetFetcher;
  maxBytes?: number;
  maxResponseBytes?: number;
  now?: () => number;
}

export interface RemoteAssetCache {
  initialize(): Promise<void>;
  get(sourceUrl: string): Promise<RemoteAssetCacheResult>;
}

interface RemoteAssetSource {
  canonicalUrl: string;
  contentType: string;
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
 * Creates the process-owned persistent asset cache. The service deliberately uses
 * Node's fetch by default: Electron's net.fetch rejects Scryfall responses whose
 * Content-Disposition filename contains Unicode. Tests can inject a fetcher.
 */
export function createRemoteAssetCache(
  options: RemoteAssetCacheOptions,
  policy: {
    origin: string;
    contentTypes: ReadonlyMap<string, string>;
    maxBytes?: number;
    maxResponseBytes: number;
  },
): RemoteAssetCache {
  const cacheDirectory = options.cacheDirectory;
  const fetchAsset = options.fetch ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? policy.maxBytes;
  const maxResponseBytes = options.maxResponseBytes ?? policy.maxResponseBytes;
  const now = options.now ?? Date.now;

  if (cacheDirectory.length === 0) {
    throw new TypeError("A cache directory is required");
  }
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)) {
    throw new TypeError("The cache size must be a positive safe integer");
  }
  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes <= 0 ||
    maxResponseBytes > policy.maxResponseBytes
  ) {
    throw new TypeError(
      `The response size limit must be between 1 and ${policy.maxResponseBytes} bytes`,
    );
  }

  const invalidSources = new Set<string>();
  const downloads = new Map<string, Promise<RemoteAssetCacheResult>>();
  let evictionQueue = Promise.resolve();
  let initialization: Promise<void> | undefined;

  function initialize() {
    initialization ??= prepareCacheDirectory(cacheDirectory).catch((cause: unknown) => {
      initialization = undefined;
      throw cause;
    });
    return initialization;
  }

  async function get(sourceUrl: string): Promise<RemoteAssetCacheResult> {
    if (invalidSources.has(sourceUrl)) {
      return UNAVAILABLE;
    }

    let source: RemoteAssetSource;

    try {
      source = describeSource(sourceUrl, policy.origin, policy.contentTypes);
    } catch {
      invalidSources.add(sourceUrl);
      return UNAVAILABLE;
    }

    try {
      await initialize();

      const cached = await readCacheHit(cacheDirectory, source, now());
      if (cached) {
        return cached;
      }

      const existingDownload = downloads.get(source.fileName);
      if (existingDownload) {
        return existingDownload;
      }

      const download = downloadAndCache({
        cacheDirectory,
        evict: (newestPath) => {
          if (maxBytes === undefined) return Promise.resolve();
          const eviction = evictionQueue.then(() =>
            evictLeastRecentlyUsed(cacheDirectory, maxBytes, newestPath, policy.contentTypes),
          );
          evictionQueue = eviction.catch(() => undefined);
          return eviction;
        },
        fetchAsset,
        maxResponseBytes,
        now,
        source,
      })
        .catch(() => UNAVAILABLE)
        .finally(() => downloads.delete(source.fileName));

      downloads.set(source.fileName, download);
      return download;
    } catch {
      return UNAVAILABLE;
    }
  }

  return { get, initialize };
}

function describeSource(
  sourceUrl: string,
  origin: string,
  contentTypes: ReadonlyMap<string, string>,
): RemoteAssetSource {
  const url = new URL(sourceUrl);

  if (url.origin !== origin || url.username.length > 0 || url.password.length > 0) {
    throw new TypeError("Unsupported remote asset origin");
  }

  const extension = extname(url.pathname).slice(1).toLowerCase();
  const contentType = contentTypes.get(extension);
  if (!contentType) throw new TypeError("Unsupported remote asset extension");

  const canonicalUrl = url.href;
  const key = createHash("sha256").update(canonicalUrl).digest("hex");

  return {
    canonicalUrl,
    contentType,
    fileName: `${key}.${extension}`,
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
        if (!isFileNotFound(error)) {
          throw error;
        }
      }
    }),
  );
}

async function readCacheHit(
  cacheDirectory: string,
  source: RemoteAssetSource,
  accessedAt: number,
): Promise<RemoteAssetCacheResult | null> {
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
    if (isFileNotFound(error)) {
      return null;
    }

    throw error;
  }
}

async function downloadAndCache({
  cacheDirectory,
  evict,
  fetchAsset,
  maxResponseBytes,
  now,
  source,
}: {
  cacheDirectory: string;
  evict: (newestPath: string) => Promise<void>;
  fetchAsset: RemoteAssetFetcher;
  maxResponseBytes: number;
  now: () => number;
  source: RemoteAssetSource;
}): Promise<RemoteAssetCacheResult> {
  const response = await fetchAsset(source.canonicalUrl, {
    headers: REQUEST_HEADERS,
    redirect: "error",
  });

  if (!response.ok || !response.body) {
    throw new Error("Remote asset download failed");
  }
  if (response.url.length > 0 && new URL(response.url).href !== source.canonicalUrl) {
    throw new Error("Remote asset redirect is not allowed");
  }

  const responseContentType = parseContentType(response.headers.get("content-type"));
  if (responseContentType !== source.contentType) {
    throw new Error("Remote asset response has an unexpected content type");
  }

  validateDeclaredContentLength(response.headers.get("content-length"), maxResponseBytes);

  const destination = join(cacheDirectory, source.fileName);
  const partial = join(cacheDirectory, `${source.fileName}.${randomUUID()}.part`);
  let partialFile: FileHandle | undefined;

  try {
    partialFile = await open(partial, "wx");
    const bytesWritten = await writeResponseBody(partialFile, response.body, maxResponseBytes);

    if (bytesWritten === 0) {
      throw new Error("Remote asset response is empty");
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
      if (isFileNotFound(error)) {
        throw new Error("Remote asset exceeds the cache capacity");
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
    throw new Error("Remote asset response has an invalid content length");
  }

  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength > maxResponseBytes) {
    throw new Error("Remote asset response exceeds the size limit");
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
        throw new Error("Remote asset response exceeds the size limit");
      }

      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await file.write(value, offset, value.byteLength - offset, null);
        if (bytesWritten === 0) {
          throw new Error("Remote asset cache write made no progress");
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
  contentTypes: ReadonlyMap<string, string>,
) {
  const entries = await listCacheEntries(cacheDirectory, contentTypes);
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
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    if (totalBytes <= maxBytes) {
      return;
    }
  }
}

async function listCacheEntries(cacheDirectory: string, contentTypes: ReadonlyMap<string, string>) {
  const directoryEntries = await readdir(cacheDirectory, { withFileTypes: true });
  const cacheEntries: CacheEntry[] = [];

  for (const entry of directoryEntries) {
    if (
      !entry.isFile() ||
      !/^[a-f0-9]{64}\.[a-z]+$/.test(entry.name) ||
      !contentTypes.has(extname(entry.name).slice(1))
    ) {
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
      if (!isFileNotFound(error)) {
        throw error;
      }
    }
  }

  return cacheEntries;
}

export function unavailableResponse(status: number) {
  return new Response(null, { headers: { "Cache-Control": "no-store" }, status });
}
