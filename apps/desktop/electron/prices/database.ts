import { DatabaseSync } from "node:sqlite";
import { initializePriceDatabase } from "@mooligan/catalog/prices";
export function openPriceDatabase(path: string) {
  const database = new DatabaseSync(path);
  initializePriceDatabase(database);
  return database;
}
