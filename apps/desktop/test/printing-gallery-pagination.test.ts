import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getInitialGalleryVisibleCount,
  getNextGalleryVisibleCount,
  PRINTING_GALLERY_BATCH_SIZE,
} from "../src/features/cards/printing-gallery-pagination.ts";

void test("the initial gallery batch always contains the selected printing", () => {
  assert.equal(PRINTING_GALLERY_BATCH_SIZE, 24);
  assert.equal(getInitialGalleryVisibleCount(0, 0), 0);
  assert.equal(getInitialGalleryVisibleCount(12, 11), 12);
  assert.equal(getInitialGalleryVisibleCount(100, 0), 24);
  assert.equal(getInitialGalleryVisibleCount(100, 23), 24);
  assert.equal(getInitialGalleryVisibleCount(100, 24), 48);
  assert.equal(getInitialGalleryVisibleCount(100, 47), 48);
  assert.equal(getInitialGalleryVisibleCount(100, 48), 72);
  assert.equal(getInitialGalleryVisibleCount(100, 99), 100);
});

void test("missing selections use one batch and show-more reveals 24 at a time", () => {
  assert.equal(getInitialGalleryVisibleCount(100, -1), 24);
  assert.equal(getInitialGalleryVisibleCount(100, 100), 24);
  assert.equal(getNextGalleryVisibleCount(100, 24), 48);
  assert.equal(getNextGalleryVisibleCount(100, 96), 100);
  assert.equal(getNextGalleryVisibleCount(10, 10), 10);
});
