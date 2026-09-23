import assert from "node:assert/strict";

import { Schema } from "effect";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports -- Cloudflare's pool must share Vitest's runner instance.
import { test, vi } from "vitest";

import { refreshCatalogRelease } from "../src/catalog-release.ts";
import { api } from "../src/index.ts";

test("GET /health reports a healthy service", async () => {
  const response = await api.request("http://localhost/health");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("GET /catalog/release exposes the current Scryfall archive", async () => {
  const current = {
    compressed_size: 77_064_542,
    download_url: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    updated_at: "2026-07-31T09:11:02.266+00:00",
  };
  const store = releaseDatabase(current);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      compressed_size: current.compressed_size,
      jsonl_download_uri: current.download_url,
      type: "default_cards",
      updated_at: current.updated_at,
    }),
  );

  try {
    const response = await api.request("http://localhost/catalog/release", undefined, {
      DB: store.database,
    });

    assert.equal(response.status, 200);
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(store.writeCount(), 0);
    assert.deepEqual(await response.json(), {
      compressedSize: current.compressed_size,
      downloadUrl: current.download_url,
      updatedAt: current.updated_at,
    });
  } finally {
    fetchMock.mockRestore();
  }
});

test("GET /catalog/release refreshes a cached archive before returning it", async () => {
  const store = releaseDatabase({
    compressed_size: 75_000_000,
    download_url: "https://data.scryfall.io/default-cards/old.jsonl.gz",
    updated_at: "2026-08-04T09:09:56.490+00:00",
  });
  const source = {
    compressed_size: 77_973_023,
    jsonl_download_uri: "https://data.scryfall.io/default-cards/current.jsonl.gz",
    type: "default_cards",
    updated_at: "2026-08-26T21:05:47.053+00:00",
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(source));

  try {
    const response = await api.request("http://localhost/catalog/release", undefined, {
      DB: store.database,
    });

    assert.equal(response.status, 200);
    assert.equal(store.writeCount(), 1);
    assert.deepEqual(await response.json(), {
      compressedSize: source.compressed_size,
      downloadUrl: source.jsonl_download_uri,
      updatedAt: source.updated_at,
    });
  } finally {
    fetchMock.mockRestore();
  }
});

test("GET /catalog/release falls back to the cached archive when Scryfall is unavailable", async () => {
  const cached = {
    compressed_size: 77_064_542,
    download_url: "https://data.scryfall.io/default-cards/cached.jsonl.gz",
    updated_at: "2026-07-31T09:11:02.266+00:00",
  };
  const store = releaseDatabase(cached);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 503 }));
  const consoleMock = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    const response = await api.request("http://localhost/catalog/release", undefined, {
      DB: store.database,
    });

    assert.equal(response.status, 200);
    assert.equal(store.writeCount(), 0);
    assert.deepEqual(await response.json(), {
      compressedSize: cached.compressed_size,
      downloadUrl: cached.download_url,
      updatedAt: cached.updated_at,
    });
  } finally {
    consoleMock.mockRestore();
    fetchMock.mockRestore();
  }
});

test("GET /catalog/release bootstraps an empty catalog", async () => {
  const store = releaseDatabase();
  const source = {
    compressed_size: 77_064_542,
    jsonl_download_uri: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    type: "default_cards",
    updated_at: "2026-07-31T09:11:02.266+00:00",
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(source));

  try {
    const response = await api.request("http://localhost/catalog/release", undefined, {
      DB: store.database,
    });

    assert.equal(response.status, 200);
    assert.equal(store.writeCount(), 1);
    assert.deepEqual(await response.json(), {
      compressedSize: source.compressed_size,
      downloadUrl: source.jsonl_download_uri,
      updatedAt: source.updated_at,
    });
  } finally {
    fetchMock.mockRestore();
  }
});

test("the release refresh writes only when Scryfall publishes a new archive", async () => {
  const store = releaseDatabase();
  const source = {
    compressed_size: 77_064_542,
    jsonl_download_uri: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    type: "default_cards",
    updated_at: "2026-07-31T09:11:02.266+00:00",
  };
  const fetcher = async () => Response.json(source);

  assert.equal(await refreshCatalogRelease(store.database, fetcher), "updated");
  assert.equal(await refreshCatalogRelease(store.database, fetcher), "unchanged");
  assert.equal(store.writeCount(), 1);
  assert.equal(store.current()?.updated_at, source.updated_at);
});

type ReleaseRow = {
  compressed_size: number;
  download_url: string;
  updated_at: string;
};

const WriteParametersSchema = Schema.Tuple(Schema.String, Schema.String, Schema.Number);

function releaseDatabase(initial?: ReleaseRow) {
  let current = initial;
  let writes = 0;

  // SAFETY: this fake implements only the D1 surface exercised by refreshCatalogRelease.
  const database = {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          if (!current) {
            return null;
          }

          // SAFETY: the query branches mirror the two row types requested by the production function.
          return (
            query.includes("compressed_size") ? current : { updated_at: current.updated_at }
          ) as T;
        },
        async run() {
          const [updatedAt, downloadUrl, compressedSize] =
            Schema.decodeUnknownSync(WriteParametersSchema)(parameters);
          current = {
            compressed_size: compressedSize,
            download_url: downloadUrl,
            updated_at: updatedAt,
          };
          writes += 1;
          return { success: true };
        },
      };

      // SAFETY: the fake statement implements every method used by refreshCatalogRelease.
      return statement as D1PreparedStatement;
    },
  } as D1Database;

  return {
    current: () => current,
    database,
    writeCount: () => writes,
  };
}
