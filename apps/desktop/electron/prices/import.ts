import { DatabaseSync } from "node:sqlite";
import { type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { JSONParser } from "@streamparser/json-node";
import type { PriceStatus } from "@mooligan/domain/market";
import * as z from "zod";
import type { JSONType } from "zod";
import { openPriceDatabase } from "./database.ts";
import { importPriceData } from "@mooligan/catalog/price-import";
const MetaSchema = z.object({ date: z.iso.date(), version: z.string().startsWith("5.") });
const ElementSchema = z.object({ key: z.string(), value: z.json() });
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
async function readFeed(input: Readable, onCard: (uuid: string, value: JSONType) => void) {
  let date: string | undefined;
  let entries = 0;
  const parser = new JSONParser({ paths: ["$.meta", "$.data.*"], keepStack: false });
  await pipeline(input, createGunzip(), parser, async (elements) => {
    for await (const element of elements) {
      const { key, value } = ElementSchema.parse(element);
      if (key === "meta") date = MetaSchema.parse(value).date;
      else {
        onCard(z.uuid().parse(key), value);
        entries += 1;
      }
    }
  });
  if (!date || !entries) throw new Error("MTGJSON returned an empty or incomplete file.");
  return date;
}
