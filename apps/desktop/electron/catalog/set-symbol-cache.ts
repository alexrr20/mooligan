import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CATALOG_SET_SYMBOL_MAX_RESPONSE_BYTES = 256 * 1024;

const SCRYFALL_SYMBOL_ORIGIN = "https://svgs.scryfall.io";
const SCRYFALL_SYMBOL_HEADERS = { "user-agent": "Mooligan/desktop" };
const UNAVAILABLE = { status: "unavailable" } as const;

export type CatalogSetSymbolCacheResult =
  | { path: string; source: "cache" | "network"; status: "available" }
  | typeof UNAVAILABLE;

export type CatalogSetSymbolFetcher = (
  url: string,
  init: { headers: Record<string, string>; redirect: "error" },
) => Promise<Response>;

export type CatalogSetSymbolCacheOptions = {
  cacheDirectory: string;
  fetch?: CatalogSetSymbolFetcher;
  maxResponseBytes?: number;
  now?: () => number;
};

export type CatalogSetSymbolCache = {
  get(sourceUrl: string): Promise<CatalogSetSymbolCacheResult>;
  initialize(): Promise<void>;
};

export function createCatalogSetSymbolCache(
  options: CatalogSetSymbolCacheOptions,
): CatalogSetSymbolCache {
  const cacheDirectory = options.cacheDirectory;
  const fetchSymbol = options.fetch ?? globalThis.fetch;
  const maxResponseBytes = options.maxResponseBytes ?? CATALOG_SET_SYMBOL_MAX_RESPONSE_BYTES;
  const now = options.now ?? Date.now;

  if (!cacheDirectory) {
    throw new TypeError("A set symbol cache directory is required");
  }
  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes <= 0 ||
    maxResponseBytes > CATALOG_SET_SYMBOL_MAX_RESPONSE_BYTES
  ) {
    throw new TypeError("The set symbol response limit must be between 1 byte and 256 KiB");
  }

  const downloads = new Map<string, Promise<CatalogSetSymbolCacheResult>>();
  let initialization: Promise<void> | undefined;

  function initialize() {
    initialization ??= prepareCacheDirectory(cacheDirectory).catch((cause: unknown) => {
      initialization = undefined;
      throw cause;
    });
    return initialization;
  }

  async function get(sourceUrl: string): Promise<CatalogSetSymbolCacheResult> {
    let source: { fileName: string; url: string };
    try {
      source = describeSource(sourceUrl);
      await initialize();
    } catch {
      return UNAVAILABLE;
    }

    const path = join(cacheDirectory, source.fileName);
    try {
      const cached = await stat(path);
      if (cached.isFile()) {
        await utimes(path, new Date(now()), cached.mtime);
        return { path, source: "cache", status: "available" };
      }
    } catch {
      // A missing or unreadable cache entry can be downloaded again.
    }

    const active = downloads.get(source.fileName);
    if (active) {
      return active;
    }

    const download = downloadSymbol({
      cacheDirectory,
      fetchSymbol,
      maxResponseBytes,
      source,
    })
      .catch(() => UNAVAILABLE)
      .finally(() => downloads.delete(source.fileName));
    downloads.set(source.fileName, download);
    return download;
  }

  return { get, initialize };
}

function describeSource(sourceUrl: string) {
  const url = new URL(sourceUrl);
  if (
    url.origin !== SCRYFALL_SYMBOL_ORIGIN ||
    url.username ||
    url.password ||
    !url.pathname.toLowerCase().endsWith(".svg")
  ) {
    throw new TypeError("Unsupported set symbol source");
  }

  return {
    fileName: `${createHash("sha256").update(url.href).digest("hex")}.svg`,
    url: url.href,
  };
}

async function prepareCacheDirectory(cacheDirectory: string) {
  await mkdir(cacheDirectory, { recursive: true });
  const entries = await readdir(cacheDirectory, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      entry.name.endsWith(".part")
        ? rm(join(cacheDirectory, entry.name), { force: true, recursive: true })
        : Promise.resolve(),
    ),
  );
}

async function downloadSymbol(options: {
  cacheDirectory: string;
  fetchSymbol: CatalogSetSymbolFetcher;
  maxResponseBytes: number;
  source: { fileName: string; url: string };
}): Promise<CatalogSetSymbolCacheResult> {
  const response = await options.fetchSymbol(options.source.url, {
    headers: SCRYFALL_SYMBOL_HEADERS,
    redirect: "error",
  });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = Number(response.headers.get("content-length"));
  const responseUrlMatches = !response.url || new URL(response.url).href === options.source.url;
  if (
    !response.ok ||
    !response.body ||
    !responseUrlMatches ||
    contentType !== "image/svg+xml" ||
    (Number.isFinite(contentLength) && contentLength > options.maxResponseBytes)
  ) {
    return UNAVAILABLE;
  }

  const bytes = await readBoundedBody(response.body, options.maxResponseBytes);
  if (!bytes || bytes.byteLength === 0) {
    return UNAVAILABLE;
  }

  const path = join(options.cacheDirectory, options.source.fileName);
  const partial = join(options.cacheDirectory, `${randomUUID()}.part`);
  try {
    await writeFile(partial, bytes, { flag: "wx" });
    await rename(partial, path);
    return { path, source: "network", status: "available" };
  } finally {
    await rm(partial, { force: true }).catch(() => undefined);
  }
}

async function readBoundedBody(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readCachedCatalogSetSymbol(path: string) {
  return new Uint8Array(await readFile(path));
}
