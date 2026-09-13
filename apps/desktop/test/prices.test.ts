import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import type { JSONType } from "zod";

import {
  openPriceDatabase,
  readPrintingPrices,
  readPriceSnapshot,
} from "../electron/prices/database.ts";
import { importPrices, type PriceImportSource } from "../electron/prices/import.ts";
import { compileScryfallQuery } from "../electron/catalog/scryfall-query.ts";

const uuidA = "00000000-0000-4000-8000-000000000001";
const uuidB = "00000000-0000-4000-8000-000000000002";
const uuidMissing = "00000000-0000-4000-8000-000000000003";
const printingId = "00000000-0000-4000-8000-000000000004";
const date = "2026-09-10";
const now = new Date("2026-09-11T09:00:00Z");
const identifiers = {
  [uuidA]: { identifiers: { scryfallId: printingId }, availability: ["paper"] },
  [uuidB]: { identifiers: { scryfallId: printingId }, availability: ["paper"] },
};
const cardPrices = {
  paper: {
    cardmarket: { currency: "EUR", retail: { normal: { [date]: 1.15 }, foil: { [date]: 2.25 } } },
    cardkingdom: {
      currency: "USD",
      buylist: { normal: { [date]: 0 } },
      retail: { normal: { [date]: 3.5 } },
    },
    manapool: { currency: "USD", retail: { etched: { [date]: 4.75 } } },
    tcgplayer: { currency: "USD", retail: { normal: { [date]: 5 } } },
  },
};

function feed(data: JSONType, releaseDate = date) {
  return Readable.from([
    gzipSync(JSON.stringify({ meta: { date: releaseDate, version: "5.3.0" }, data })),
  ]);
}

void test("daily prices persist, deduplicate faces, preserve currencies and replace atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-prices-"));
  const path = join(directory, "prices.sqlite");
  const staging = join(directory, "incoming.sqlite");
  const reader = openPriceDatabase(path);
  try {
    assert.deepEqual(readPrintingPrices(reader, printingId), { prices: [], snapshot: null });
    const source: PriceImportSource = async (file) =>
      file === "AllIdentifiers"
        ? feed(identifiers)
        : feed({ [uuidA]: cardPrices, [uuidB]: cardPrices, [uuidMissing]: cardPrices });
    const snapshot = await importPrices(path, staging, source, () => {}, now);
    assert.equal(snapshot.priceCount, 6);
    assert.equal(snapshot.unmappedCount, 1);
    assert.equal(snapshot.ambiguousCount, 0);
    const saved = readPrintingPrices(reader, printingId);
    assert.equal(saved.prices.length, 6, "two card faces must not double the prices");
    assert.deepEqual(
      saved.prices.find((p) => p.market === "cardmarket" && p.finish === "nonfoil")?.money,
      { amountMinor: 115, currency: "EUR" },
    );
    assert.equal(saved.prices.find((p) => p.kind === "buylist")?.money.amountMinor, 0);
    assert.equal(readPrintingPrices(reader, uuidMissing).prices.length, 0);
    assert.deepEqual(saved.snapshot, snapshot);

    await rm(staging);
    await assert.rejects(
      importPrices(
        path,
        staging,
        async () => Readable.from([gzipSync('{"meta":')]),
        () => {},
        now,
      ),
    );
    assert.deepEqual(
      readPrintingPrices(reader, printingId),
      saved,
      "truncated downloads preserve the old snapshot",
    );

    await rm(staging);
    await assert.rejects(
      importPrices(
        path,
        staging,
        async () => feed({ [uuidA]: cardPrices }, "2026-09-09"),
        () => {},
        now,
      ),
      /older/,
    );
    assert.deepEqual(readPriceSnapshot(reader), snapshot);

    await rm(staging);
    await assert.rejects(
      importPrices(
        path,
        staging,
        async () =>
          feed({
            [uuidA]: {
              paper: {
                tcgplayer: { currency: "USD", retail: { normal: { [date]: -5 } } },
              },
            },
          }),
        () => {},
        now,
      ),
    );
    assert.deepEqual(readPriceSnapshot(reader), snapshot);

    await rm(staging);
    const requested: string[] = [];
    await importPrices(
      path,
      staging,
      async (file) => {
        requested.push(file);
        assert.equal(file, "AllPricesToday", "reuse the saved identifier mapping within the week");
        return feed({
          [uuidA]: {
            paper: { cardmarket: { currency: "EUR", retail: { normal: { [date]: 8 } } } },
          },
        });
      },
      () => {},
      now,
    );
    assert.deepEqual(requested, ["AllPricesToday"]);
    assert.equal(
      readPrintingPrices(reader, printingId).prices.length,
      1,
      "removed prices do not linger",
    );
    assert.equal(readPrintingPrices(reader, printingId).prices[0]?.money.amountMinor, 800);
  } finally {
    reader.close();
    await rm(directory, { recursive: true, force: true });
  }
});

void test("conflicting face mappings are omitted and search uses saved MTGJSON prices", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-prices-"));
  const path = join(directory, "prices.sqlite");
  try {
    const snapshot = await importPrices(
      path,
      join(directory, "incoming.sqlite"),
      async (file) =>
        file === "AllIdentifiers"
          ? feed(identifiers)
          : feed({
              [uuidA]: cardPrices,
              [uuidB]: {
                paper: {
                  cardmarket: { currency: "EUR", retail: { normal: { [date]: 9 } } },
                },
              },
            }),
      () => {},
      now,
    );
    assert.equal(snapshot.ambiguousCount, 1);
    const database = new DatabaseSync(":memory:");
    try {
      database.exec("CREATE TABLE cards(id TEXT, json TEXT)");
      database
        .prepare("INSERT INTO cards VALUES (?, ?)")
        .run(printingId, JSON.stringify({ prices: { usd: "900", eur: "900" } }));
      database.prepare("ATTACH DATABASE ? AS market_prices").run(path);
      const visibility: SpoilerVisibilitySnapshot = {
        currentDate: date,
        policy: "show",
        revealedPrintingIds: [],
        revealedRootSetIds: [],
        revision: 0,
      };
      for (const [query, expected] of [
        ["usd<10", 1],
        ["eur<10", 0],
        ["eur_foil<3", 1],
      ] as const) {
        const compiled = compileScryfallQuery(query, visibility);
        assert.ok(compiled.success);
        assert.equal(
          database.prepare(`SELECT id FROM cards WHERE ${compiled.sql}`).all(...compiled.parameters)
            .length,
          expected,
        );
      }
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
