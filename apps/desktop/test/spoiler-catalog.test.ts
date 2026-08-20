import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  ScryfallSetDownloadSchema,
  type ScryfallCardDownload,
  type ScryfallSetDownload,
} from "@mooligan/domain/catalog-sync";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import * as z from "zod";

import {
  createCatalogDetailQuery,
  createCatalogImageSourceQuery,
  createCatalogSetSymbolSourceQuery,
} from "../electron/catalog/detail.ts";
import { importCatalog } from "../electron/catalog/import.ts";
import {
  createCatalogQuery,
  createCatalogRootSetQuery,
  createCatalogSpoilerRevealSummariesQuery,
  createCatalogUpcomingPrintingsQuery,
  createCatalogUpcomingQuery,
} from "../electron/catalog/query.ts";

const PROTECTED: SpoilerVisibilitySnapshot = {
  currentDate: "2026-08-19",
  policy: "protect",
  revealedPrintingIds: [],
  revealedRootSetIds: [],
  revision: 0,
};

void test("catalog reads enforce spoiler visibility before any card data crosses the boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoilers-"));
  const path = join(directory, "cards.sqlite");
  const cards = [
    card({
      id: "old-reprint",
      name: "Returning Card",
      oracle_id: "oracle-returning",
      released_at: "2025-01-01",
      set: "old",
      set_id: "set-old",
      set_name: "Old Set",
    }),
    card({
      id: "future-reprint",
      name: "Returning Card",
      oracle_id: "oracle-returning",
      released_at: "2026-09-10",
      set: "fut",
      set_id: "set-future",
      set_name: "Future Family",
    }),
    card({
      id: "secret-card",
      image_uris: { normal: "https://cards.scryfall.io/normal/front/secret.jpg" },
      name: "Secret Card",
      oracle_id: "oracle-secret",
      released_at: "2026-09-10",
      set: "fut",
      set_id: "set-future",
      set_name: "Future Family",
    }),
    card({
      id: "secret-treatment",
      name: "Secret Card",
      oracle_id: "oracle-secret",
      released_at: "2026-09-12",
      set: "futp",
      set_id: "set-future-promo",
      set_name: "Future Family Promos",
    }),
    card({
      id: "fallback-date",
      name: "Fallback Date Card",
      set: "futp",
      set_id: "set-future-promo",
      set_name: "Future Family Promos",
    }),
  ];
  const sets = [
    set({ code: "old", id: "set-old", name: "Old Set", released_at: "2025-01-01" }),
    set({
      card_count: 2,
      code: "fut",
      id: "set-future",
      name: "Future Family",
      released_at: "2026-09-10",
    }),
    set({
      card_count: 2,
      code: "futp",
      id: "set-future-promo",
      name: "Future Family Promos",
      parent_set_code: "fut",
      released_at: "2026-09-12",
    }),
  ];

  try {
    await importCatalog(
      path,
      {
        compressedSize: 1,
        downloadUrl: "https://data.scryfall.io/default-cards/test.jsonl.gz",
        updatedAt: "2026-08-19T12:00:00+00:00",
      },
      sets,
      (async function* () {
        for (const value of cards) yield JSON.stringify(value);
      })(),
      () => undefined,
    );

    const database = new DatabaseSync(path);
    try {
      const list = createCatalogQuery(database);
      const detail = createCatalogDetailQuery(database);
      const image = createCatalogImageSourceQuery(database);
      const upcoming = createCatalogUpcomingQuery(database);
      const upcomingPrintings = createCatalogUpcomingPrintingsQuery(database);
      const resolveRoot = createCatalogRootSetQuery(database);
      const revealSummaries = createCatalogSpoilerRevealSummariesQuery(database);
      const symbolSource = createCatalogSetSymbolSourceQuery(database);

      assert.deepEqual(list(undefined, PROTECTED), {
        cards: [assertionCard("old-reprint", "Returning Card", "old")],
        hasMore: false,
        total: 1,
      });
      assert.deepEqual(list({ query: "secret" }, PROTECTED), {
        cards: [],
        hasMore: false,
        total: 0,
      });
      assert.deepEqual(
        list({ uniqueCards: true }, PROTECTED).cards.map(({ id }) => id),
        ["old-reprint"],
      );

      const protectedUpcoming = upcomingPrintings(undefined, PROTECTED);
      assert.deepEqual(protectedUpcoming, {
        hasMore: false,
        printings: [
          protectedUpcomingPrinting("future-reprint", "2026-09-10"),
          protectedUpcomingPrinting("secret-card", "2026-09-10"),
          protectedUpcomingPrinting("fallback-date", "2026-09-12"),
          protectedUpcomingPrinting("secret-treatment", "2026-09-12"),
        ],
        total: 4,
      });
      assert.equal(JSON.stringify(protectedUpcoming).includes("Secret Card"), false);
      assert.deepEqual(upcomingPrintings({ limit: 2, offset: 1 }, PROTECTED), {
        hasMore: true,
        printings: [
          protectedUpcomingPrinting("secret-card", "2026-09-10"),
          protectedUpcomingPrinting("fallback-date", "2026-09-12"),
        ],
        total: 4,
      });

      const protectedSecret = detail("secret-card", PROTECTED);
      assert.ok(protectedSecret && protectedSecret.status === "protected");
      assert.equal(JSON.stringify(protectedSecret).includes("Secret Card"), false);
      assert.deepEqual(protectedSecret, {
        printingId: "secret-card",
        release: {
          code: "fut",
          name: "Future Family",
          nextReleaseOn: "2026-09-10",
          rootSetId: "set-future",
          symbol: { setId: "set-future" },
        },
        releasedOn: "2026-09-10",
        status: "protected",
      });

      const storedSecret = z
        .object({ json: z.string() })
        .parse(database.prepare("SELECT json FROM cards WHERE id = ?").get("secret-card"));
      database.prepare("UPDATE cards SET json = '42' WHERE id = ?").run("secret-card");
      assert.equal(detail("secret-card", PROTECTED)?.status, "protected");
      database
        .prepare("UPDATE cards SET json = ? WHERE id = ?")
        .run(storedSecret.json, "secret-card");

      assert.equal(
        image({ faceIndex: 0, printingId: "secret-card", size: "normal" }, PROTECTED),
        null,
      );

      const printingReveal = {
        ...PROTECTED,
        revealedPrintingIds: ["secret-card"],
        revision: 1,
      };
      const visibleSecret = detail("secret-card", printingReveal);
      assert.ok(visibleSecret && visibleSecret.status === "visible");
      assert.equal(visibleSecret.visibility.reason, "printing");
      assert.deepEqual(
        visibleSecret.detail.siblingPrintings.map(({ id }) => id),
        ["secret-card"],
      );
      assert.equal(
        image({ faceIndex: 0, printingId: "secret-card", size: "normal" }, printingReveal),
        "https://cards.scryfall.io/normal/front/secret.jpg",
      );
      assert.deepEqual(
        upcomingPrintings(undefined, printingReveal).printings.map((printing) =>
          printing.status === "visible"
            ? [printing.card.id, printing.card.name, printing.status]
            : [printing.printingId, printing.status],
        ),
        [
          ["future-reprint", "protected"],
          ["secret-card", "Secret Card", "visible"],
          ["fallback-date", "protected"],
          ["secret-treatment", "protected"],
        ],
      );

      const releaseReveal = {
        ...PROTECTED,
        revealedRootSetIds: ["set-future"],
        revision: 2,
      };
      assert.deepEqual(
        list({ uniqueCards: true }, releaseReveal).cards.map(({ id }) => id),
        ["fallback-date", "secret-treatment", "future-reprint"],
      );
      const releaseVisible = detail("secret-treatment", releaseReveal);
      assert.ok(releaseVisible && releaseVisible.status === "visible");
      assert.equal(releaseVisible.visibility.reason, "release");
      assert.deepEqual(
        upcomingPrintings(undefined, releaseReveal).printings.map((printing) => printing.status),
        ["visible", "visible", "visible", "visible"],
      );

      const released = { ...PROTECTED, currentDate: "2026-09-10", revision: 3 };
      const automatic = detail("future-reprint", released);
      assert.ok(automatic && automatic.status === "visible");
      assert.deepEqual(automatic.visibility, { reason: "released" });
      const fallback = detail("fallback-date", released);
      assert.ok(fallback && fallback.status === "protected");
      assert.equal(fallback.releasedOn, "2026-09-12");

      assert.deepEqual(upcoming(PROTECTED), [
        {
          code: "fut",
          name: "Future Family",
          nextReleaseOn: "2026-09-10",
          rootSetId: "set-future",
          symbol: { setId: "set-future" },
        },
      ]);
      assert.equal(resolveRoot("secret-card"), "set-future");
      assert.equal(resolveRoot("set-future-promo"), "set-future");
      assert.equal(resolveRoot("missing"), null);
      assert.deepEqual(revealSummaries(["secret-card"], ["set-future"]), {
        printings: [
          {
            detail: "Future Family (FUT) #1",
            label: "Secret Card",
            rootSetId: "set-future",
            scope: "printing",
            targetId: "secret-card",
          },
        ],
        releases: [
          {
            detail: "FUT",
            label: "Future Family",
            scope: "release",
            targetId: "set-future",
          },
        ],
      });
      assert.equal(symbolSource({ setId: "set-future" }), "https://svgs.scryfall.io/sets/fut.svg");
      assert.equal(detail("x".repeat(129), PROTECTED), null);
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

function set(overrides: Partial<ScryfallSetDownload>) {
  const code = overrides.code ?? "tst";
  const id = overrides.id ?? `set-${code}`;
  return ScryfallSetDownloadSchema.parse({
    card_count: 1,
    code,
    digital: false,
    foil_only: false,
    icon_svg_uri: `https://svgs.scryfall.io/sets/${code}.svg`,
    id,
    name: `${code.toUpperCase()} Set`,
    nonfoil_only: false,
    object: "set",
    scryfall_uri: `https://scryfall.com/sets/${code}`,
    search_uri: `https://api.scryfall.com/cards/search?q=e%3A${code}`,
    set_type: "expansion",
    uri: `https://api.scryfall.com/sets/${id}`,
    ...overrides,
  });
}

function card(overrides: Partial<ScryfallCardDownload>) {
  return {
    collector_number: "1",
    id: "printing",
    name: "Card",
    object: "card",
    rarity: "common",
    set: "tst",
    set_id: "set-tst",
    set_name: "Test Set",
    type_line: "Artifact",
    ...overrides,
  };
}

function assertionCard(id: string, name: string, setCode: string) {
  return {
    collectorNumber: "1",
    gridImage: null,
    id,
    image: null,
    name,
    rarity: "common",
    setCode,
    setName: "Old Set",
    typeLine: "Artifact",
  };
}

function protectedUpcomingPrinting(printingId: string, releasedOn: string) {
  return {
    printingId,
    release: {
      code: "fut",
      name: "Future Family",
      nextReleaseOn: "2026-09-10",
      rootSetId: "set-future",
      symbol: { setId: "set-future" },
    },
    releasedOn,
    status: "protected",
  };
}
