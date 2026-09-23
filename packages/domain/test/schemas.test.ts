import assert from "node:assert/strict";
import { test } from "node:test";
import { Either, Schema } from "effect";
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  IsoOffsetDateTimeSchema,
  UuidSchema,
  UuidV4Schema,
} from "../src/schema.ts";

import { CatalogCardDetailSchema, normalizeScryfallCardDetail } from "../src/catalog-detail.ts";
import {
  CatalogReleaseSchema,
  ScryfallCardDownloadSchema,
  ScryfallSetDownloadSchema,
  ScryfallSetListSchema,
  type ScryfallCardDownload,
} from "../src/catalog-download.ts";
import {
  CardLanguageSchema,
  CollectionHoldingSchema,
  CollectionListRequestSchema,
} from "../src/collection.ts";

function scryfallCard(overrides: Partial<ScryfallCardDownload> = {}) {
  return Schema.decodeUnknownSync(ScryfallCardDownloadSchema)({
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

void test("date contracts reject invalid calendar dates, times, and offsets", () => {
  assert.equal(Schema.is(IsoDateSchema)("2024-02-29"), true);
  for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-09-23T00:00:00Z"]) {
    assert.equal(Schema.is(IsoDateSchema)(value), false, value);
  }
  for (const value of ["2026-09-23T10:00Z", "2026-09-23T10:00:00.123Z"]) {
    assert.equal(Schema.is(IsoDateTimeSchema)(value), true, value);
  }
  assert.equal(Schema.is(IsoOffsetDateTimeSchema)("2026-09-23T10:00:00+01:00"), true);
  assert.equal(Schema.is(IsoDateTimeSchema)("2026-09-23T10:00:00+01:00"), false);
  for (const value of [
    "2026-02-30T10:00:00Z",
    "2026-09-23T24:00:00Z",
    "2026-09-23T10:00:00+24:00",
    "2026-09-23T10:00:00+01:60",
    "2026-09-23T10:00:00",
  ]) {
    assert.equal(Schema.is(IsoOffsetDateTimeSchema)(value), false, value);
  }
});

void test("UUID contracts validate versions and variants and keep binding secrets at version 4", () => {
  const v4 = "0116d9f3-b986-4a0c-a6b1-d18da840576b";
  const v7 = "0198f089-41f2-7000-8000-000000000001";
  assert.equal(Schema.is(UuidSchema)(v4), true);
  assert.equal(Schema.is(UuidSchema)(v7), true);
  assert.equal(Schema.is(UuidV4Schema)(v4), true);
  assert.equal(Schema.is(UuidV4Schema)(v7), false);
  for (const value of [
    "0116d9f3-b986-0a0c-a6b1-d18da840576b",
    "0116d9f3-b986-4a0c-06b1-d18da840576b",
  ]) {
    assert.equal(Schema.is(UuidSchema)(value), false, value);
  }
});

void test("collection contracts accept known physical properties and stay strict", () => {
  assert.equal(Either.isRight(Schema.decodeUnknownEither(CardLanguageSchema)("ph")), true);
  assert.equal(Either.isRight(Schema.decodeUnknownEither(CardLanguageSchema)("xx")), false);
  assert.equal(
    Either.isRight(Schema.decodeUnknownEither(CollectionListRequestSchema)({ limit: 101 })),
    false,
  );
  assert.equal(
    Either.isRight(Schema.decodeUnknownEither(CollectionListRequestSchema)({ unknown: true })),
    false,
  );
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(CollectionHoldingSchema)({
        label: "Protected preview",
        quantity: 4,
        routePrintingId: "printing-1",
        status: "protected",
      }),
    ),
    true,
  );
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

  assert.deepEqual(Schema.decodeUnknownSync(ScryfallSetDownloadSchema)(set), set);
  assert.deepEqual(
    Schema.decodeUnknownSync(ScryfallSetListSchema)({
      data: [set],
      has_more: false,
      object: "list",
    }),
    {
      data: [set],
      has_more: false,
      object: "list",
    },
  );
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(ScryfallSetListSchema)({
        data: [set],
        has_more: true,
        object: "list",
      }),
    ),
    false,
  );
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(ScryfallSetDownloadSchema)({
        ...set,
        icon_svg_uri: "http://example.com/tst.svg",
      }),
    ),
    false,
  );
});

void test("catalog releases require an HTTPS archive and timestamp", () => {
  const release = {
    compressedSize: 1024,
    downloadUrl: "https://data.scryfall.io/default-cards/test.jsonl.gz",
    updatedAt: "2026-07-31T09:11:02.266+00:00",
  };

  assert.deepEqual(Schema.decodeUnknownSync(CatalogReleaseSchema)(release), release);
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(CatalogReleaseSchema)({
        ...release,
        downloadUrl: "http://example.com/cards.gz",
      }),
    ),
    false,
  );
});

void test("Scryfall cards reject unsupported rarities during ingestion", () => {
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(ScryfallCardDownloadSchema)({
        ...scryfallCard(),
        rarity: "unknown",
      }),
    ),
    false,
  );
});

void test("produced mana accepts Scryfall extras but normalizes only supported mana types", () => {
  const selected = Schema.decodeUnknownSync(ScryfallCardDownloadSchema)({
    ...scryfallCard(),
    produced_mana: ["2", "W", "U", "B", "R", "G", "C", "T"],
  });
  assert.deepEqual(normalizeScryfallCardDetail(selected).card.producedMana, [
    "W",
    "U",
    "B",
    "R",
    "G",
    "C",
  ]);
  assert.deepEqual(
    normalizeScryfallCardDetail({ ...selected, produced_mana: ["2", "T"] }).card.producedMana,
    [],
  );
  assert.deepEqual(normalizeScryfallCardDetail(scryfallCard()).card.producedMana, []);
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(ScryfallCardDownloadSchema)({
        ...selected,
        produced_mana: ["invalid"],
      }),
    ),
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
      art_crop: "https://cards.scryfall.io/art_crop/front/bolt.jpg",
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
    { faceIndex: 0, printingId: "printing-bolt", size: "art_crop" },
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
            art_crop: "https://cards.scryfall.io/art_crop/front/delver.jpg",
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
            art_crop: "https://cards.scryfall.io/art_crop/back/delver.jpg",
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
      { faceIndex: 0, size: "art_crop" },
      { faceIndex: 1, size: "normal" },
      { faceIndex: 1, size: "small" },
      { faceIndex: 1, size: "art_crop" },
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
  assert.equal(Either.isRight(Schema.decodeUnknownEither(CatalogCardDetailSchema)(detail)), true);
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(CatalogCardDetailSchema)({
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
      }),
    ),
    false,
  );
});

void test("Scryfall legalities map boundary spelling and preserve unknown formats", () => {
  assert.throws(() => scryfallCard({ legalities: { "": "legal" } }));
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
