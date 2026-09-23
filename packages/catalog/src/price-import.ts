import type { CatalogDatabase } from "./database.ts";
import { PriceSnapshotSchema, type PriceStatus } from "@mooligan/domain/market";
import { UuidSchema, IsoDateSchema, type JsonValue } from "@mooligan/domain/schema";
import { Schema } from "effect";
import { readPriceMetadata, readPriceSnapshot } from "./prices.ts";
export type PriceFeedSource = (
  file: "AllPricesToday" | "AllIdentifiers",
  onCard: (uuid: string, value: JsonValue) => void,
) => Promise<string>;
const decodeIdentifiers = Schema.decodeUnknownSync(
  Schema.Struct({
    identifiers: Schema.Struct({ scryfallId: Schema.optional(UuidSchema) }),
    availability: Schema.Array(Schema.String),
  }),
);
const PointsSchema = Schema.Record({
  key: IsoDateSchema,
  value: Schema.Finite.pipe(Schema.nonNegative()),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const FinishesSchema = Schema.Struct({
  normal: Schema.optional(PointsSchema),
  foil: Schema.optional(PointsSchema),
  etched: Schema.optional(PointsSchema),
});
const decodePrices = Schema.decodeUnknownSync(
  Schema.Struct({
    paper: Schema.optional(
      Schema.Record({
        key: Schema.String.pipe(Schema.pattern(/^[a-z0-9_-]+$/)),
        value: Schema.Struct({
          currency: Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/)),
          retail: Schema.optional(FinishesSchema),
          buylist: Schema.optional(FinishesSchema),
        }).annotations({ parseOptions: { onExcessProperty: "ignore" } }),
      }).annotations({ parseOptions: { onExcessProperty: "error" } }),
    ),
  }),
);
const decodeFractionDigits = Schema.decodeUnknownSync(Schema.NonNegativeInt);
const decodeCount = Schema.decodeUnknownSync(Schema.Struct({ count: Schema.NonNegativeInt }));

export async function importPriceData(
  live: CatalogDatabase,
  staging: CatalogDatabase,
  path: string,
  stagingPath: string,
  source: PriceFeedSource,
  onPhase: (phase: PriceStatus["phase"]) => void,
  now = new Date(),
) {
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
  const priceDate = await source("AllPricesToday", (uuid, value) => {
    const card = decodePrices(value);
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
            const digits = decodeFractionDigits(
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
  if (count(staging, "SELECT count(*) AS count FROM candidates WHERE price_date > ?", priceDate)) {
    throw new Error("MTGJSON prices are newer than their release.");
  }

  const cachedDate = readPriceMetadata(live, "identifiersDate");
  const refreshIdentifiers =
    !cachedDate || now.getTime() - Date.parse(cachedDate) >= 7 * 86_400_000;
  let identifiersDate = cachedDate;
  if (refreshIdentifiers) {
    onPhase("identifiers");
    const insertIdentifier = staging.prepare("INSERT INTO identifiers VALUES (?, ?)");
    identifiersDate = await source("AllIdentifiers", (uuid, value) => {
      const card = decodeIdentifiers(value);
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
  const snapshot = Schema.decodeUnknownSync(PriceSnapshotSchema)({
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
}

function count(database: CatalogDatabase, sql: string, ...parameters: string[]) {
  return decodeCount(database.prepare(sql).get(...parameters)).count;
}
