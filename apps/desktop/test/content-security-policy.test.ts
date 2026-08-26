import assert from "node:assert/strict";
import { test } from "node:test";

import {
  productionContentSecurityPolicy,
  productionServiceOrigin,
} from "../content-security-policy.ts";

void test("production CSP permits only local workers, WebAssembly, and the sync origin", () => {
  assert.match(productionContentSecurityPolicy, /script-src 'self' 'wasm-unsafe-eval'/u);
  assert.match(productionContentSecurityPolicy, /worker-src 'self'/u);
  assert.match(
    productionContentSecurityPolicy,
    new RegExp(`connect-src 'self' ${escapeRegExp(productionServiceOrigin)}`, "u"),
  );
  assert.doesNotMatch(productionContentSecurityPolicy, /(?:worker|script)-src[^;]*\*/u);
  assert.doesNotMatch(productionContentSecurityPolicy, /(?:worker|script)-src[^;]*blob:/u);
  assert.doesNotMatch(productionContentSecurityPolicy, /script-src[^;]*https:/u);
});

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
