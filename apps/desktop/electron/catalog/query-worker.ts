import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";

import * as z from "zod";

import {
  createCatalogQuery,
  parseCatalogQueryWorkerRequest,
  type CatalogQueryWorkerResponse,
} from "./query.ts";
import { createCatalogDetailQuery, createCatalogImageSourceQuery } from "./detail.ts";

const port = parentPort;
const catalogPath = z.string().safeParse(workerData);

if (!port || !catalogPath.success) {
  throw new Error("The catalog query worker was started without a catalog path.");
}

const database = new DatabaseSync(catalogPath.data, { readOnly: true });
const listCatalog = createCatalogQuery(database);
const queryDetail = createCatalogDetailQuery(database);
const queryImageSource = createCatalogImageSourceQuery(database);

port.on("message", (message) => {
  const request = parseCatalogQueryWorkerRequest(message);

  if (!request) {
    port.postMessage({
      error: "Invalid catalog query request.",
      id: null,
      operation: "invalid",
    });
    return;
  }

  const { id, operation } = request;
  let response: CatalogQueryWorkerResponse;

  try {
    switch (operation.type) {
      case "detail":
        response = { id, operation: operation.type, result: queryDetail(operation.printingId) };
        break;
      case "image-source":
        response = { id, operation: operation.type, result: queryImageSource(operation.image) };
        break;
      case "list":
        response = { id, operation: operation.type, result: listCatalog(operation.request) };
        break;
      default:
        operation satisfies never;
        throw new Error("Invalid catalog query operation.");
    }
  } catch (error) {
    response = {
      id,
      operation: operation.type,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  port.postMessage(response);
});
