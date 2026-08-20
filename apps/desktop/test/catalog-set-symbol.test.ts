import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolveCatalogSetSymbolCacheDirectory } from "../electron/catalog/image-cache-directory.ts";
import {
  catalogSetSymbolScheme,
  parseCatalogSetSymbolUrl,
  registerCatalogSetSymbolProtocol,
} from "../electron/catalog/set-symbol-protocol.ts";
import {
  createCatalogSetSymbolCache,
  type CatalogSetSymbolCache,
} from "../electron/catalog/set-symbol-cache.ts";

void test("set symbols use their own operating-system cache directory", () => {
  assert.equal(
    resolveCatalogSetSymbolCacheDirectory("/Users/alex", "darwin", {}),
    "/Users/alex/Library/Caches/Mooligan/catalog-set-symbols",
  );
});

void test("set symbol cache accepts only bounded SVGs from the trusted host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-symbols-"));
  const source = "https://svgs.scryfall.io/sets/tst.svg";
  const bytes = new TextEncoder().encode("<svg/>");
  let requests = 0;

  try {
    const cache = createCatalogSetSymbolCache({
      cacheDirectory: directory,
      fetch: async (url, init) => {
        requests += 1;
        assert.equal(url, source);
        assert.deepEqual(init, {
          headers: { "user-agent": "Mooligan/desktop" },
          redirect: "error",
        });
        return responseWithUrl(bytes, source);
      },
    });
    const first = await cache.get(source);
    assert.equal(first.status, "available");
    assert.equal(first.status === "available" && first.source, "network");

    const restarted = createCatalogSetSymbolCache({
      cacheDirectory: directory,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const cached = await restarted.get(source);
    assert.equal(cached.status, "available");
    assert.equal(cached.status === "available" && cached.source, "cache");
    assert.equal(requests, 1);

    assert.deepEqual(await cache.get("https://cards.scryfall.io/sets/tst.svg"), {
      status: "unavailable",
    });

    for (const [index, response] of [
      new Response(bytes, { headers: { "content-type": "image/png" } }),
      new Response(new Uint8Array(), { headers: { "content-type": "image/svg+xml" } }),
      responseWithUrl(bytes, "https://svgs.scryfall.io/sets/redirected.svg"),
      new Response(new Uint8Array(9), {
        headers: { "content-length": "9", "content-type": "image/svg+xml" },
      }),
    ].entries()) {
      const isolated = createCatalogSetSymbolCache({
        cacheDirectory: join(directory, `case-${index}`),
        fetch: async () => response,
        maxResponseBytes: 8,
      });
      assert.deepEqual(await isolated.get(source), { status: "unavailable" });
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("set symbol protocol parses trusted descriptors and resolves before cache access", async () => {
  const descriptor = { setId: "set / multilingual" };
  const url = `${catalogSetSymbolScheme}://catalog/${encodeURIComponent(descriptor.setId)}`;
  assert.deepEqual(parseCatalogSetSymbolUrl(url), descriptor);
  assert.equal(parseCatalogSetSymbolUrl("https://catalog/set-tst"), null);
  assert.equal(parseCatalogSetSymbolUrl(`${url}?source=remote`), null);

  let handler: ((request: Request) => Promise<Response>) | undefined;
  let cacheReads = 0;
  const targetSession = {
    protocol: {
      handle(_scheme: string, callback: (request: Request) => Promise<Response>) {
        handler = callback;
      },
    },
  };
  const cache: CatalogSetSymbolCache = {
    async get() {
      cacheReads += 1;
      return { status: "unavailable" };
    },
    async initialize() {},
  };

  registerCatalogSetSymbolProtocol(targetSession, cache, async () => null);
  assert.ok(handler);
  const response = await handler(new Request(url));
  assert.equal(response.status, 404);
  assert.equal(cacheReads, 0);
});

function responseWithUrl(bytes: Uint8Array, url: string) {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const response = new Response(body, { headers: { "content-type": "image/svg+xml" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
