import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import {
  CATALOG_IMAGE_CACHE_MAX_BYTES,
  CATALOG_IMAGE_MAX_RESPONSE_BYTES,
  createCatalogImageCache,
  type CatalogImageFetcher,
} from "../electron/catalog/image-cache.ts";
import { resolveCatalogImageCacheDirectory } from "../electron/catalog/image-cache-directory.ts";

const JPEG_HEADERS = { "content-type": "image/jpeg" };

void test("catalog images use the operating-system cache location", () => {
  assert.equal(
    resolveCatalogImageCacheDirectory("/Users/alex", "darwin", {}),
    "/Users/alex/Library/Caches/Mooligan/catalog-images",
  );
  assert.equal(
    resolveCatalogImageCacheDirectory("/home/alex", "linux", {
      XDG_CACHE_HOME: "/var/cache/alex",
    }),
    "/var/cache/alex/mooligan/catalog-images",
  );
  assert.equal(
    resolveCatalogImageCacheDirectory("/home/alex", "linux", {
      XDG_CACHE_HOME: "relative-cache",
    }),
    "/home/alex/.cache/mooligan/catalog-images",
  );
  assert.equal(
    resolveCatalogImageCacheDirectory("C:\\Users\\Alex", "win32", {
      LOCALAPPDATA: "D:\\LocalData",
    }),
    "D:\\LocalData\\Mooligan\\catalog-images",
  );
});

void test("catalog images are keyed by canonical URL and survive a cache restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-cache-"));
  const requestedUrl = "https://CARDS.SCRYFALL.IO:443/normal/front/test.JPG?version=2";
  const canonicalUrl = "https://cards.scryfall.io/normal/front/test.JPG?version=2";
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  let requests = 0;
  const fetchImage: CatalogImageFetcher = async (url, init) => {
    requests += 1;
    assert.equal(url, canonicalUrl);
    assert.deepEqual(init, {
      headers: { "user-agent": "Mooligan/desktop" },
      redirect: "error",
    });
    return imageResponse(bytes);
  };

  try {
    const firstCache = createCatalogImageCache({ cacheDirectory: directory, fetch: fetchImage });
    const first = await firstCache.get(requestedUrl);

    assert.equal(first.status, "available");
    if (first.status !== "available") {
      return;
    }

    const expectedKey = createHash("sha256").update(canonicalUrl).digest("hex");
    assert.equal(basename(first.path), `${expectedKey}.jpg`);
    assert.equal(first.contentType, "image/jpeg");
    assert.equal(first.source, "network");
    assert.deepEqual([...(await readFile(first.path))], [...bytes]);

    const restartedCache = createCatalogImageCache({
      cacheDirectory: directory,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const restarted = await restartedCache.get(requestedUrl);

    assert.deepEqual(restarted, { ...first, source: "cache" });
    assert.equal(requests, 1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("concurrent cache misses share one download and cache hits update access time", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-cache-"));
  const url = "https://cards.scryfall.io/small/front/concurrent.jpg";
  let releaseDownload: (() => void) | undefined;
  const downloadReleased = new Promise<void>((resolve) => {
    releaseDownload = resolve;
  });
  let requests = 0;
  let clock = Date.UTC(2026, 7, 14, 12);
  const cache = createCatalogImageCache({
    cacheDirectory: directory,
    fetch: async () => {
      requests += 1;
      await downloadReleased;
      return imageResponse(new Uint8Array([1, 2, 3]));
    },
    now: () => clock,
  });

  try {
    const firstRequest = cache.get(url);
    const secondRequest = cache.get(url);
    releaseDownload?.();
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    assert.equal(requests, 1);
    assert.deepEqual(second, first);
    assert.equal(first.status, "available");
    if (first.status !== "available") {
      return;
    }

    const oldAccess = new Date(clock - 60_000);
    await utimes(first.path, oldAccess, oldAccess);
    clock += 60_000;

    const hit = await cache.get(url);
    assert.equal(hit.status, "available");
    assert.equal(hit.status === "available" && hit.source, "cache");
    assert.equal((await stat(first.path)).atimeMs, clock);
    assert.equal(requests, 1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("source, response, and response-size validation fail closed and failures are memoized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-cache-"));
  const invalidSources = [
    "http://cards.scryfall.io/small/front/card.jpg",
    "https://images.scryfall.io/small/front/card.jpg",
    "https://cards.scryfall.io:444/small/front/card.jpg",
    "https://cards.scryfall.io/small/front/card.gif",
  ];
  let requests = 0;
  const cache = createCatalogImageCache({
    cacheDirectory: directory,
    fetch: async (url) => {
      requests += 1;

      if (url.endsWith("bad-mime.jpg")) {
        return imageResponse(new Uint8Array([1]), { "content-type": "image/png" });
      }
      if (url.endsWith("too-large.jpg")) {
        return imageResponse(new Uint8Array([1]), {
          ...JPEG_HEADERS,
          "content-length": String(CATALOG_IMAGE_MAX_RESPONSE_BYTES + 1),
        });
      }
      if (url.endsWith("stream-too-large.jpg")) {
        return imageResponse(new Uint8Array([1, 2, 3, 4]));
      }

      return new Response(null, { status: 503 });
    },
    maxResponseBytes: 3,
  });

  try {
    for (const url of invalidSources) {
      assert.deepEqual(await cache.get(url), { status: "unavailable" });
    }
    assert.equal(requests, 0);

    const failures = [
      "https://cards.scryfall.io/small/front/http-error.jpg",
      "https://cards.scryfall.io/small/front/bad-mime.jpg",
      "https://cards.scryfall.io/small/front/too-large.jpg",
      "https://cards.scryfall.io/small/front/stream-too-large.jpg",
    ];

    for (const url of failures) {
      assert.deepEqual(await cache.get(url), { status: "unavailable" });
      assert.deepEqual(await cache.get(url), { status: "unavailable" });
    }

    assert.equal(requests, failures.length);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("startup removes abandoned partials and interrupted writes never become hits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-cache-"));
  const abandoned = join(directory, "abandoned-download.part");
  const unrelated = join(directory, "keep-me.txt");
  await writeFile(abandoned, "partial image");
  await writeFile(unrelated, "unrelated file");
  let requests = 0;
  const cache = createCatalogImageCache({
    cacheDirectory: directory,
    fetch: async () => {
      requests += 1;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.error(new Error("connection lost"));
          },
        }),
        { headers: JPEG_HEADERS },
      );
    },
  });

  try {
    await cache.initialize();
    assert.deepEqual(await readdir(directory), ["keep-me.txt"]);

    const url = "https://cards.scryfall.io/normal/front/interrupted.jpeg";
    assert.deepEqual(await cache.get(url), { status: "unavailable" });
    assert.deepEqual(await cache.get(url), { status: "unavailable" });
    assert.equal(requests, 1);
    assert.deepEqual(await readdir(directory), ["keep-me.txt"]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("cache writes evict the least recently used image above the byte budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-cache-"));
  let clock = Date.UTC(2026, 7, 14, 12);
  const cache = createCatalogImageCache({
    cacheDirectory: directory,
    fetch: async () => imageResponse(new Uint8Array([1, 2, 3, 4])),
    maxBytes: 8,
    now: () => clock,
  });
  const urls = ["one", "two", "three"].map(
    (name) => `https://cards.scryfall.io/small/front/${name}.jpg`,
  );

  try {
    const first = await cache.get(urls[0]!);
    clock += 1_000;
    const second = await cache.get(urls[1]!);
    clock += 1_000;
    assert.equal((await cache.get(urls[0]!)).status, "available");
    clock += 1_000;
    const third = await cache.get(urls[2]!);

    assert.equal(first.status, "available");
    assert.equal(second.status, "available");
    assert.equal(third.status, "available");
    if (
      first.status !== "available" ||
      second.status !== "available" ||
      third.status !== "available"
    ) {
      return;
    }

    assert.equal((await stat(first.path)).size, 4);
    await assert.rejects(stat(second.path), { code: "ENOENT" });
    assert.equal((await stat(third.path)).size, 4);
    assert.equal(CATALOG_IMAGE_CACHE_MAX_BYTES, 512 * 1024 * 1024);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("distinct concurrent downloads share one serialized eviction budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-cache-"));
  const oldAccess = new Date(0);
  await Promise.all(
    Array.from({ length: 64 }, async (_, index) => {
      const path = join(directory, `${index.toString(16).padStart(64, "0")}.jpg`);
      await writeFile(path, new Uint8Array([index]));
      await utimes(path, oldAccess, oldAccess);
    }),
  );

  let downloadsArrived = 0;
  let releaseDownloads: (() => void) | undefined;
  const downloadsReady = new Promise<void>((resolve) => {
    releaseDownloads = resolve;
  });
  const cache = createCatalogImageCache({
    cacheDirectory: directory,
    fetch: async () => {
      downloadsArrived += 1;
      if (downloadsArrived === 2) {
        releaseDownloads?.();
      }
      await downloadsReady;
      return imageResponse(new Uint8Array([1, 2, 3, 4]));
    },
    maxBytes: 8,
  });

  try {
    const [first, second] = await Promise.all([
      cache.get("https://cards.scryfall.io/small/front/parallel-one.jpg"),
      cache.get("https://cards.scryfall.io/small/front/parallel-two.jpg"),
    ]);

    assert.equal(first.status, "available");
    assert.equal(second.status, "available");
    if (first.status !== "available" || second.status !== "available") {
      return;
    }

    assert.equal((await stat(first.path)).size, 4);
    assert.equal((await stat(second.path)).size, 4);
    assert.equal((await readdir(directory)).length, 2);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

function imageResponse(body: BodyInit, headers: HeadersInit = JPEG_HEADERS) {
  return new Response(body, { headers });
}
