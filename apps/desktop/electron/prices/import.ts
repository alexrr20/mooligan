import { DatabaseSync } from "node:sqlite";
import { type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { JSONParser } from "@streamparser/json-node";
import type { PriceStatus } from "@mooligan/domain/market";
import {
  UuidSchema,
  IsoDateSchema,
  type JsonValue,
  JsonValueSchema,
} from "@mooligan/domain/schema";
import { Schema } from "effect";
import { openPriceDatabase } from "./database.ts";
import { importPriceData } from "@mooligan/catalog/price-import";
const MetaSchema = Schema.Struct({
  date: IsoDateSchema,
  version: Schema.String.pipe(Schema.startsWith("5.")),
});
const ElementSchema = Schema.Struct({ key: Schema.String, value: JsonValueSchema });
const decodeCardUuid = Schema.decodeUnknownSync(UuidSchema);
export type PriceImportSource = (file: "AllPricesToday" | "AllIdentifiers") => Promise<Readable>;
export async function importPrices(
  path: string,
  stagingPath: string,
  source: PriceImportSource,
  onPhase: (phase: PriceStatus["phase"]) => void,
  now = new Date(),
) {
  const live = openPriceDatabase(path);
  const staging = new DatabaseSync(stagingPath);
  try {
    return await importPriceData(
      live,
      staging,
      path,
      stagingPath,
      async (file, onCard) => readFeed(await source(file), onCard),
      onPhase,
      now,
    );
  } finally {
    staging.close();
    live.close();
  }
}
async function readFeed(input: Readable, onCard: (uuid: string, value: JsonValue) => void) {
  let date: string | undefined;
  let entries = 0;
  const parser = new JSONParser({ paths: ["$.meta", "$.data.*"], keepStack: false });
  await pipeline(input, createGunzip(), parser, async (elements) => {
    for await (const element of elements) {
      const { key, value } = Schema.decodeUnknownSync(ElementSchema)(element);
      if (key === "meta") date = Schema.decodeUnknownSync(MetaSchema)(value).date;
      else {
        onCard(decodeCardUuid(key), value);
        entries += 1;
      }
    }
  });
  if (!date || !entries) throw new Error("MTGJSON returned an empty or incomplete file.");
  return date;
}
