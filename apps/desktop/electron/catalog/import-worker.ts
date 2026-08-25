import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { parentPort, workerData } from "node:worker_threads";

import { CatalogReleaseSchema, ScryfallSetDownloadSchema } from "@mooligan/domain/catalog-download";
import * as z from "zod";

import { importCatalog, readGzipJsonLines, type CatalogImportWorkerMessage } from "./import.ts";

const port = parentPort;
const options = z
  .strictObject({
    archive: z.custom<ReadableStream<Uint8Array>>(
      (value) => value instanceof ReadableStream && !value.locked,
    ),
    destinationPath: z.string().min(1),
    release: CatalogReleaseSchema,
    sets: z.array(ScryfallSetDownloadSchema).min(1),
  })
  .safeParse(workerData);

if (!port || !options.success) {
  throw new Error("The catalog import worker was started without trusted import data.");
}

const snapshot = await importCatalog(
  options.data.destinationPath,
  options.data.release,
  options.data.sets,
  readGzipJsonLines(Readable.from(options.data.archive)),
  (completedCards) =>
    port.postMessage({ completedCards, type: "progress" } satisfies CatalogImportWorkerMessage),
);

port.postMessage({ snapshot, type: "complete" } satisfies CatalogImportWorkerMessage);
