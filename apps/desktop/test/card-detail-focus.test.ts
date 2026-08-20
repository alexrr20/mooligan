import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cardDetailFocusIdentity,
  cardDetailFocusKey,
  shouldMoveCardDetailFocus,
} from "../src/features/cards/card-detail-focus.ts";

void test("card focus changes when a protected result becomes visible", () => {
  assert.equal(cardDetailFocusKey(undefined, false), null);
  assert.equal(cardDetailFocusKey(null, false), "unavailable");
  assert.equal(cardDetailFocusKey({ status: "protected" }, false), "protected");
  assert.equal(cardDetailFocusKey({ status: "visible" }, false), "visible");
  assert.equal(cardDetailFocusKey({ status: "visible" }, true), "error");

  const protectedIdentity = cardDetailFocusIdentity("printing-1", { status: "protected" }, false);
  const visibleIdentity = cardDetailFocusIdentity("printing-1", { status: "visible" }, false);
  assert.equal(shouldMoveCardDetailFocus(null, protectedIdentity), true);
  assert.equal(shouldMoveCardDetailFocus(protectedIdentity, null), false);
  assert.equal(shouldMoveCardDetailFocus(protectedIdentity, visibleIdentity), true);
  assert.equal(shouldMoveCardDetailFocus(visibleIdentity, visibleIdentity), false);
});
