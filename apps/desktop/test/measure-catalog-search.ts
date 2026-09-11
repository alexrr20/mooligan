import { DatabaseSync } from "node:sqlite";

import { createCatalogQuery } from "../electron/catalog/query.ts";

const [path, ...queries] = process.argv.slice(2);
if (!path) throw new Error("Pass the path to catalog/cards.sqlite, followed by optional queries.");

const database = new DatabaseSync(path, { readOnly: true });
const list = createCatalogQuery(database);
const today = new Date();
const currentDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

try {
  for (const uniqueCards of [true, false]) {
    for (const query of queries.length
      ? queries
      : ["y", "ys", "ysh", "yshtola", "l", "lightning bolt"]) {
      const start = performance.now();
      const result = list(
        {
          query,
          uniqueCards,
          limit: uniqueCards ? 6 : 100,
          includeAdCards: uniqueCards,
          includeArtSeries: uniqueCards,
          includeDigital: uniqueCards,
          includeTokens: uniqueCards,
        },
        {
          currentDate,
          policy: "protect",
          revision: 0,
          revealedPrintingIds: [],
          revealedRootSetIds: [],
        },
      );
      console.log(
        JSON.stringify({
          query,
          view: uniqueCards ? "dropdown" : "page",
          milliseconds: Math.round(performance.now() - start),
          results: result.cards.length,
        }),
      );
    }
  }
} finally {
  database.close();
}
