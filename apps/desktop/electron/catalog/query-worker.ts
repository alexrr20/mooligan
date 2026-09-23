import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";

import { CollectionLotTransportSchema } from "@mooligan/workspace/transport";
import * as z from "zod";

import {
  createCatalogColorsQuery,
  createCatalogQuery,
  createCatalogRootSetQuery,
  createCatalogSpoilerRevealSummariesQuery,
  createCatalogUpcomingPrintingsQuery,
  createCatalogUpcomingQuery,
  parseCatalogQueryWorkerRequest,
  type CatalogQueryWorkerResponse,
} from "@mooligan/catalog/query";
import {
  createCatalogDetailQuery,
  createCatalogImageSourceQuery,
  createCatalogSetSymbolSourceQuery,
} from "@mooligan/catalog/detail";
import { createCollectionQuery } from "@mooligan/catalog/collection-query";
import { createDeckCostQuery } from "@mooligan/catalog/deck-cost";
import {
  createCollectionProjection,
  parseCollectionProjectionWorkerRequest,
} from "@mooligan/catalog/collection-projection";

const port = parentPort;
const startup = z
  .strictObject({
    catalogPath: z.string().min(1),
    pricePath: z.string().min(1),
    collectionLots: z.array(CollectionLotTransportSchema).max(100_000),
  })
  .safeParse(workerData);

if (!port || !startup.success) {
  throw new Error("The catalog query worker was started without trusted catalog state.");
}

const database = new DatabaseSync(startup.data.catalogPath, { readOnly: true });
database.prepare("ATTACH DATABASE ? AS market_prices").run(startup.data.pricePath);
const collectionProjection = createCollectionProjection(database);
collectionProjection.replace(startup.data.collectionLots);
const listCatalog = createCatalogQuery(database);
const listCollection = createCollectionQuery(database);
const queryColors = createCatalogColorsQuery(database);
const queryDetail = createCatalogDetailQuery(database);
const queryDeckCost = createDeckCostQuery(database);
const queryImageSource = createCatalogImageSourceQuery(database);
const queryRootSet = createCatalogRootSetQuery(database);
const querySetSymbolSource = createCatalogSetSymbolSourceQuery(database);
const querySpoilerReveals = createCatalogSpoilerRevealSummariesQuery(database);
const queryUpcoming = createCatalogUpcomingQuery(database);
const queryUpcomingPrintings = createCatalogUpcomingPrintingsQuery(database);

port.on("message", (message) => {
  const projectionRequest = parseCollectionProjectionWorkerRequest(message);
  if (projectionRequest) {
    const { id, operation } = projectionRequest;
    try {
      if (operation.type === "collection-projection-replace") {
        collectionProjection.replace(operation.lots);
      } else {
        collectionProjection.apply(operation);
      }
      port.postMessage({ id, operation: operation.type, status: "applied" });
    } catch (error) {
      port.postMessage({
        error: error instanceof Error ? error.message : String(error),
        id,
        operation: operation.type,
      });
    }
    return;
  }

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
      case "deck-cost":
        response = {
          id,
          operation: operation.type,
          result: queryDeckCost(operation.request, operation.visibility),
        };
        break;
      case "colors":
        response = {
          id,
          operation: operation.type,
          result: queryColors(operation.printingIds, operation.visibility),
        };
        break;
      case "collection-list":
        response = {
          id,
          operation: operation.type,
          result: listCollection(operation.request, operation.visibility),
        };
        break;
      case "detail":
        response = {
          id,
          operation: operation.type,
          result: queryDetail(operation.printingId, operation.visibility),
        };
        break;
      case "image-source":
        response = {
          id,
          operation: operation.type,
          result: queryImageSource(operation.image, operation.visibility),
        };
        break;
      case "list":
        response = {
          id,
          operation: operation.type,
          result: listCatalog(operation.request, operation.visibility),
        };
        break;
      case "root-set":
        response = {
          id,
          operation: operation.type,
          result: queryRootSet(operation.targetId),
        };
        break;
      case "set-symbol-source":
        response = {
          id,
          operation: operation.type,
          result: querySetSymbolSource(operation.symbol),
        };
        break;
      case "spoiler-reveals":
        response = {
          id,
          operation: operation.type,
          result: querySpoilerReveals(operation.printingIds, operation.rootSetIds),
        };
        break;
      case "upcoming":
        response = {
          id,
          operation: operation.type,
          result: queryUpcoming(operation.visibility),
        };
        break;
      case "upcoming-printings":
        response = {
          id,
          operation: operation.type,
          result: queryUpcomingPrintings(operation.request, operation.visibility),
        };
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
