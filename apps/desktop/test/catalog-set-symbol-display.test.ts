import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogSetSymbolAccessibleName,
  catalogSetSymbolFallback,
  catalogSetSymbolUrl,
} from "../src/features/catalog/catalog-set-symbol-display.ts";

void test("set symbols stay local, encoded, and named without the image", () => {
  assert.equal(
    catalogSetSymbolUrl({ setId: "set / multilingual" }),
    "mooligan-set-symbol://catalog/set%20%2F%20multilingual",
  );
  assert.equal(catalogSetSymbolAccessibleName("eoe"), "EOE set symbol");
  assert.equal(catalogSetSymbolFallback("eoe"), "EOE");
});
