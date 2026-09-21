import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import type { CatalogSnapshot } from "@mooligan/domain/catalog";
import type { CatalogRelease, ScryfallSetDownload } from "@mooligan/domain/catalog-download";
import { importCatalogData } from "@mooligan/catalog/import";

export type CatalogImportWorkerMessage =
  | { completedCards: number; type: "progress" }
  | { snapshot: CatalogSnapshot; type: "complete" };

export function readGzipJsonLines(input: Readable) {
  return createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity });
}

export async function importCatalog(
  path: string,
  release: CatalogRelease,
  sets: readonly ScryfallSetDownload[],
  lines: AsyncIterable<string>,
  onProgress: (completedCards: number) => void,
) {
  const database = new DatabaseSync(path);
  try {
    return await importCatalogData(database, release, sets, lines, onProgress);
  } finally {
    database.close();
  }
}
