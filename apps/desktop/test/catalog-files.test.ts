import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { gzipSync } from "node:zlib";
import { ScryfallSetDownloadSchema, type ScryfallSetDownload } from "@mooligan/domain/catalog-sync";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import * as z from "zod";

import { recoverInterruptedReplacement } from "../electron/catalog/files.ts";
import {
  createCatalogDetailQuery,
  createCatalogImageSourceQuery,
  validateCatalogPrintingId,
} from "../electron/catalog/detail.ts";
import {
  compactCatalogName,
  importCatalog,
  readGzipJsonLines,
  resolveCatalogSets,
} from "../electron/catalog/import.ts";
import {
  createCatalogQuery,
  type CatalogQueryWorkerResponse,
  validateCatalogListRequest,
  validateCatalogUpcomingPrintingRequest,
} from "../electron/catalog/query.ts";
import {
  reconcileCatalogSearchDraft,
  validateCatalogSearch,
} from "../src/features/search/search-state.ts";
import { WorkspaceStore } from "../electron/workspace/store.ts";

const QueryPlanRowSchema = z.object({ detail: z.string() });
const SHOW_ALL: SpoilerVisibilitySnapshot = {
  currentDate: "2026-08-19",
  policy: "show",
  revealedPrintingIds: [],
  revealedRootSetIds: [],
  revision: 0,
};

function scryfallSet(overrides: Partial<ScryfallSetDownload>) {
  const code = overrides.code ?? "tst";
  const id = overrides.id ?? `set-${code}`;
  return ScryfallSetDownloadSchema.parse({
    card_count: 1,
    code,
    digital: false,
    foil_only: false,
    icon_svg_uri: `https://svgs.scryfall.io/sets/${code}.svg`,
    id,
    name: `${code.toUpperCase()} Test Set`,
    nonfoil_only: false,
    object: "set" as const,
    scryfall_uri: `https://scryfall.com/sets/${code}`,
    search_uri: `https://api.scryfall.com/cards/search?order=set&q=e%3A${code}`,
    set_type: "expansion",
    uri: `https://api.scryfall.com/sets/${id}`,
    ...overrides,
  });
}

function createTestCatalogQuery(database: DatabaseSync) {
  const query = createCatalogQuery(database);
  return (input?: Parameters<typeof query>[0]) => query(input, SHOW_ALL);
}

function createTestDetailQuery(database: DatabaseSync) {
  const query = createCatalogDetailQuery(database);
  return (printingId: string) => {
    const result = query(printingId, SHOW_ALL);
    if (!result || result.status !== "visible") {
      return null;
    }
    return result.detail;
  };
}

function createTestImageSourceQuery(database: DatabaseSync) {
  const query = createCatalogImageSourceQuery(database);
  return (image: Parameters<typeof query>[0]) => query(image, SHOW_ALL);
}

void test("catalog search state keeps only valid non-default values", () => {
  assert.deepEqual(
    validateCatalogSearch({
      adCards: true,
      artSeries: true,
      digital: true,
      grid: true,
      mode: "upcoming",
      query: `  Mooligan ${"x".repeat(520)}  `,
      tokens: true,
      uniqueCards: true,
      universe: "beyond",
    }),
    {
      adCards: true,
      artSeries: true,
      digital: true,
      grid: true,
      mode: "upcoming",
      query: `Mooligan ${"x".repeat(491)}`,
      tokens: true,
      uniqueCards: true,
      universe: "beyond",
    },
  );
  assert.deepEqual(
    validateCatalogSearch({
      adCards: false,
      digital: false,
      grid: "true",
      mode: "cards",
      query: "   ",
      tokens: false,
      universe: "all",
    }),
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

void test("catalog names can be searched without punctuation or spaces", () => {
  assert.equal(compactCatalogName("Y'shtola"), "yshtola");
  assert.equal(compactCatalogName("Sol Ring"), "solring");
});

void test("catalog sets resolve root, child, and grandchild release families", () => {
  const root = scryfallSet({ code: "root", id: "set-root" });
  const child = scryfallSet({
    code: "child",
    id: "set-child",
    parent_set_code: "root",
  });
  const grandchild = scryfallSet({
    code: "grandchild",
    id: "set-grandchild",
    parent_set_code: "child",
  });

  assert.deepEqual(
    resolveCatalogSets([grandchild, root, child]).map(({ code, rootSetId }) => ({
      code,
      rootSetId,
    })),
    [
      { code: "grandchild", rootSetId: "set-root" },
      { code: "root", rootSetId: "set-root" },
      { code: "child", rootSetId: "set-root" },
    ],
  );
});

void test("catalog set resolution rejects missing parents, cycles, and duplicate identities", () => {
  assert.throws(
    () =>
      resolveCatalogSets([
        scryfallSet({ code: "child", id: "set-child", parent_set_code: "missing" }),
      ]),
    /missing parent/u,
  );
  assert.throws(
    () =>
      resolveCatalogSets([
        scryfallSet({ code: "one", id: "set-one", parent_set_code: "two" }),
        scryfallSet({ code: "two", id: "set-two", parent_set_code: "one" }),
      ]),
    /parent cycle/u,
  );
  assert.throws(
    () =>
      resolveCatalogSets([
        scryfallSet({ code: "same", id: "set-one" }),
        scryfallSet({ code: "same", id: "set-two" }),
      ]),
    /duplicate code/u,
  );
  assert.throws(
    () =>
      resolveCatalogSets([
        scryfallSet({ code: "one", id: "set-same" }),
        scryfallSet({ code: "two", id: "set-same" }),
      ]),
    /duplicate ID/u,
  );
});

void test("catalog import rejects missing and mismatched card set identities", async () => {
  const set = scryfallSet({ code: "tst", id: "set-tst" });
  const cases = [
    {
      card: { set: "tst", set_id: "set-missing" },
      error: /references missing set set-missing/u,
    },
    {
      card: { set: "wrong", set_id: "set-tst" },
      error: /does not match set set-tst/u,
    },
  ];

  for (const [index, entry] of cases.entries()) {
    const directory = await mkdtemp(join(tmpdir(), "mooligan-invalid-set-"));
    try {
      const card = JSON.stringify({
        collector_number: "1",
        id: `printing-${index}`,
        name: "Invalid Set Card",
        object: "card",
        rarity: "common",
        set_name: "Test Set",
        type_line: "Artifact",
        ...entry.card,
      });
      await assert.rejects(
        importCatalog(
          join(directory, "cards.sqlite"),
          {
            compressedSize: 1,
            downloadUrl: "https://data.scryfall.io/default-cards/test.jsonl.gz",
            updatedAt: "2026-08-19T12:00:00+00:00",
          },
          [set],
          (async function* () {
            yield card;
          })(),
          () => undefined,
        ),
        entry.error,
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

void test("catalog IPC input accepts only the narrow list request", () => {
  assert.deepEqual(validateCatalogListRequest(undefined), {});
  assert.deepEqual(validateCatalogListRequest({ universe: undefined }), { universe: undefined });
  assert.deepEqual(
    validateCatalogListRequest({
      includeAdCards: false,
      includeArtSeries: false,
      includeDigital: false,
      includeTokens: false,
      limit: 100,
      offset: 0,
      query: "mox",
      universe: "within",
    }),
    {
      includeAdCards: false,
      includeArtSeries: false,
      includeDigital: false,
      includeTokens: false,
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

void test("upcoming printing IPC input accepts only pagination", () => {
  assert.deepEqual(validateCatalogUpcomingPrintingRequest(undefined), {});
  assert.deepEqual(validateCatalogUpcomingPrintingRequest({ limit: 100, offset: 0 }), {
    limit: 100,
    offset: 0,
  });
  assert.throws(() => validateCatalogUpcomingPrintingRequest({ limit: 251 }));
  assert.throws(() => validateCatalogUpcomingPrintingRequest({ offset: -1 }));
  assert.throws(() => validateCatalogUpcomingPrintingRequest({ query: "secret" }));
});

void test("catalog filters tokens and ad cards independently", () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec(`
      CREATE TABLE catalog_meta (
        singleton INTEGER PRIMARY KEY,
        card_count INTEGER NOT NULL
      );
      CREATE TABLE sets (
        id TEXT PRIMARY KEY,
        root_set_id TEXT NOT NULL,
        released_at TEXT
      );
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        oracle_id TEXT,
        identity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        compact_name TEXT NOT NULL,
        set_id TEXT NOT NULL,
        root_set_id TEXT NOT NULL,
        set_code TEXT NOT NULL,
        set_name TEXT NOT NULL,
        collector_number TEXT NOT NULL,
        type_line TEXT NOT NULL,
        oracle_text TEXT NOT NULL,
        mana_cost TEXT NOT NULL,
        artist TEXT NOT NULL,
        flavor_text TEXT NOT NULL,
        rarity TEXT NOT NULL,
        released_at TEXT NOT NULL,
        effective_released_at TEXT,
        json TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE card_search USING fts5(
        name,
        compact_name,
        set_code,
        collector_number,
        set_name,
        type_line,
        oracle_text,
        mana_cost,
        artist,
        flavor_text,
        content = 'cards',
        content_rowid = 'rowid'
      );
    `);
    const insert = database.prepare(
      `INSERT INTO cards
       (id, oracle_id, identity_id, name, compact_name, set_id, root_set_id, set_code, set_name,
        collector_number, type_line, oracle_text, mana_cost, artist, flavor_text, rarity, released_at,
        effective_released_at, json)
       VALUES (?, ?, ?, ?, '', 'set-tst', 'set-tst', 'tst', 'Filter Test', ?, ?, '', '', '', '', 'common',
               '2024-01-01', '2024-01-01', ?)`,
    );
    const cards = [
      ["normal", "Alpha Card", "1", "Artifact", "normal"],
      ["token", "Goblin", "2", "Token Creature — Goblin", "token"],
      ["double-token", "Punchcard", "3", "Card // Card", "double_faced_token"],
      ["helper", "Ready to Attack", "4", "Card", "token"],
      ["ad", "1997 World Championships Ad", "0", "Card", "token"],
    ] as const;
    database
      .prepare("INSERT INTO sets (id, root_set_id, released_at) VALUES (?, ?, ?)")
      .run("set-tst", "set-tst", "2024-01-01");

    for (const [id, name, collectorNumber, typeLine, layout] of cards) {
      insert.run(
        id,
        `${id}-oracle`,
        `${id}-oracle`,
        name,
        collectorNumber,
        typeLine,
        JSON.stringify({ digital: false, layout }),
      );
    }
    database.prepare("INSERT INTO catalog_meta (singleton, card_count) VALUES (1, ?)").run(5);
    database.exec("INSERT INTO card_search(card_search) VALUES ('rebuild')");

    const queryCatalog = createTestCatalogQuery(database);
    const ids = (request: Parameters<typeof queryCatalog>[0]) =>
      queryCatalog(request).cards.map((card) => card.id);

    assert.deepEqual(ids({ includeAdCards: false, includeTokens: false }), ["normal"]);
    assert.deepEqual(ids({ includeAdCards: false, includeTokens: true }), [
      "normal",
      "token",
      "double-token",
      "helper",
    ]);
    assert.deepEqual(ids({ includeAdCards: true, includeTokens: false }), ["ad", "normal"]);
    assert.deepEqual(ids({ includeAdCards: true, includeTokens: true }), [
      "ad",
      "normal",
      "token",
      "double-token",
      "helper",
    ]);
    assert.deepEqual(ids({ includeAdCards: false, includeTokens: true, query: "world" }), []);
    assert.deepEqual(ids({ includeAdCards: true, includeTokens: false, query: "world" }), ["ad"]);
  } finally {
    database.close();
  }
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
    database.exec(`
      CREATE TABLE sets (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        root_set_id TEXT NOT NULL,
        released_at TEXT
      );
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        oracle_id TEXT,
        set_id TEXT NOT NULL,
        root_set_id TEXT NOT NULL,
        released_at TEXT,
        effective_released_at TEXT,
        json
      );
      INSERT INTO sets (id, code, name, root_set_id, released_at)
      VALUES ('set-malformed', 'mal', 'Malformed Set', 'set-malformed', '2024-01-01');
    `);
    const queryDetail = createTestDetailQuery(database);
    const queryImageSource = createTestImageSourceQuery(database);

    assert.equal(queryDetail("missing-printing"), null);
    database
      .prepare(
        `INSERT INTO cards
         (id, oracle_id, set_id, root_set_id, released_at, effective_released_at, json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "malformed-printing",
        null,
        "set-malformed",
        "set-malformed",
        "2024-01-01",
        "2024-01-01",
        42,
      );

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
    database.exec(`
      CREATE TABLE sets (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        root_set_id TEXT NOT NULL,
        released_at TEXT
      );
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        oracle_id TEXT,
        set_id TEXT NOT NULL,
        root_set_id TEXT NOT NULL,
        released_at TEXT,
        effective_released_at TEXT,
        json TEXT NOT NULL
      );
      INSERT INTO sets (id, code, name, root_set_id, released_at)
      VALUES ('set-ord', 'ord', 'Ordering Test Set', 'set-ord', '2026-08-14');
    `);
    const insert = database.prepare(
      `INSERT INTO cards
       (id, oracle_id, set_id, root_set_id, released_at, effective_released_at, json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const [id, collectorNumber] of [
      ["printing-10", "10"],
      ["printing-2b", "2"],
      ["printing-2a", "2"],
    ] as const) {
      insert.run(
        id,
        "shared-oracle",
        "set-ord",
        "set-ord",
        "2026-08-14",
        "2026-08-14",
        JSON.stringify({
          collector_number: collectorNumber,
          id,
          name: "Ordering Test Card",
          object: "card",
          oracle_id: "shared-oracle",
          rarity: "common",
          released_at: "2026-08-14",
          set: "ord",
          set_id: "set-ord",
          set_name: "Ordering Test Set",
          type_line: "Artifact",
        }),
      );
    }

    const detail = createTestDetailQuery(database)("printing-10");
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
      colors: ["U"],
      color_identity: ["U"],
      cmc: 2,
      digital: false,
      finishes: ["nonfoil", "foil"],
      flavor_text: "A battle begins.",
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
      oracle_text: "Flying\nWhenever Mooligan Test Card attacks, draw a card.",
      oracle_id: "oracle-1",
      promo: false,
      promo_types: ["universesbeyond"],
      rarity: "rare",
      released_at: "2024-06-14",
      set: "moo",
      set_id: "set-moo",
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
      set_id: "set-zzz",
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
      set_id: "set-zzza",
      set_name: "Art Series Test Set",
      type_line: "Card",
    },
    {
      collector_number: "2",
      colors: ["G"],
      color_identity: ["G"],
      cmc: 3,
      digital: false,
      finishes: ["nonfoil"],
      id: "printing-2",
      lang: "en",
      name: "Second Test Card",
      object: "card",
      released_at: "2023-04-01",
      rarity: "common",
      set: "moo",
      set_id: "set-moo",
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
  const sets = [
    scryfallSet({
      card_count: 2,
      code: "moo",
      id: "set-moo",
      name: "Mooligan Test Set",
      released_at: "2024-06-14",
    }),
    scryfallSet({
      code: "zzz",
      id: "set-zzz",
      name: "Alternate Test Set",
      released_at: "2025-01-03",
    }),
    scryfallSet({
      code: "zzza",
      id: "set-zzza",
      name: "Art Series Test Set",
      released_at: null,
    }),
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
      sets,
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
      const queryCatalog = createTestCatalogQuery(database);
      const queryDetail = createTestDetailQuery(database);
      const queryImageSource = createTestImageSourceQuery(database);

      assert.equal(validateCatalogPrintingId("  printing-1  "), "printing-1");
      assert.equal(validateCatalogPrintingId("   "), null);
      assert.equal(validateCatalogPrintingId("x".repeat(129)), null);
      assert.equal(validateCatalogPrintingId({ id: "printing-1" }), null);
      assert.equal(queryDetail("missing-printing"), null);

      const sharedDetail = queryDetail("printing-1");
      assert.ok(sharedDetail);
      assert.equal(sharedDetail.card.id, "oracle-1");
      assert.equal(sharedDetail.card.hasSharedIdentity, true);
      assert.equal(
        sharedDetail.card.faces[0]?.oracleText,
        "Flying\nWhenever Mooligan Test Card attacks, draw a card.",
      );
      assert.deepEqual(sharedDetail.legalities, [
        { formatId: "future_format", formatName: "Future Format", status: "not-legal" },
        { formatId: "modern", formatName: "Modern", status: "legal" },
      ]);
      assert.deepEqual(
        sharedDetail.siblingPrintings.map(({ id, image }) => ({ id, image })),
        [
          { id: "printing-3", image: undefined },
          {
            id: "printing-1",
            image: { faceIndex: 0, printingId: "printing-1", size: "grid" },
          },
          { id: "art-series-1", image: undefined },
        ],
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
      assert.equal(
        queryImageSource({ faceIndex: 0, printingId: "printing-1", size: "grid" }),
        "https://cards.scryfall.io/grid/front/1.webp",
      );

      assert.deepEqual(queryCatalog({ limit: 1 }), {
        cards: [
          {
            collectorNumber: "8",
            gridImage: null,
            id: "printing-3",
            image: null,
            isDigital: true,
            name: "Mooligan Test Card",
            rarity: "uncommon",
            setCode: "zzz",
            setName: "Alternate Test Set",
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
        ["printing-3", "printing-1", "printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ query: "mooligan" }).cards.map((card) => card.id),
        ["printing-3", "printing-1", "printing-2", "art-series-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "mooligantestcard" }).cards.map((card) => card.id),
        ["printing-3", "printing-1", "art-series-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "alternate" }).cards.map(({ gridImage, image }) => ({
          gridImage,
          image,
        })),
        [
          {
            gridImage: null,
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
        ["printing-1", "printing-2", "art-series-1"],
      );
      assert.deepEqual(
        queryCatalog({ universe: "beyond" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ universe: "within" }).cards.map((card) => card.id),
        ["printing-3", "printing-2", "art-series-1"],
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
            collectorNumber: "8",
            gridImage: null,
            id: "printing-3",
            image: null,
            isDigital: true,
            name: "Mooligan Test Card",
            rarity: "uncommon",
            setCode: "zzz",
            setName: "Alternate Test Set",
            typeLine: "Artifact",
          },
          {
            collectorNumber: "2",
            gridImage: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "grid",
            },
            id: "printing-2",
            image: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "thumb",
            },
            isDigital: false,
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
              size: "grid",
            },
            id: "printing-2",
            image: {
              faceIndex: 0,
              printingId: "printing-2",
              size: "thumb",
            },
            isDigital: false,
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
      assert.deepEqual(
        queryCatalog({ query: "t:creature c:g mv<=3" }).cards.map((card) => card.id),
        ["printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ query: 'o:"draw a card" f:modern' }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "attacks" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "reach" }).cards.map((card) => card.id),
        ["printing-2"],
      );
      assert.deepEqual(queryCatalog({ query: "o:at" }).cards, []);
      assert.deepEqual(
        queryCatalog({ query: "o:attacks" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(queryCatalog({ query: "a:art" }).cards, []);
      assert.deepEqual(
        queryCatalog({ query: "a:artist" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(queryCatalog({ query: "ft:at" }).cards, []);
      assert.deepEqual(
        queryCatalog({ query: "ft:battle" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "m:1u" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "s:moo r:rare" }).cards.map((card) => card.id),
        ["printing-1"],
      );
      assert.deepEqual(
        queryCatalog({ query: "-is:digital (kw:flying or pow>=3)" }).cards.map((card) => card.id),
        ["printing-1", "printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ query: "id:g" }).cards.map((card) => card.id),
        ["printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ query: "pt:3/4" }).cards.map((card) => card.id),
        ["printing-2"],
      );
      assert.deepEqual(
        queryCatalog({ query: '!"Mooligan Test Card"' }).cards.map((card) => card.id),
        ["printing-3", "printing-1", "art-series-1"],
      );
      assert.deepEqual(queryCatalog({ query: 'name:"Test Mooligan"' }).cards, []);
      assert.deepEqual(queryCatalog({ query: "otag:ramp" }), {
        cards: [],
        hasMore: false,
        queryError: 'The local catalog does not support the "otag" operator.',
        total: 0,
      });
      assert.deepEqual(queryCatalog({ query: "t:creature (c:g or c:u" }), {
        cards: [],
        hasMore: false,
        queryError: "Close the open parenthesis in the Scryfall query.",
        total: 0,
      });
      assert.deepEqual(queryCatalog({ query: "o:/draw (a|two) cards?/" }), {
        cards: [],
        hasMore: false,
        queryError: "Regular expression searches are not supported in the local catalog.",
        total: 0,
      });
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
             WHERE effective_released_at IS NULL
                OR effective_released_at <= ?
                OR ? = 'show'
                OR EXISTS (
                  SELECT 1 FROM json_each(?) AS revealed_printings
                  WHERE revealed_printings.value = cards.id
                )
                OR EXISTS (
                  SELECT 1 FROM json_each(?) AS revealed_releases
                  WHERE revealed_releases.value = cards.root_set_id
                )
             ORDER BY effective_released_at DESC,
                      name COLLATE NOCASE,
                      set_code COLLATE NOCASE,
                      collector_number COLLATE NOCASE,
                      id
             LIMIT 100`,
          )
          .all("2026-08-19", "show", "[]", "[]")
          .some((row) => {
            const plan = QueryPlanRowSchema.safeParse(row);
            return plan.success && plan.data.detail.includes("cards_recent_order");
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

      const workspace = new WorkspaceStore(join(directory, "workspace.sqlite"));
      const worker = new Worker(new URL("../electron/catalog/query-worker.ts", import.meta.url), {
        workerData: { catalogPath: destination, workspacePath: workspace.databasePath },
      });

      try {
        const response = await new Promise<CatalogQueryWorkerResponse>((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
          worker.postMessage({
            id: 1,
            operation: {
              request: { query: "second" },
              type: "list",
              visibility: SHOW_ALL,
            },
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
                  size: "grid",
                },
                id: "printing-2",
                image: {
                  faceIndex: 0,
                  printingId: "printing-2",
                  size: "thumb",
                },
                isDigital: false,
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
            operation: {
              printingId: "printing-1",
              type: "detail",
              visibility: SHOW_ALL,
            },
          });
        });
        assert.equal(detailResponse.id, 2);
        assert.equal(detailResponse.operation, "detail");
        assert.ok(!("error" in detailResponse));
        assert.equal(
          "result" in detailResponse && detailResponse.result?.status === "visible"
            ? detailResponse.result.detail.selectedPrinting.id
            : undefined,
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
              visibility: SHOW_ALL,
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
              visibility: SHOW_ALL,
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
        workspace.close();
      }
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
