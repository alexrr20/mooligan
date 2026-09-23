import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { CollectionLotSchema } from "@mooligan/workspace/collection-contract";
import { StrictStruct } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";
import {
  createCatalogOperations,
  executeCatalogRequest,
  type CatalogWorkerRequest,
} from "./operations.ts";

const port = parentPort;
const startup = Schema.decodeUnknownOption(
  StrictStruct({
    catalogPath: Schema.NonEmptyString,
    pricePath: Schema.NonEmptyString,
    collectionLots: Schema.Array(CollectionLotSchema).pipe(Schema.maxItems(100_000)),
  }),
)(workerData);
if (!port || Option.isNone(startup))
  throw new Error("The catalog query worker was started without trusted catalog state.");

const database = new DatabaseSync(startup.value.catalogPath, { readOnly: true });
database.prepare("ATTACH DATABASE ? AS market_prices").run(startup.value.pricePath);
const operations = createCatalogOperations(database);
operations["collection-projection-replace"](startup.value.collectionLots);
port.on("message", (request: CatalogWorkerRequest) => {
  port.postMessage(executeCatalogRequest(operations, request));
});
