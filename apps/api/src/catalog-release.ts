import { Schema } from "effect";
import {
  CatalogReleaseSchema,
  ScryfallBulkDataSchema,
  type CatalogRelease,
} from "@mooligan/domain/catalog-download";

type CatalogReleaseRow = {
  compressed_size: number;
  download_url: string;
  updated_at: string;
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const scryfallBulkDataUrl = "https://api.scryfall.com/bulk-data/default_cards";

export async function readCatalogRelease(database: D1Database): Promise<CatalogRelease | null> {
  const row = await database
    .prepare(
      `SELECT updated_at, download_url, compressed_size
       FROM catalog_release
       WHERE singleton = 1`,
    )
    .first<CatalogReleaseRow>();

  if (!row) {
    return null;
  }

  return Schema.decodeUnknownSync(CatalogReleaseSchema)({
    compressedSize: row.compressed_size,
    downloadUrl: row.download_url,
    updatedAt: row.updated_at,
  });
}

export async function refreshCatalogRelease(
  database: D1Database,
  fetcher: Fetcher = fetch,
): Promise<"unchanged" | "updated"> {
  const response = await fetcher(scryfallBulkDataUrl, {
    headers: {
      Accept: "application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "Mooligan/0.0.0 (https://github.com/alexrr20/mooligan)",
    },
  });

  if (!response.ok) {
    throw new Error(`Scryfall returned HTTP ${response.status}.`);
  }

  const source = Schema.decodeUnknownSync(ScryfallBulkDataSchema)(await response.json());
  const current = await database
    .prepare("SELECT updated_at FROM catalog_release WHERE singleton = 1")
    .first<{ updated_at: string }>();

  if (current?.updated_at === source.updated_at) {
    return "unchanged";
  }

  await database
    .prepare(
      `INSERT INTO catalog_release
       (singleton, updated_at, download_url, compressed_size)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         updated_at = excluded.updated_at,
         download_url = excluded.download_url,
         compressed_size = excluded.compressed_size`,
    )
    .bind(source.updated_at, source.jsonl_download_uri, source.compressed_size)
    .run();

  return "updated";
}
