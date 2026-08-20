import assert from "node:assert/strict";
import { test } from "node:test";

import { CatalogCardDetailSchema, normalizeScryfallCardDetail } from "../src/catalog-detail.ts";
import {
  CatalogReleaseSchema,
  ScryfallCardDownloadSchema,
  ScryfallSetDownloadSchema,
  ScryfallSetListSchema,
  type ScryfallCardDownload,
} from "../src/catalog-sync.ts";
import { DeckEntrySchema } from "../src/decks.ts";

function scryfallCard(overrides: Partial<ScryfallCardDownload> = {}) {
  return ScryfallCardDownloadSchema.parse({
    collector_number: "1",
    id: "printing-1",
    name: "Test Card",
    object: "card",
    rarity: "common",
    set: "tst",
    set_id: "set-tst",
    set_name: "Test Set",
    type_line: "Artifact",
    ...overrides,
  });
}

void test("deck entries require an exact printing, finish, and positive quantity", () => {
  const entry = {
    finish: "foil",
    id: "entry-1",
    printingId: "printing-1",
    quantity: 1,
    section: "mainboard",
  };

  assert.deepEqual(DeckEntrySchema.parse(entry), entry);
  assert.equal(DeckEntrySchema.safeParse({ ...entry, printingId: "" }).success, false);
  assert.equal(DeckEntrySchema.safeParse({ ...entry, quantity: 0 }).success, false);
});

void test("Scryfall set lists preserve the stable family fields and reject pagination", () => {
  const set = {
    card_count: 271,
    code: "tst",
    digital: false,
    foil_only: false,
    icon_svg_uri: "https://svgs.scryfall.io/sets/tst.svg",
    id: "set-tst",
    name: "Test Set",
    nonfoil_only: false,
    object: "set",
    parent_set_code: "root",
    released_at: "2026-09-18",
    scryfall_uri: "https://scryfall.com/sets/tst",
    search_uri: "https://api.scryfall.com/cards/search?q=e%3Atst",
    set_type: "expansion",
    uri: "https://api.scryfall.com/sets/set-tst",
  };

  assert.deepEqual(ScryfallSetDownloadSchema.parse(set), set);
  assert.deepEqual(ScryfallSetListSchema.parse({ data: [set], has_more: false, object: "list" }), {
    data: [set],
    has_more: false,
    object: "list",
  });
  assert.equal(
    ScryfallSetListSchema.safeParse({ data: [set], has_more: true, object: "list" }).success,
    false,
  );
  assert.equal(
    ScryfallSetDownloadSchema.safeParse({ ...set, icon_svg_uri: "http://example.com/tst.svg" })
      .success,
    false,
  );
});

void test("catalog releases require an HTTPS archive and timestamp", () => {
  const release = {
    compressedSize: 1024,
    downloadUrl: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    updatedAt: "2026-07-31T09:11:02.266+00:00",
  };

  assert.deepEqual(CatalogReleaseSchema.parse(release), release);
  assert.equal(
    CatalogReleaseSchema.safeParse({ ...release, downloadUrl: "http://example.com/cards.gz" })
      .success,
    false,
  );
});

void test("a single-face card normalizes card, printing, and sibling facts", () => {
  const selected = scryfallCard({
    artist: "Christopher Rush",
    collector_number: "161",
    color_identity: ["R"],
    cmc: 1,
    finishes: ["nonfoil", "foil"],
    id: "printing-bolt",
    image_uris: {
      grid: "https://cards.scryfall.io/grid/front/bolt.webp",
      normal: "https://cards.scryfall.io/normal/front/bolt.jpg",
      small: "https://cards.scryfall.io/small/front/bolt.jpg",
    },
    lang: "en",
    mana_cost: "{R}",
    name: "Lightning Bolt",
    oracle_id: "oracle-bolt",
    oracle_text: "Lightning Bolt deals 3 damage to any target.",
    released_at: "1993-08-05",
    set: "lea",
    set_name: "Limited Edition Alpha",
    type_line: "Instant",
  });
  const sibling = scryfallCard({
    digital: true,
    id: "printing-bolt-promo",
    image_uris: {
      grid: "https://cards.scryfall.io/grid/front/promo-bolt.webp",
      small: "https://cards.scryfall.io/small/front/promo-bolt.jpg",
    },
    lang: "ja",
    name: "Lightning Bolt",
    oracle_id: "oracle-bolt",
    promo: true,
    rarity: "rare",
    set: "prm",
    set_name: "Promotional Cards",
    type_line: "Instant",
  });
  const detail = normalizeScryfallCardDetail(selected, [selected, sibling]);

  assert.equal(detail.card.id, "oracle-bolt");
  assert.equal(detail.card.manaValue, 1);
  assert.deepEqual(detail.card.colorIdentity, ["R"]);
  assert.deepEqual(detail.card.faces, [
    {
      manaCost: "{R}",
      name: "Lightning Bolt",
      oracleText: "Lightning Bolt deals 3 damage to any target.",
      typeLine: "Instant",
    },
  ]);
  assert.deepEqual(detail.selectedPrinting.artists, ["Christopher Rush"]);
  assert.deepEqual(detail.selectedPrinting.finishes, ["nonfoil", "foil"]);
  assert.deepEqual(detail.selectedPrinting.images, [
    { faceIndex: 0, printingId: "printing-bolt", size: "normal" },
    { faceIndex: 0, printingId: "printing-bolt", size: "small" },
  ]);
  assert.deepEqual(
    detail.siblingPrintings.map(({ id, image, isDigital, isPromo }) => ({
      id,
      image,
      isDigital,
      isPromo,
    })),
    [
      {
        id: "printing-bolt",
        image: { faceIndex: 0, printingId: "printing-bolt", size: "grid" },
        isDigital: false,
        isPromo: false,
      },
      {
        id: "printing-bolt-promo",
        image: { faceIndex: 0, printingId: "printing-bolt-promo", size: "grid" },
        isDigital: true,
        isPromo: true,
      },
    ],
  );
  assert.equal(JSON.stringify(detail).includes("cards.scryfall.io"), false);
});

void test("multi-face normalization preserves order, fields, artists, and image indices", () => {
  const detail = normalizeScryfallCardDetail(
    scryfallCard({
      card_faces: [
        {
          artist: "Front Artist",
          image_uris: {
            normal: "https://cards.scryfall.io/normal/front/delver.jpg",
            small: "https://cards.scryfall.io/small/front/delver.jpg",
          },
          mana_cost: "{U}",
          name: "Delver of Secrets",
          oracle_text: "Look at the top card of your library.",
          power: "1",
          toughness: "1",
          type_line: "Creature — Human Wizard",
        },
        {
          artist: "Back Artist",
          defense: "4",
          image_uris: {
            normal: "https://cards.scryfall.io/normal/back/delver.jpg",
            small: "https://cards.scryfall.io/small/back/delver.jpg",
          },
          loyalty: "3",
          name: "Insectile Aberration",
          oracle_text: "Flying",
          power: "3",
          toughness: "2",
          type_line: "Creature — Human Insect",
        },
      ],
      id: "printing-delver",
      name: "Delver of Secrets // Insectile Aberration",
      oracle_id: "oracle-delver",
      rarity: "uncommon",
    }),
  );

  assert.deepEqual(
    detail.card.faces.map(({ name, power, toughness, defense, loyalty }) => ({
      name,
      power,
      toughness,
      defense,
      loyalty,
    })),
    [
      {
        defense: undefined,
        loyalty: undefined,
        name: "Delver of Secrets",
        power: "1",
        toughness: "1",
      },
      {
        defense: "4",
        loyalty: "3",
        name: "Insectile Aberration",
        power: "3",
        toughness: "2",
      },
    ],
  );
  assert.deepEqual(detail.selectedPrinting.artists, ["Front Artist", "Back Artist"]);
  assert.deepEqual(
    detail.selectedPrinting.images.map(({ faceIndex, size }) => ({ faceIndex, size })),
    [
      { faceIndex: 0, size: "normal" },
      { faceIndex: 0, size: "small" },
      { faceIndex: 1, size: "normal" },
      { faceIndex: 1, size: "small" },
    ],
  );
});

void test("a multi-face card without a shared mana value does not fabricate zero", () => {
  const detail = normalizeScryfallCardDetail(
    scryfallCard({
      card_faces: [
        { mana_cost: "{2}{U}{U}", name: "Front", type_line: "Enchantment" },
        { mana_cost: "{3}{R}", name: "Back", type_line: "Creature" },
      ],
      name: "Front // Back",
      oracle_id: "reversible-oracle",
    }),
  );

  assert.equal(detail.card.manaValue, undefined);
  assert.deepEqual(
    detail.card.faces.map(({ manaCost }) => manaCost),
    ["{2}{U}{U}", "{3}{R}"],
  );
});

void test("a printing without an Oracle ID remains a standalone card", () => {
  const detail = normalizeScryfallCardDetail(
    scryfallCard({ id: "standalone-token", name: "Goblin", type_line: "Token Creature — Goblin" }),
  );

  assert.equal(detail.card.id, "standalone-token");
  assert.equal(detail.card.hasSharedIdentity, false);
  assert.deepEqual(detail.siblingPrintings, []);
  assert.equal(CatalogCardDetailSchema.safeParse(detail).success, true);
  assert.equal(
    CatalogCardDetailSchema.safeParse({
      ...detail,
      siblingPrintings: [
        {
          collectorNumber: "2",
          id: "another-token",
          isDigital: false,
          isPromo: false,
          rarity: "common",
          setCode: "tst",
          setName: "Test Set",
        },
      ],
    }).success,
    false,
  );
});

void test("Scryfall legalities map boundary spelling and preserve unknown formats", () => {
  const detail = normalizeScryfallCardDetail(
    scryfallCard({
      legalities: {
        commander: "not_legal",
        legacy: "banned",
        standard: "legal",
        vintage: "restricted",
        wildly_new_format: "legal",
      },
      oracle_id: "oracle-legalities",
    }),
  );

  assert.deepEqual(
    detail.legalities.map(({ formatId, formatName, status }) => [formatId, formatName, status]),
    [
      ["commander", "Commander", "not-legal"],
      ["legacy", "Legacy", "banned"],
      ["standard", "Standard", "legal"],
      ["vintage", "Vintage", "restricted"],
      ["wildly_new_format", "Wildly New Format", "legal"],
    ],
  );
});
