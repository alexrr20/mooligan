import assert from "node:assert/strict";
import { test } from "node:test";

import { Either, Schema } from "effect";

import { CollectionLotSchema, type CollectionLot } from "../src/collection-contract.ts";
import { DeckEntrySchema, DeckMetadataSchema } from "../src/deck-contract.ts";
import { IdentifierSchema, TimestampSchema } from "../src/primitives.ts";
import { TagTemplateSchema } from "../src/tag-contract.ts";
import { CollectionProjectionSnapshotSchema, DeckCostRequestSchema } from "../src/transport.ts";

const entry = {
  finish: "foil",
  id: "entry-1",
  printingId: "printing-1",
  quantity: 1,
  section: "mainboard",
} as const;

const lot: CollectionLot = {
  acquiredAt: null,
  condition: "near-mint",
  finish: "glossy",
  id: "lot-1",
  language: "ph",
  locationId: null,
  notes: null,
  printingId: "printing-1",
  quantity: 2,
  unitCost: { amountMinor: 150, currency: "EUR" },
};

void test("deck entries require an exact printing, finish, and positive quantity", () => {
  const isEntry = Schema.is(DeckEntrySchema);
  assert.equal(isEntry(entry), true);
  assert.equal(isEntry({ ...entry, printingId: "" }), false);
  assert.equal(isEntry({ ...entry, quantity: 0 }), false);
  assert.equal(isEntry({ ...entry, quantity: 1_000_001 }), false);
});

void test("persisted text, identifiers, and timestamps accept only canonical values", () => {
  const isMetadata = Schema.is(DeckMetadataSchema);
  const metadata = { archived: false, formatId: "modern", name: "Burn", notes: "", tags: ["Red"] };
  assert.equal(isMetadata(metadata), true);
  assert.equal(isMetadata({ ...metadata, name: " Burn" }), false);
  assert.equal(isMetadata({ ...metadata, tags: ["Red "] }), false);
  assert.equal(Schema.is(IdentifierSchema)(" printing-1"), false);
  assert.equal(Schema.is(TimestampSchema)("2026-09-23T10:00:00.000Z"), true);
  assert.equal(Schema.is(TimestampSchema)("2026-09-23T10:00:00+00:00"), false);
  assert.equal(
    Schema.is(TagTemplateSchema)({
      id: "template-1",
      name: "Commander",
      categories: [
        { name: "Ramp", color: "sage" },
        { name: "ramp", color: "blue" },
      ],
    }),
    false,
  );
});

void test("transport contracts validate persisted models with their Effect definitions", () => {
  const snapshot = {
    lots: [lot],
    revision: 1,
    sessionId: "6f1c3f4e-2b1a-4c3d-8e9f-0a1b2c3d4e5f",
    workspaceId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  };
  const decodeSnapshot = Schema.decodeUnknownEither(CollectionProjectionSnapshotSchema);
  assert.equal(Either.isRight(decodeSnapshot(snapshot)), true);
  assert.equal(Schema.is(CollectionLotSchema)(lot), true);
  assert.equal(
    Either.isRight(decodeSnapshot({ ...snapshot, lots: [{ ...lot, notes: undefined }] })),
    false,
  );
  assert.equal(
    Either.isRight(decodeSnapshot({ ...snapshot, lots: [{ ...lot, extra: true }] })),
    false,
  );

  const request = { currency: "EUR", entries: [entry], providers: ["cardmarket"], rates: null };
  assert.equal(Either.isRight(Schema.decodeUnknownEither(DeckCostRequestSchema)(request)), true);
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(DeckCostRequestSchema)({
        ...request,
        entries: [{ ...entry, quantity: -1 }],
      }),
    ),
    false,
  );
  assert.equal(
    Either.isRight(
      Schema.decodeUnknownEither(DeckCostRequestSchema)({ ...request, providers: ["ebay"] }),
    ),
    false,
  );
});
