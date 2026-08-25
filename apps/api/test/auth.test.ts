import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { env, exports } from "cloudflare:workers";
import { makeSignature } from "better-auth/crypto";
import { version as uuidVersion } from "uuid";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports -- Cloudflare's pool must share Vitest's runner instance.
import { test } from "vitest";

import { createAuth } from "../src/auth.ts";

test("the Better Auth session endpoint accepts a missing session", async () => {
  const sessionResponse = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/api/auth/get-session"),
  );

  assert.equal(sessionResponse.status, 200);
  assert.equal(await sessionResponse.json(), null);
});

test("the Electron server plugin is mounted under the auth handler", async () => {
  const response = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/api/auth/electron/token", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 400);
});

test("the Electron plugin transfers a browser session through PKCE exactly once", async () => {
  const context = await createAuth(env).$context;
  const user = await context.internalAdapter.createUser({
    email: "electron-transfer@example.com",
    emailVerified: true,
    name: "Electron Transfer",
  });
  const browserSession = await context.internalAdapter.createSession(user.id);
  const signature = await makeSignature(browserSession.token, env.BETTER_AUTH_SECRET);
  const verifier = "v".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = "s".repeat(43);
  const transferHeaders = new Headers({
    "cf-connecting-ip": "127.0.0.1",
    "content-type": "application/json",
    cookie: `better-auth.session_token=${browserSession.token}.${signature}`,
    origin: "http://127.0.0.1:3000",
  });
  const transferQuery = new URLSearchParams({
    client_id: "electron",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  const transfer = await exports.default.fetch(
    new Request(`http://127.0.0.1:3000/api/auth/electron/transfer-user?${transferQuery}`, {
      body: "{}",
      headers: transferHeaders,
      method: "POST",
    }),
  );
  const transferred = await transfer.json<{ electron_authorization_code: string }>();

  assert.equal(transfer.status, 200);
  assert.match(transferred.electron_authorization_code, /^[A-Za-z0-9]{32}$/);

  const exchangeBody = JSON.stringify({
    code_verifier: verifier,
    state,
    token: transferred.electron_authorization_code,
  });
  const exchangeHeaders = new Headers({
    "cf-connecting-ip": "127.0.0.1",
    "content-type": "application/json",
    "electron-origin": "com.mooligan.app:/",
    origin: "com.mooligan.app:/",
    "x-skip-oauth-proxy": "true",
  });
  const exchange = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/api/auth/electron/token", {
      body: exchangeBody,
      headers: exchangeHeaders,
      method: "POST",
    }),
  );
  const exchanged = await exchange.json<{ user: { id: string } }>();
  const setCookies: string[] = exchange.headers.getSetCookie();
  const sessionCookie = setCookies.find((cookie) =>
    cookie.startsWith("better-auth.session_token="),
  );

  assert.equal(exchange.status, 200);
  assert.equal(exchanged.user.id, user.id);
  assert.ok(sessionCookie);

  const sessionResponse = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/api/auth/get-session", {
      headers: {
        "cf-connecting-ip": "127.0.0.1",
        cookie: sessionCookie.split(";", 1)[0] ?? "",
        "electron-origin": "com.mooligan.app:/",
        origin: "com.mooligan.app:/",
        "x-skip-oauth-proxy": "true",
      },
    }),
  );
  const repeatedExchange = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/api/auth/electron/token", {
      body: exchangeBody,
      headers: exchangeHeaders,
      method: "POST",
    }),
  );

  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json<{ user: { id: string } }>()).user.id, user.id);
  assert.equal(repeatedExchange.status, 404);
});

test("an authenticated session resolves the Better Auth user", async () => {
  const context = await createAuth(env).$context;
  const user = await context.internalAdapter.createUser({
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
  });
  const session = await context.internalAdapter.createSession(user.id);

  assert.equal(uuidVersion(user.id), 7);

  const signature = await makeSignature(session.token, env.BETTER_AUTH_SECRET);
  const headers = new Headers({
    cookie: `better-auth.session_token=${session.token}.${signature}`,
  });
  const sessionResponse = await exports.default.fetch(
    new Request("http://127.0.0.1:3000/api/auth/get-session", { headers }),
  );

  assert.equal(sessionResponse.status, 200);
  const sessionBody = await sessionResponse.json<{ user: { email: string; id: string } }>();

  assert.equal(sessionBody.user.id, user.id);
  assert.equal(sessionBody.user.email, "test@example.com");
});
