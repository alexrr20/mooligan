import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultPackagedSyncUrl,
  packagedContentSecurityPolicy,
} from "../content-security-policy.ts";

void test("packaged CSP permits only local workers, WebAssembly, and the sync origin", () => {
  const contentSecurityPolicy = packagedContentSecurityPolicy(defaultPackagedSyncUrl);
  const syncOrigin = new URL(defaultPackagedSyncUrl).origin;

  assert.match(contentSecurityPolicy, /script-src 'self' 'wasm-unsafe-eval'/u);
  assert.match(contentSecurityPolicy, /worker-src 'self'/u);
  assert.match(
    contentSecurityPolicy,
    new RegExp(`connect-src 'self' ${escapeRegExp(syncOrigin)}`, "u"),
  );
  assert.doesNotMatch(contentSecurityPolicy, /(?:worker|script)-src[^;]*\*/u);
  assert.doesNotMatch(contentSecurityPolicy, /(?:worker|script)-src[^;]*blob:/u);
  assert.doesNotMatch(contentSecurityPolicy, /script-src[^;]*https:/u);
});

void test("packaged CSP derives its sync origin from MOOLIGAN_SYNC_URL", () => {
  const contentSecurityPolicy = packagedContentSecurityPolicy(
    "wss://sync.staging.example:8443/api/sync?token=secret",
  );

  assert.match(contentSecurityPolicy, /connect-src 'self' wss:\/\/sync\.staging\.example:8443/u);
  assert.doesNotMatch(contentSecurityPolicy, /api\/sync|token|secret/u);
});

void test("packaged CSP rejects non-WebSocket sync URLs", () => {
  assert.throws(
    () => packagedContentSecurityPolicy("https://sync.example/api/sync"),
    /must use the ws: or wss: protocol/u,
  );
});

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
