import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { CollectionLotSchema } from "@mooligan/domain/collection";
import * as z from "zod";
import {
  createCatalogOperations,
  executeCatalogRequest,
  type CatalogWorkerRequest,
} from "./operations.ts";

const port = parentPort;
const startup = z
  .strictObject({
    catalogPath: z.string().min(1),
    pricePath: z.string().min(1),
    collectionLots: z.array(CollectionLotSchema.strict()).max(100_000),
  })
  .safeParse(workerData);

if (!port || !startup.success) {
  throw new Error("The catalog query worker was started without trusted catalog state.");
}

const database = new DatabaseSync(startup.data.catalogPath, { readOnly: true });
database.prepare("ATTACH DATABASE ? AS market_prices").run(startup.data.pricePath);
const operations = createCatalogOperations(database);
operations["collection-projection-replace"](startup.data.collectionLots);
port.on("message", (request: CatalogWorkerRequest) => {
  port.postMessage(executeCatalogRequest(operations, request));
});
