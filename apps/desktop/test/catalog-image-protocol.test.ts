import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CatalogImageCache } from "../electron/catalog/image-cache.ts";
import {
  parseCatalogImageUrl,
  registerCatalogImageProtocol,
} from "../electron/catalog/image-protocol.ts";
import { catalogImageUrl } from "../src/features/catalog/catalog-image.ts";

void test("renderer image descriptors round-trip without exposing a remote URL", () => {
  const descriptor = {
    faceIndex: 1,
    printingId: "printing / multilingual",
    size: "normal",
  } as const;
  const url = catalogImageUrl(descriptor);

  assert.equal(url.includes("scryfall"), false);
  assert.deepEqual(parseCatalogImageUrl(url), descriptor);
});

void test("compact thumbnail descriptors round-trip through the image protocol", () => {
  const descriptor = {
    faceIndex: 0,
    printingId: "printing-1",
    size: "thumb",
  } as const;

  assert.deepEqual(parseCatalogImageUrl(catalogImageUrl(descriptor)), descriptor);
});

void test("grid image descriptors round-trip through the image protocol", () => {
  const descriptor = {
    faceIndex: 0,
    printingId: "printing-1",
    size: "grid",
  } as const;

  assert.deepEqual(parseCatalogImageUrl(catalogImageUrl(descriptor)), descriptor);
});

void test("catalog image URLs reject untrusted hosts, faces, sizes, and shapes", () => {
  assert.equal(parseCatalogImageUrl("https://catalog/printing-1/0/small"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://attacker/printing-1/0/small"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://catalog/printing-1/-1/small"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://catalog/printing-1/0/large"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://catalog/printing-1/0/small/extra"), null);
});

void test("a refused image source cannot reach already cached bytes", async () => {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let cacheReads = 0;
  const targetSession = {
    protocol: {
      handle(_scheme: string, callback: (request: Request) => Promise<Response>) {
        handler = callback;
      },
    },
  };
  const cache: CatalogImageCache = {
    async get() {
      cacheReads += 1;
      return { status: "unavailable" };
    },
    async initialize() {},
  };

  registerCatalogImageProtocol(targetSession, cache, async () => null);
  assert.ok(handler);
  const response = await handler(
    new Request("mooligan-image://catalog/protected-printing/0/normal"),
  );
  assert.equal(response.status, 404);
  assert.equal(cacheReads, 0);
});

void test("an image authorization is checked again after cached bytes are read", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-image-authorization-"));

  try {
    const path = join(directory, "printing.webp");
    await writeFile(path, new Uint8Array([1, 2, 3]));
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let authorized = true;
    const targetSession = {
      protocol: {
        handle(_scheme: string, callback: (request: Request) => Promise<Response>) {
          handler = callback;
        },
      },
    };
    const cache: CatalogImageCache = {
      async get() {
        authorized = false;
        return {
          contentType: "image/webp" as const,
          path,
          source: "cache" as const,
          status: "available" as const,
        };
      },
      async initialize() {},
    };

    registerCatalogImageProtocol(targetSession, cache, async () => ({
      isCurrent: () => authorized,
      sourceUrl: "https://cards.example/printing.webp",
    }));
    assert.ok(handler);
    const response = await handler(
      new Request("mooligan-image://catalog/preview-printing/0/normal"),
    );

    assert.equal(response.status, 404);
    assert.equal(await response.arrayBuffer().then(({ byteLength }) => byteLength), 0);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
