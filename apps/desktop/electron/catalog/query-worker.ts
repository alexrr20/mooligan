import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";

import {
  createCatalogQuery,
  type CatalogQueryWorkerRequest,
  type CatalogQueryWorkerResponse,
} from "./query.ts";

const port = parentPort;

if (!port || typeof workerData !== "string") {
  throw new Error("The catalog query worker was started without a catalog path.");
}

const database = new DatabaseSync(workerData, { readOnly: true });
const queryCatalog = createCatalogQuery(database);

port.on("message", ({ id, request }: CatalogQueryWorkerRequest) => {
  let response: CatalogQueryWorkerResponse;

  try {
    response = { id, page: queryCatalog(request) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }

  port.postMessage(response);
});
