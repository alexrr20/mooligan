import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { parentPort, workerData } from "node:worker_threads";

import { CatalogReleaseSchema, ScryfallSetDownloadSchema } from "@mooligan/domain/catalog-download";
import { StrictStruct } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";

import { importCatalog, readGzipJsonLines, type CatalogImportWorkerMessage } from "./import.ts";

const port = parentPort;
const options = Schema.decodeUnknownOption(
  StrictStruct({
    archive: Schema.instanceOf(ReadableStream).pipe(Schema.filter((stream) => !stream.locked)),
    destinationPath: Schema.NonEmptyString,
    release: CatalogReleaseSchema,
    sets: Schema.Array(ScryfallSetDownloadSchema).pipe(Schema.minItems(1)),
  }),
)(workerData);

if (!port || Option.isNone(options)) {
  throw new Error("The catalog import worker was started without trusted import data.");
}

const snapshot = await importCatalog(
  options.value.destinationPath,
  options.value.release,
  options.value.sets,
  readGzipJsonLines(Readable.from(options.value.archive)),
  (completedCards) =>
    port.postMessage({ completedCards, type: "progress" } satisfies CatalogImportWorkerMessage),
);

port.postMessage({ snapshot, type: "complete" } satisfies CatalogImportWorkerMessage);
