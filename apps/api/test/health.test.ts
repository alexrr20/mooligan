import assert from "node:assert/strict";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports -- Cloudflare's pool must share Vitest's runner instance.
import { test, vi } from "vitest";
import * as z from "zod";

import { refreshCatalogRelease } from "../src/catalog-release.ts";
import { api } from "../src/index.ts";

test("GET /health reports a healthy service", async () => {
  const response = await api.request("http://localhost/health");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("GET /catalog/release exposes the current Scryfall archive", async () => {
  const { database } = releaseDatabase({
    compressed_size: 77_064_542,
    download_url: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    updated_at: "2026-07-31T09:11:02.266+00:00",
  });
  const response = await api.request("http://localhost/catalog/release", undefined, {
    DB: database,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    compressedSize: 77_064_542,
    downloadUrl: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    updatedAt: "2026-07-31T09:11:02.266+00:00",
  });
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

test("the release sync writes only when Scryfall publishes a new archive", async () => {
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

const WriteParametersSchema = z.tuple([z.string(), z.string(), z.number()]);

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
          const [updatedAt, downloadUrl, compressedSize] = WriteParametersSchema.parse(parameters);
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
