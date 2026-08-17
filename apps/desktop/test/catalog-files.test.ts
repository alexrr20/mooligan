import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { gzipSync } from "node:zlib";
import * as z from "zod";

import { recoverInterruptedReplacement } from "../electron/catalog/files.ts";
import {
  createCatalogDetailQuery,
  createCatalogImageSourceQuery,
  validateCatalogPrintingId,
} from "../electron/catalog/detail.ts";
import { importCatalog, readGzipJsonLines } from "../electron/catalog/import.ts";
import {
  createCatalogQuery,
  type CatalogQueryWorkerResponse,
  validateCatalogListRequest,
} from "../electron/catalog/query.ts";
import {
  reconcileCatalogSearchDraft,
  validateCatalogSearch,
} from "../src/features/search/search-state.ts";

const QueryPlanRowSchema = z.object({ detail: z.string() });

void test("catalog search state keeps only valid non-default values", () => {
  assert.deepEqual(
    validateCatalogSearch({
      artSeries: true,
      digital: true,
      grid: true,
      query: `  Mooligan ${"x".repeat(120)}  `,
      uniqueCards: true,
      universe: "beyond",
    }),
    {
      artSeries: true,
      digital: true,
      grid: true,
      query: `Mooligan ${"x".repeat(91)}`,
      uniqueCards: true,
      universe: "beyond",
    },
  );
  assert.deepEqual(
    validateCatalogSearch({ digital: false, grid: "true", query: "   ", universe: "all" }),
    {},
  );
});

void test("a completed search cannot overwrite a newer query draft", () => {
  assert.equal(reconcileCatalogSearchDraft("lightning bolt", "", "lightning"), "lightning bolt");
  assert.equal(
    reconcileCatalogSearchDraft("lightning", "lightning", "counterspell"),
    "counterspell",
  );
});

void test("catalog IPC input accepts only the narrow list request", () => {
  assert.deepEqual(validateCatalogListRequest(undefined), {});
  assert.deepEqual(validateCatalogListRequest({ universe: undefined }), { universe: undefined });
  assert.deepEqual(
    validateCatalogListRequest({
      includeArtSeries: false,
      includeDigital: false,
      limit: 100,
      offset: 0,
      query: "mox",
      universe: "within",
    }),
    {
      includeArtSeries: false,
      includeDigital: false,
      limit: 100,
      offset: 0,
      query: "mox",
      universe: "within",
    },
  );
  assert.throws(() => validateCatalogListRequest({ query: { value: "mox" } }));
  assert.throws(() => validateCatalogListRequest({ limit: 251 }));
  assert.throws(() => validateCatalogListRequest({ universe: "all" }));
  assert.throws(() => validateCatalogListRequest({ extra: true }));
});

void test("an interrupted catalog replacement restores the previous catalog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-catalog-"));
  const destination = join(directory, "cards.sqlite");
  const backup = `${destination}.previous`;

  try {
    await writeFile(backup, "valid catalog");
    await recoverInterruptedReplacement(destination, backup);

    assert.equal(await readFile(destination, "utf8"), "valid catalog");
    await assert.rejects(readFile(backup), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("catalog detail distinguishes an absent printing from a malformed stored row", () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec("CREATE TABLE cards (id TEXT PRIMARY KEY, oracle_id TEXT, json)");
    const queryDetail = createCatalogDetailQuery(database);
    const queryImageSource = createCatalogImageSourceQuery(database);

    assert.equal(queryDetail("missing-printing"), null);
    database
      .prepare("INSERT INTO cards (id, oracle_id, json) VALUES (?, ?, ?)")
      .run("malformed-printing", null, 42);

    assert.throws(() => queryDetail("malformed-printing"), /invalid card row/u);
    assert.throws(
      () =>
        queryImageSource({
          faceIndex: 0,
          printingId: "malformed-printing",
          size: "normal",
        }),
      /invalid card row/u,
    );
  } finally {
    database.close();
  }
});

void test("related printings use numeric collector ordering and a stable ID tie-breaker", () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec("CREATE TABLE cards (id TEXT PRIMARY KEY, oracle_id TEXT, json TEXT NOT NULL)");
    const insert = database.prepare("INSERT INTO cards (id, oracle_id, json) VALUES (?, ?, ?)");

    for (const [id, collectorNumber] of [
      ["printing-10", "10"],
      ["printing-2b", "2"],
      ["printing-2a", "2"],
    ] as const) {
      insert.run(
        id,
        "shared-oracle",
        JSON.stringify({
          collector_number: collectorNumber,
          id,
          name: "Ordering Test Card",
          object: "card",
          oracle_id: "shared-oracle",
          rarity: "common",
          released_at: "2026-08-14",
          set: "ord",
          set_name: "Ordering Test Set",
          type_line: "Artifact",
        }),
      );
    }

    const detail = createCatalogDetailQuery(database)("printing-10");
    assert.ok(detail);
    assert.deepEqual(
      detail.siblingPrintings.map((printing) => printing.id),
      ["printing-2a", "printing-2b", "printing-10"],
    );
  } finally {
    database.close();
  }
});

void test("a gzipped Scryfall JSONL archive becomes a validated local catalog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-import-"));
  const destination = join(directory, "cards.sqlite");
  const cards = [
    {
      artist: "Test Artist",
      collector_number: "1",
      color_identity: ["U"],
      cmc: 2,
      digital: false,
      finishes: ["nonfoil", "foil"],
      id: "printing-1",
      image_uris: {
        grid: "https://cards.scryfall.io/grid/front/1.webp",
        normal: "https://cards.scryfall.io/normal/front/1.jpg",
        small: "https://cards.scryfall.io/small/front/1.jpg",
        thumb: "https://cards.scryfall.io/thumb/front/1.webp",
      },
      keywords: ["Flying"],
      lang: "en",
      legalities: {
        future_format: "not_legal",
        modern: "legal",
      },
      mana_cost: "{1}{U}",
      name: "Mooligan Test Card",
      object: "card",
      oracle_text: "Flying\n{T}: Draw a card.",
      oracle_id: "oracle-1",
      promo: false,
      promo_types: ["universesbeyond"],
      rarity: "rare",
      released_at: "2024-06-14",
      set: "moo",
      set_name: "Mooligan Test Set",
      type_line: "Artifact",
    },
    {
      collector_number: "8",
      digital: true,
      finishes: ["nonfoil"],
      id: "printing-3",
      image_uris: { small: "https://cards.scryfall.io/small/front/3.jpg" },
      lang: "ja",
      name: "Mooligan Test Card",
      object: "card",
      oracle_id: "oracle-1",
      promo: true,
      rarity: "uncommon",
      released_at: "2025-01-03",
      set: "zzz",
      set_name: "Alternate Test Set",
      type_line: "Artifact",
    },
    {
      collector_number: "A1",
      digital: false,
      id: "art-series-1",
      image_uris: { small: "https://cards.scryfall.io/small/front/art.jpg" },
      layout: "art_series",
      name: "Mooligan Test Card",
      object: "card",
      oracle_id: "oracle-1",
      rarity: "common",
      set: "zzza",
      set_name: "Art Series Test Set",
      type_line: "Card",
    },
    {
      collector_number: "2",
      digital: false,
      finishes: ["nonfoil"],
      id: "printing-2",
      lang: "en",
      name: "Second Test Card",
      object: "card",
      released_at: "2023-04-01",
      rarity: "common",
      set: "moo",
      set_name: "Mooligan Test Set",
      card_faces: [
        {
          mana_cost: "{2}{G}",
          name: "Second Test Front",
          oracle_text: "Reach",
          power: "2",
          toughness: "3",
          image_uris: {
            grid: "https://cards.scryfall.io/grid/front/2.webp",
            normal: "https://cards.scryfall.io/normal/front/2.jpg",
            small: "https://cards.scryfall.io/small/front/2.jpg",
            thumb: "https://cards.scryfall.io/thumb/front/2.webp",
          },
          type_line: "Creature — Test",
        },
        {
          image_uris: {
            normal: "https://cards.scryfall.io/normal/back/2.jpg",
            small: "https://cards.scryfall.io/small/back/2.jpg",
          },
          name: "Second Test Back",
          oracle_text: "Vigilance",
          power: "3",
          toughness: "4",
          type_line: "Creature — Test",
        },
      ],
    },
  ];
  const archive = gzipSync(`${cards.map((card) => JSON.stringify(card)).join("\n")}\n`);
  const progress: number[] = [];

  try {
    const snapshot = await importCatalog(
      destination,
      {
        compressedSize: archive.byteLength,
        downloadUrl: "https://data.scryfall.io/default-cards/test.jsonl.gz",
        updatedAt: "2026-07-31T09:11:02.266+00:00",
      },
      readGzipJsonLines(Readable.from([archive])),
      (completedCards) => progress.push(completedCards),
    );
    const database = new DatabaseSync(destination, { readOnly: true });

    try {
      assert.deepEqual(snapshot, {
        cardCount: 4,
        updatedAt: "2026-07-31T09:11:02.266+00:00",
      });
      assert.deepEqual(progress, [4]);
      assert.deepEqual(
        database
          .prepare("SELECT id, set_code FROM cards ORDER BY id")
          .all()
          .map((row) => ({ ...row })),
        [
          { id: "art-series-1", set_code: "zzza" },
          { id: "printing-1", set_code: "moo" },
          { id: "printing-2", set_code: "moo" },
          { id: "printing-3", set_code: "zzz" },
        ],
      );
      const queryCatalog = createCatalogQuery(database);
      const queryDetail = createCatalogDetailQuery(database);
      const queryImageSource = createCatalogImageSourceQuery(database);

      assert.equal(validateCatalogPrintingId("  printing-1  "), "printing-1");
      assert.equal(validateCatalogPrintingId("   "), null);
      assert.equal(validateCatalogPrintingId("x".repeat(129)), null);
      assert.equal(validateCatalogPrintingId({ id: "printing-1" }), null);
      assert.equal(queryDetail("missing-printing"), null);

      const sharedDetail = queryDetail("printing-1");
      assert.ok(sharedDetail);
      assert.equal(sharedDetail.card.id, "oracle-1");
      assert.equal(sharedDetail.card.hasSharedIdentity, true);
      assert.equal(sharedDetail.card.faces[0]?.oracleText, "Flying\n{T}: Draw a card.");
      assert.deepEqual(sharedDetail.legalities, [
        { formatId: "future_format", formatName: "Future Format", status: "not-legal" },
        { formatId: "modern", formatName: "Modern", status: "legal" },
      ]);
      assert.deepEqual(
        sharedDetail.siblingPrintings.map((printing) => printing.id),
        ["printing-3", "printing-1", "art-series-1"],
      );
      assert.equal(sharedDetail.selectedPrinting.id, "printing-1");
      assert.deepEqual(sharedDetail.selectedPrinting.artists, ["Test Artist"]);

      const standaloneDetail = queryDetail("printing-2");
      assert.ok(standaloneDetail);
      assert.equal(standaloneDetail.card.id, "printing-2");
      assert.equal(standaloneDetail.card.hasSharedIdentity, false);
      assert.deepEqual(
        standaloneDetail.card.faces.map((face) => face.name),
        ["Second Test Front", "Second Test Back"],
      );
      assert.deepEqual(standaloneDetail.siblingPrintings, []);

      assert.equal(
        queryImageSource({ faceIndex: 0, printingId: "printing-1", size: "normal" }),
        "https://cards.scryfall.io/normal/front/1.jpg",
      );
      assert.equal(
        queryImageSource({ faceIndex: 1, printingId: "printing-2", size: "normal" }),
        "https://cards.scryfall.io/normal/back/2.jpg",
      );
      assert.equal(
        queryImageSource({ faceIndex: 0, printingId: "printing-1", size: "thumb" }),
        "https://cards.scryfall.io/thumb/front/1.webp",
      );

      assert.deepEqual(queryCatalog({ limit: 1 }), {
        cards: [
          {
            collectorNumber: "1",
            gridImage: {
              faceIndex: 0,
              printingId: "printing-1",
              size: "small",
            },
            id: "printing-1",
            image: {
              faceIndex: 0,
              printingId: "printing-1",
              size: "thumb",
            },
            name: "Mooligan Test Card",
            rarity: "rare",
            setCode: "moo",
            setName: "Mooligan Test Set",
            typeLine: "Artifact",
          },
        ],
        hasMore: true,
        total: 4,
      });
      const withoutArtSeries = queryCatalog({ includeArtSeries: false });

      assert.equal(withoutArtSeries.total, 3);
      assert.deepEqual(
        withoutArtSeries.cards.map((card) => card.id),
        ["printing-1", "printing-3", "printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ query: "alternate" }).cards.map(({ gridImage, image }) => ({
          gridImage,
          image,
        })),
        [
          {
            gridImage: { faceIndex: 0, printingId: "printing-3", size: "small" },
            image: null,
          },
        ],
      );
      assert.deepEqual(
        queryCatalog({ query: "series" }).cards.map((card) => card.id),
        ["art-series-1"],
      );
      assert.deepEqual(queryCatalog({ includeArtSeries: false, query: "series" }), {
        cards: [],
        hasMore: false,
        total: 0,
      });
      assert.deepEqual(
        queryCatalog({ includeDigital: false }).cards.map((card) => card.id),
        ["printing-1", "art-series-1", "printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ universe: "beyond" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ universe: "within" }).cards.map((card) => card.id),
        ["printing-3", "art-series-1", "printing-2"],
      );
      assert.equal(queryCatalog({ limit: 1, universe: "within" }).total, null);
      assert.deepEqual(
        queryCatalog({
          includeArtSeries: false,
          includeDigital: false,
          universe: "within",
        }).cards.map((card) => card.id),
        ["printing-2"],
      );
      assert.deepEqual(queryCatalog({ uniqueCards: true }), {
        cards: [
          {
            collectorNumber: "1",
            gridImage: {
              faceIndex: 0,
              printingId: "printing-1",
              size: "small",
            },
            id: "printing-1",
            image: {
              faceIndex: 0,
              printingId: "printing-1",
              size: "thumb",
            },
            name: "Mooligan Test Card",
            rarity: "rare",
            setCode: "moo",
            setName: "Mooligan Test Set",
            typeLine: "Artifact",
          },
          {
            collectorNumber: "2",
            gridImage: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "small",
            },
            id: "printing-2",
            image: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "thumb",
            },
            name: "Second Test Card",
            rarity: "common",
            setCode: "moo",
            setName: "Mooligan Test Set",
            typeLine: "Creature — Test",
          },
        ],
        hasMore: false,
        total: 2,
      });
      assert.deepEqual(
        queryCatalog({ query: "alternate", uniqueCards: true }).cards.map((card) => card.id),
        ["printing-3"],
      );
      assert.deepEqual(queryCatalog({ limit: 1, query: "second" }), {
        cards: [
          {
            collectorNumber: "2",
            gridImage: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "small",
            },
            id: "printing-2",
            image: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "thumb",
            },
            name: "Second Test Card",
            rarity: "common",
            setCode: "moo",
            setName: "Mooligan Test Set",
            typeLine: "Creature — Test",
          },
        ],
        hasMore: false,
        total: 1,
      });
      assert.deepEqual(
        queryCatalog({ query: "creat" }).cards.map((card) => card.id),
        ["printing-2"],
      );
      assert.deepEqual(queryCatalog({ query: "///" }), {
        cards: [],
        hasMore: false,
        total: 0,
      });
      assert.ok(
        database
          .prepare(
            `EXPLAIN QUERY PLAN
             SELECT id
             FROM cards
             ORDER BY name COLLATE NOCASE,
                      set_code COLLATE NOCASE,
                      collector_number COLLATE NOCASE
             LIMIT 100`,
          )
          .all()
          .some((row) => {
            const plan = QueryPlanRowSchema.safeParse(row);
            return plan.success && plan.data.detail.includes("USING INDEX cards_browse_order");
          }),
      );
      assert.ok(
        database
          .prepare("EXPLAIN QUERY PLAN SELECT json FROM cards WHERE oracle_id = ?")
          .all("oracle-1")
          .some((row) => {
            const plan = QueryPlanRowSchema.safeParse(row);
            return plan.success && plan.data.detail.includes("cards_oracle_id");
          }),
      );

      const worker = new Worker(new URL("../electron/catalog/query-worker.ts", import.meta.url), {
        workerData: destination,
      });

      try {
        const response = await new Promise<CatalogQueryWorkerResponse>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({
            id: 1,
            operation: { request: { query: "second" }, type: "list" },
          });
        });

        assert.deepEqual(response, {
          id: 1,
          operation: "list",
          result: {
            cards: [
              {
                collectorNumber: "2",
                gridImage: {
                  faceIndex: 0,
                  printingId: "printing-2",
                  size: "small",
                },
                id: "printing-2",
                image: {
                  faceIndex: 0,
                  printingId: "printing-2",
                  size: "thumb",
                },
                name: "Second Test Card",
                rarity: "common",
                setCode: "moo",
                setName: "Mooligan Test Set",
                typeLine: "Creature — Test",
              },
            ],
            hasMore: false,
            total: 1,
          },
        });

        const detailResponse = await new Promise<CatalogQueryWorkerResponse>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({
            id: 2,
            operation: { printingId: "printing-1", type: "detail" },
          });
        });
        assert.equal(detailResponse.id, 2);
        assert.equal(detailResponse.operation, "detail");
        assert.ok(!("error" in detailResponse));
        assert.equal(
          "result" in detailResponse ? detailResponse.result?.selectedPrinting.id : undefined,
          "printing-1",
        );

        const imageResponse = await new Promise<CatalogQueryWorkerResponse>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({
            id: 3,
            operation: {
              image: { faceIndex: 0, printingId: "printing-1", size: "small" },
              type: "image-source",
            },
          });
        });
        assert.deepEqual(imageResponse, {
          id: 3,
          operation: "image-source",
          result: "https://cards.scryfall.io/small/front/1.jpg",
        });

        const malformedResponse = await new Promise<unknown>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({
            id: 4,
            operation: { printingId: { value: "printing-1" }, type: "detail" },
          });
        });
        assert.deepEqual(malformedResponse, {
          error: "Invalid catalog query request.",
          id: null,
          operation: "invalid",
        });

        const unknownOperationResponse = await new Promise<unknown>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({ id: 5, operation: { type: "unknown" } });
        });
        assert.deepEqual(unknownOperationResponse, {
          error: "Invalid catalog query request.",
          id: null,
          operation: "invalid",
        });

        const oversizedImageIdResponse = await new Promise<unknown>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({
            id: 6,
            operation: {
              image: { faceIndex: 0, printingId: "x".repeat(129), size: "small" },
              type: "image-source",
            },
          });
        });
        assert.deepEqual(oversizedImageIdResponse, {
          error: "Invalid catalog query request.",
          id: null,
          operation: "invalid",
        });
      } finally {
        await worker.terminate();
      }
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
