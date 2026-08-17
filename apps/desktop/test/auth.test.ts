import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as z from "zod";
import type { JSONType } from "zod";

import { type AsyncSafeStorage, ProtectedAuthStateSchema } from "../electron/auth/storage.ts";
import {
  AUTH_PROTOCOL,
  AuthInputError,
  DesktopAuth,
  resolveAuthOrigin,
} from "../electron/auth/service.ts";

const user = {
  createdAt: "private server field",
  email: "molly@example.com",
  emailVerified: true,
  id: "0198f089-41f2-7000-8000-000000000001",
  image: "https://images.example.com/molly.png",
  name: "Molly",
  sessionToken: "must-not-reach-the-renderer",
};
const TokenRequestSchema = z.object({
  code_verifier: z.string(),
  state: z.string(),
  token: z.string(),
});
type TokenRequest = z.infer<typeof TokenRequestSchema>;

void test("desktop sign-in persists PKCE first and keeps session material out of public state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-auth-"));
  const path = join(directory, "auth-state");
  const safeStorage = new FakeSafeStorage();
  let now = 1_000_000;
  let openedUrl: URL | undefined;
  let tokenCalls = 0;
  let tokenRequest: TokenRequest | undefined;
  let syncCookie = "";
  let syncUnauthorized = false;
  let signOutFails = false;
  let hangSessionRequest = false;

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    const headers = new Headers(init?.headers);

    if (url.pathname === "/api/auth/electron/token") {
      assert.equal(headers.get("origin"), `${AUTH_PROTOCOL}:/`);
      assert.equal(headers.get("electron-origin"), `${AUTH_PROTOCOL}:/`);
      tokenCalls += 1;
      const body = z.string().safeParse(init?.body);
      if (!body.success) {
        throw new Error("missing token request body");
      }
      tokenRequest = TokenRequestSchema.parse(JSON.parse(body.data));
      return jsonResponse({ token: "raw-session-token", user }, [
        "better-auth.session_token=session-one; Path=/; HttpOnly; Max-Age=3600",
        "not-better-auth.session_token=ignored; Path=/; Max-Age=3600",
      ]);
    }

    if (url.pathname === "/sync/workspace") {
      if (syncUnauthorized) {
        return new Response(null, { status: 401 });
      }
      syncCookie = headers.get("cookie") ?? "";
      assert.equal(headers.get("authorization"), null);
      assert.equal(headers.get("origin"), null);
      assert.equal(headers.get("electron-origin"), `${AUTH_PROTOCOL}:/`);
      assert.equal(init?.credentials, "omit");
      return jsonResponse({ ok: true }, [
        "better-auth.session_token=session-two; Path=/; HttpOnly; Max-Age=3600",
      ]);
    }

    if (url.pathname === "/api/auth/sign-out") {
      if (signOutFails) {
        return new Response(null, { status: 503 });
      }
      return jsonResponse({ success: true }, [
        "better-auth.session_token=; Path=/; HttpOnly; Max-Age=0",
      ]);
    }

    if (url.pathname === "/api/auth/get-session") {
      if (hangSessionRequest) {
        const signal = init?.signal;
        assert.ok(signal);
        return new Promise<Response>((_resolve, reject) => {
          const watchdog = setTimeout(
            () => reject(new Error("The request timeout did not abort the mocked fetch.")),
            1_000,
          );
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(watchdog);
              reject(signal.reason);
            },
            { once: true },
          );
        });
      }
      return jsonResponse({ session: { token: "server-only" }, user });
    }

    throw new Error("unexpected request");
  };

  try {
    const auth = new DesktopAuth({
      fetch,
      filePath: path,
      now: () => now,
      openExternal: async (url) => {
        const persisted = await safeStorage.readState(path);
        assert.ok(persisted.pendingAuth, "PKCE must reach protected storage before browser launch");
        openedUrl = new URL(url);
      },
      requestTimeoutMs: 10,
      safeStorage,
    });

    assert.deepEqual(await auth.initialize(), {
      pendingAuth: false,
      status: "signed-out",
      user: null,
    });
    assert.equal((await auth.beginSignIn()).pendingAuth, true);
    assert.ok(openedUrl);
    assert.equal(openedUrl.origin, "http://127.0.0.1:3000");
    assert.equal(openedUrl.searchParams.get("client_id"), "electron");
    assert.equal(openedUrl.searchParams.get("code_challenge_method"), "S256");
    assert.match(openedUrl.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]{43}$/);
    assert.match(openedUrl.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);

    const state = openedUrl.searchParams.get("state") ?? "";
    const identifier = "A".repeat(32);
    const wrongState = "B".repeat(43);

    await assert.rejects(auth.handleCallback(callbackUrl(identifier, wrongState)), AuthInputError);
    await assert.rejects(
      auth.handleCallback(
        `${AUTH_PROTOCOL}://auth/callback?token=${encodeToken(identifier, state)}`,
      ),
      AuthInputError,
    );
    await assert.rejects(
      auth.handleCallback(
        `${AUTH_PROTOCOL}://auth/callback#token=${encodeToken(identifier, state).replace(/=+$/, "")}`,
      ),
      AuthInputError,
    );
    assert.equal(tokenCalls, 0);

    const callback = callbackUrl(identifier, state);
    const results = await Promise.allSettled([
      auth.handleCallback(callback),
      auth.handleCallback(callback),
    ]);

    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "rejected");
    assert.equal(tokenCalls, 1);
    assert.equal(tokenRequest?.token, identifier);
    assert.equal(tokenRequest?.state, state);
    assert.match(String(tokenRequest?.code_verifier), /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(auth.snapshot(), {
      pendingAuth: false,
      status: "signed-in",
      user: {
        email: "molly@example.com",
        id: "0198f089-41f2-7000-8000-000000000001",
        image: "https://images.example.com/molly.png",
        name: "Molly",
      },
    });

    hangSessionRequest = true;
    assert.equal((await auth.refresh()).status, "sync-paused");
    hangSessionRequest = false;
    assert.equal((await auth.refresh()).status, "signed-in");

    syncUnauthorized = true;
    assert.equal((await auth.request("/sync/workspace")).status, 401);
    assert.equal(auth.snapshot().status, "sync-paused");
    syncUnauthorized = false;
    assert.equal((await auth.refresh()).status, "signed-in");

    const protectedState = await safeStorage.readState(path);
    assert.deepEqual(Object.keys(protectedState.cookies), ["better-auth.session_token"]);
    assert.equal(protectedState.cookies["better-auth.session_token"]?.value, "session-one");
    assert.equal(protectedState.pendingAuth, null);

    const response = await auth.request("/sync/workspace", {
      headers: {
        authorization: "renderer-controlled bearer token",
        cookie: "renderer-controlled-cookie=value",
      },
    });
    assert.equal(syncCookie, "better-auth.session_token=session-one");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(
      (await safeStorage.readState(path)).cookies["better-auth.session_token"]?.value,
      "session-two",
    );

    signOutFails = true;
    await assert.rejects(auth.signOut());
    assert.equal(auth.snapshot().status, "sync-paused");
    assert.equal(
      (await safeStorage.readState(path)).cookies["better-auth.session_token"]?.value,
      "session-two",
    );
    signOutFails = false;
    assert.deepEqual(await auth.signOut(), {
      pendingAuth: false,
      status: "signed-out",
      user: null,
    });
    assert.deepEqual((await safeStorage.readState(path)).cookies, {});

    await auth.beginSignIn();
    const relaunched = new DesktopAuth({
      fetch,
      filePath: path,
      now: () => now,
      openExternal: async () => undefined,
      safeStorage,
    });

    assert.deepEqual(await relaunched.initialize(), {
      pendingAuth: true,
      status: "signed-out",
      user: null,
    });
    const pendingState = (await safeStorage.readState(path)).pendingAuth?.state ?? "";
    assert.equal(
      (await relaunched.handleCallback(callbackUrl("C".repeat(32), pendingState))).status,
      "signed-in",
    );
    assert.equal(tokenCalls, 2);

    let online = false;
    const offlineRelaunch = new DesktopAuth({
      fetch: (input, init) => {
        if (!online) {
          return Promise.reject(new Error("offline"));
        }
        return fetch(input, init);
      },
      filePath: path,
      now: () => now,
      openExternal: async () => undefined,
      safeStorage,
    });
    assert.deepEqual(await offlineRelaunch.initialize(), {
      pendingAuth: false,
      status: "sync-paused",
      user: null,
    });
    online = true;
    assert.equal((await offlineRelaunch.refresh()).status, "signed-in");

    now += 301_000;
    await relaunched.signOut();
    await relaunched.beginSignIn();
    const expiredState = (await safeStorage.readState(path)).pendingAuth?.state ?? "";
    now += 301_000;
    const expired = new DesktopAuth({
      fetch,
      filePath: path,
      now: () => now,
      openExternal: async () => undefined,
      safeStorage,
    });
    assert.equal((await expired.initialize()).pendingAuth, false);
    await assert.rejects(
      expired.handleCallback(callbackUrl("D".repeat(32), expiredState)),
      AuthInputError,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("oversized Better Auth cookies are rejected without replacing protected state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-auth-cookie-limit-"));
  const path = join(directory, "auth-state");
  const safeStorage = new FakeSafeStorage();
  let signInUrl: URL | undefined;
  const auth = new DesktopAuth({
    fetch: async () =>
      jsonResponse({ token: "discarded", user }, [
        `better-auth.session_token=${"x".repeat(80)}; Path=/; Max-Age=3600`,
      ]),
    filePath: path,
    maxCookieBytes: 1_024,
    maxCookieJarBytes: 64,
    openExternal: async (url) => {
      signInUrl = new URL(url);
    },
    safeStorage,
  });

  try {
    await auth.initialize();
    await auth.beginSignIn();
    assert.ok(signInUrl);
    const state = signInUrl.searchParams.get("state") ?? "";

    await assert.rejects(auth.handleCallback(callbackUrl("Z".repeat(32), state)));
    const protectedState = await safeStorage.readState(path);
    assert.deepEqual(protectedState.cookies, {});
    assert.ok(protectedState.pendingAuth);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("auth origin and protected-storage failures remain narrow and local-first", async () => {
  assert.equal(resolveAuthOrigin(), "http://127.0.0.1:3000");
  assert.equal(resolveAuthOrigin("https://auth.mooligan.example"), "https://auth.mooligan.example");
  assert.throws(() => resolveAuthOrigin("http://auth.mooligan.example"), AuthInputError);
  assert.throws(() => resolveAuthOrigin("https://auth.mooligan.example/sign-in"), AuthInputError);

  const auth = new DesktopAuth({
    fetch: async () => {
      throw new Error("must not fetch");
    },
    filePath: "/unused/auth-state",
    openExternal: async () => {
      throw new Error("must not open");
    },
    safeStorage: new FakeSafeStorage(false),
  });

  assert.deepEqual(await auth.initialize(), {
    pendingAuth: false,
    status: "protected-storage-unavailable",
    user: null,
  });
  await assert.rejects(auth.beginSignIn());
});

class FakeSafeStorage implements AsyncSafeStorage {
  readonly #available: boolean;

  constructor(available = true) {
    this.#available = available;
  }

  async isAsyncEncryptionAvailable() {
    return this.#available;
  }

  async encryptStringAsync(plainText: string) {
    return Buffer.from(`ciphertext:${Buffer.from(plainText).toString("base64")}`);
  }

  async decryptStringAsync(encrypted: Buffer) {
    const value = encrypted.toString();
    if (!value.startsWith("ciphertext:")) {
      throw new Error("invalid ciphertext");
    }
    return {
      result: Buffer.from(value.slice("ciphertext:".length), "base64").toString(),
      shouldReEncrypt: false,
    };
  }

  async readState(path: string) {
    const decrypted = await this.decryptStringAsync(await readFile(path));
    return ProtectedAuthStateSchema.parse(JSON.parse(decrypted.result));
  }
}

function callbackUrl(identifier: string, state: string) {
  return `${AUTH_PROTOCOL}://auth/callback#token=${encodeURIComponent(encodeToken(identifier, state))}`;
}

function encodeToken(identifier: string, state: string) {
  const unpadded = Buffer.from(JSON.stringify({ identifier, state })).toString("base64url");
  return unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "=");
}

function jsonResponse(data: JSONType, cookies: string[] = []) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify(data), { headers });
}

function requestUrl(input: string | URL | Request) {
  return new URL(input instanceof Request ? input.url : String(input));
}
