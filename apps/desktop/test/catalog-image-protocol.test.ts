import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCatalogImageUrl } from "../electron/catalog/image-protocol.ts";
import { catalogImageUrl } from "../src/features/catalog/catalog-image.ts";

void test("renderer image descriptors round-trip without exposing a remote URL", () => {
  const descriptor = {
    faceIndex: 1,
    printingId: "printing / multilingual",
    size: "normal",
  } as const;
  const url = catalogImageUrl(descriptor);

  assert.equal(url.includes("scryfall"), false);
  assert.deepEqual(parseCatalogImageUrl(url), descriptor);
});

void test("compact thumbnail descriptors round-trip through the image protocol", () => {
  const descriptor = {
    faceIndex: 0,
    printingId: "printing-1",
    size: "thumb",
  } as const;

  assert.deepEqual(parseCatalogImageUrl(catalogImageUrl(descriptor)), descriptor);
});

void test("grid image descriptors round-trip through the image protocol", () => {
  const descriptor = {
    faceIndex: 0,
    printingId: "printing-1",
    size: "grid",
  } as const;

  assert.deepEqual(parseCatalogImageUrl(catalogImageUrl(descriptor)), descriptor);
});

void test("catalog image URLs reject untrusted hosts, faces, sizes, and shapes", () => {
  assert.equal(parseCatalogImageUrl("https://catalog/printing-1/0/small"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://attacker/printing-1/0/small"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://catalog/printing-1/-1/small"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://catalog/printing-1/0/large"), null);
  assert.equal(parseCatalogImageUrl("mooligan-image://catalog/printing-1/0/small/extra"), null);
});
