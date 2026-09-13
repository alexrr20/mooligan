import { DatabaseSync } from "node:sqlite";
import { type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { JSONParser } from "@streamparser/json-node";
import { PriceSnapshotSchema, type PriceStatus } from "@mooligan/domain/market";
import * as z from "zod";
import type { JSONType } from "zod";

import { openPriceDatabase, readPriceMetadata, readPriceSnapshot } from "./database.ts";

const MetaSchema = z.object({ date: z.iso.date(), version: z.string().startsWith("5.") });
const IdentifierSchema = z.object({
  identifiers: z.object({ scryfallId: z.uuid().optional() }),
  availability: z.array(z.string()),
});
const PointsSchema = z.record(z.iso.date(), z.number().finite().nonnegative());
const FinishesSchema = z.object({
  normal: PointsSchema.optional(),
  foil: PointsSchema.optional(),
  etched: PointsSchema.optional(),
});
const PricesSchema = z.object({
  paper: z
    .record(
      z.string().regex(/^[a-z0-9_-]+$/),
      z.object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        retail: FinishesSchema.optional(),
        buylist: FinishesSchema.optional(),
      }),
    )
    .optional(),
});
const ElementSchema = z.object({ key: z.string(), value: z.json() });
const CountSchema = z.object({ count: z.number().int().nonnegative() });

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
    staging.exec(`
      CREATE TABLE identifiers (uuid TEXT PRIMARY KEY, printing_id TEXT NOT NULL) STRICT;
      CREATE TABLE candidates (
        uuid TEXT NOT NULL, market TEXT NOT NULL, kind TEXT NOT NULL,
        finish TEXT NOT NULL, currency TEXT NOT NULL, amount_minor INTEGER NOT NULL,
        price_date TEXT NOT NULL,
        PRIMARY KEY (uuid, market, kind, finish, currency)
      ) STRICT;
      BEGIN;
    `);
    onPhase("prices");
    const insertPrice = staging.prepare("INSERT INTO candidates VALUES (?, ?, ?, ?, ?, ?, ?)");
    const scales = new Map<string, number>();
    const priceDate = await readFeed(await source("AllPricesToday"), (uuid, value) => {
      const card = PricesSchema.parse(value);
      for (const [market, prices] of Object.entries(card.paper ?? {})) {
        for (const kind of ["retail", "buylist"] as const) {
          for (const finish of ["normal", "foil", "etched"] as const) {
            const points = Object.entries(prices[kind]?.[finish] ?? {}).sort(([a], [b]) =>
              b.localeCompare(a),
            );
            const latest = points[0];
            if (!latest) continue;
            let scale = scales.get(prices.currency);
            if (scale === undefined) {
              const digits = z.number().parse(
                new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: prices.currency,
                }).resolvedOptions().maximumFractionDigits,
              );
              scale = 10 ** digits;
              scales.set(prices.currency, scale);
            }
            const amountMinor = Math.round((latest[1] + Number.EPSILON) * scale);
            if (!Number.isSafeInteger(amountMinor))
              throw new Error("MTGJSON returned an invalid price.");
            insertPrice.run(
              uuid,
              market,
              kind,
              finish === "normal" ? "nonfoil" : finish,
              prices.currency,
              amountMinor,
              latest[0],
            );
          }
        }
      }
    });
    const previous = readPriceSnapshot(live);
    if (previous && priceDate < previous.date)
      throw new Error("MTGJSON returned an older price release.");
    if (priceDate > now.toISOString().slice(0, 10))
      throw new Error("MTGJSON returned a future price release.");
    if (
      count(staging, "SELECT count(*) AS count FROM candidates WHERE price_date > ?", priceDate)
    ) {
      throw new Error("MTGJSON prices are newer than their release.");
    }

    const cachedDate = readPriceMetadata(live, "identifiersDate");
    const refreshIdentifiers =
      !cachedDate || now.getTime() - Date.parse(cachedDate) >= 7 * 86_400_000;
    let identifiersDate = cachedDate;
    if (refreshIdentifiers) {
      onPhase("identifiers");
      const insertIdentifier = staging.prepare("INSERT INTO identifiers VALUES (?, ?)");
      identifiersDate = await readFeed(await source("AllIdentifiers"), (uuid, value) => {
        const card = IdentifierSchema.parse(value);
        if (card.identifiers.scryfallId && card.availability.includes("paper")) {
          insertIdentifier.run(uuid, card.identifiers.scryfallId);
        }
      });
      if (!count(staging, "SELECT count(*) AS count FROM identifiers")) {
        throw new Error("MTGJSON returned no paper printing identifiers.");
      }
    } else {
      staging.prepare("ATTACH DATABASE ? AS installed").run(path);
      staging.exec("INSERT INTO identifiers SELECT * FROM installed.identifiers");
    }

    onPhase("installing");
    // Equal face records collapse to one printing price. Conflicting mappings remain unpriced.
    staging.exec(`
      CREATE TABLE grouped AS
      SELECT printing_id, market, kind, finish, currency,
             min(amount_minor) AS amount_minor, min(price_date) AS price_date,
             min(amount_minor) = max(amount_minor) AND min(price_date) = max(price_date) AS consistent
      FROM candidates JOIN identifiers USING(uuid)
      GROUP BY printing_id, market, kind, finish, currency;
    `);
    const snapshot = PriceSnapshotSchema.parse({
      date: priceDate,
      fetchedAt: now.toISOString(),
      priceCount: count(staging, "SELECT count(*) AS count FROM grouped WHERE consistent = 1"),
      ambiguousCount: count(staging, "SELECT count(*) AS count FROM grouped WHERE consistent = 0"),
      unmappedCount: count(
        staging,
        `SELECT count(DISTINCT uuid) AS count FROM candidates
        WHERE uuid NOT IN (SELECT uuid FROM identifiers)`,
      ),
    });
    staging.exec("COMMIT");
    live.prepare("ATTACH DATABASE ? AS incoming").run(stagingPath);
    live.exec("BEGIN IMMEDIATE");
    try {
      live.exec(`DELETE FROM prices;
        INSERT INTO prices SELECT printing_id, market, kind, finish, currency, amount_minor, price_date
        FROM incoming.grouped WHERE consistent = 1;`);
      if (refreshIdentifiers) {
        live.exec(
          "DELETE FROM identifiers; INSERT INTO identifiers SELECT * FROM incoming.identifiers;",
        );
        live
          .prepare("INSERT OR REPLACE INTO price_meta VALUES ('identifiersDate', ?)")
          .run(identifiersDate);
      }
      live
        .prepare("INSERT OR REPLACE INTO price_meta VALUES ('snapshot', ?)")
        .run(JSON.stringify(snapshot));
      live.exec("COMMIT");
    } catch (error) {
      live.exec("ROLLBACK");
      throw error;
    }
    return snapshot;
  } finally {
    staging.close();
    live.close();
  }
}

function count(database: DatabaseSync, sql: string, ...parameters: string[]) {
  return CountSchema.parse(database.prepare(sql).get(...parameters)).count;
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
