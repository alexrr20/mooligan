import { createHash, randomBytes } from "node:crypto";

import {
  cookieNameRegex,
  parseSetCookieHeader,
  splitSetCookieHeader,
  stripSecureCookiePrefix,
} from "better-auth/cookies";

import {
  type AsyncSafeStorage,
  type AuthStateStorage,
  EncryptedAuthStorage,
  type PendingAuth,
  type ProtectedAuthState,
  ProtectedStorageError,
  type StoredAuthCookie,
} from "./auth-storage.ts";

export const AUTH_PROTOCOL = "com.mooligan.app";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AUTH_ORIGIN = "http://127.0.0.1:3000";
export const AUTH_ORIGIN_ENV = "MOOLIGAN_AUTH_ORIGIN";

const AUTH_FLOW_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_COOKIE_PREFIX = "better-auth";
const DEFAULT_MAX_COOKIE_BYTES = 8 * 1_024;
const DEFAULT_MAX_COOKIE_JAR_BYTES = 64 * 1_024;
const DEFAULT_MAX_COOKIES = 64;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const SAFE_COOKIE_VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const PKCE_VALUE = /^[A-Za-z0-9_-]{43}$/;
const RAW_AUTHORIZATION_CODE = /^[A-Za-z0-9]{32}$/;
const ENCODED_AUTHORIZATION_CODE = /^[A-Za-z0-9_-]+={0,2}$/;

export type AuthStatus =
  | "signed-out"
  | "signed-in"
  | "sync-paused"
  | "protected-storage-unavailable";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  pendingAuth: boolean;
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface DesktopAuthOptions {
  filePath: string;
  safeStorage: AsyncSafeStorage;
  openExternal(url: string): Promise<unknown>;
  origin?: string;
  fetch?: Fetch;
  now?: () => number;
  cookiePrefix?: string;
  maxCookieBytes?: number;
  maxCookieJarBytes?: number;
  maxCookies?: number;
  requestTimeoutMs?: number;
}

export class AuthInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthInputError";
  }
}

export class AuthRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthRequestError";
  }
}

export class DesktopAuth {
  readonly #origin: string;
  readonly #storage: AuthStateStorage;
  readonly #openExternal: (url: string) => Promise<unknown>;
  readonly #fetch: Fetch;
  readonly #now: () => number;
  readonly #cookiePrefix: string;
  readonly #maxCookieBytes: number;
  readonly #maxCookieJarBytes: number;
  readonly #maxCookies: number;
  readonly #requestTimeoutMs: number;
  #state: ProtectedAuthState | null = null;
  #current: AuthSnapshot = { pendingAuth: false, status: "signed-out", user: null };
  #operations = Promise.resolve();

  constructor(options: DesktopAuthOptions) {
    this.#origin = resolveAuthOrigin(options.origin);
    this.#storage = new EncryptedAuthStorage(options.filePath, options.safeStorage);
    this.#openExternal = (url) => options.openExternal(url);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#now = options.now ?? Date.now;
    this.#cookiePrefix = validateCookiePrefix(options.cookiePrefix ?? DEFAULT_COOKIE_PREFIX);
    this.#maxCookieBytes = positiveInteger(
      options.maxCookieBytes ?? DEFAULT_MAX_COOKIE_BYTES,
      "cookie size",
    );
    this.#maxCookieJarBytes = positiveInteger(
      options.maxCookieJarBytes ?? DEFAULT_MAX_COOKIE_JAR_BYTES,
      "cookie jar size",
    );
    this.#maxCookies = positiveInteger(options.maxCookies ?? DEFAULT_MAX_COOKIES, "cookie count");
    this.#requestTimeoutMs = positiveInteger(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      "request timeout",
    );
  }

  initialize(): Promise<AuthSnapshot> {
    return this.#serialize(async () => {
      try {
        await this.#load();
        return await this.#refresh();
      } catch (error) {
        if (error instanceof ProtectedStorageError) {
          return this.#setSnapshot("protected-storage-unavailable", null);
        }
        throw error;
      }
    });
  }

  beginSignIn(): Promise<AuthSnapshot> {
    return this.#serialize(async () => {
      const state = await this.#requireState();
      const pendingAuth = createPendingAuth(this.#now());
      const challenge = createHash("sha256").update(pendingAuth.verifier).digest("base64url");

      state.pendingAuth = pendingAuth;
      await this.#storage.save(state);
      this.#setSnapshot(this.#current.status, this.#current.user);

      const url = new URL("/", this.#origin);
      url.searchParams.set("client_id", "electron");
      url.searchParams.set("state", pendingAuth.state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      await this.#openExternal(url.href);

      return this.snapshot();
    });
  }

  handleCallback(url: unknown): Promise<AuthSnapshot> {
    return this.#serialize(async () => {
      const token = parseDeepLink(url);
      return await this.#exchange(token);
    });
  }

  completeManualCode(code: unknown): Promise<AuthSnapshot> {
    return this.#serialize(async () => {
      const { pendingAuth } = await this.#requirePendingState();
      if (typeof code !== "string") {
        throw new AuthInputError("The authorization code is invalid.");
      }
      const value = code.trim();

      if (RAW_AUTHORIZATION_CODE.test(value)) {
        return await this.#exchange({ identifier: value, state: pendingAuth.state });
      }

      return await this.#exchange(parseEncodedAuthorizationCode(value));
    });
  }

  refresh(): Promise<AuthSnapshot> {
    return this.#serialize(async () => {
      await this.#requireState();
      return await this.#refresh();
    });
  }

  signOut(): Promise<AuthSnapshot> {
    return this.#serialize(async () => {
      const state = await this.#requireState();
      const cookies = { ...state.cookies };
      let failure: unknown;

      try {
        const response = await this.#send("/api/auth/sign-out", {
          body: "{}",
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok && response.status !== 401 && response.status !== 403) {
          failure = new AuthRequestError(
            "Sign-out was not accepted by the authentication service.",
          );
        }
      } catch (error) {
        failure = error;
      }

      if (failure) {
        state.cookies = cookies;
        await this.#storage.save(state);
        this.#setSnapshot("sync-paused", this.#current.user);
        throw failure;
      }

      state.cookies = {};
      state.pendingAuth = null;
      await this.#storage.save(state);
      const snapshot = this.#setSnapshot("signed-out", null);
      return snapshot;
    });
  }

  snapshot(): AuthSnapshot {
    return {
      pendingAuth: this.#current.pendingAuth,
      status: this.#current.status,
      user: this.#current.user ? { ...this.#current.user } : null,
    };
  }

  request(path: `/sync/${string}`, init: RequestInit = {}): Promise<Response> {
    return this.#serialize(async () => {
      await this.#requireState();
      const url = new URL(path, this.#origin);

      if (
        url.origin !== this.#origin ||
        !url.pathname.startsWith("/sync/") ||
        url.hash ||
        path.startsWith("//")
      ) {
        throw new AuthInputError("Only same-origin sync requests are allowed.");
      }

      const response = await this.#send(`${url.pathname}${url.search}`, init);
      if (response.status === 401 || response.status === 403) {
        this.#setSnapshot("sync-paused", this.#current.user);
      }
      const headers = new Headers(response.headers);
      headers.delete("set-cookie");

      return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    });
  }

  async #load() {
    if (this.#state) {
      return this.#state;
    }

    const state = await this.#storage.load();
    let changed = false;

    if (state.pendingAuth && !isValidPendingAuth(state.pendingAuth, this.#now())) {
      state.pendingAuth = null;
      changed = true;
    }

    let cookies: Record<string, StoredAuthCookie>;
    try {
      cookies = this.#validatedCookies(state.cookies);
    } catch (error) {
      if (!(error instanceof AuthRequestError)) {
        throw error;
      }
      cookies = {};
    }
    if (Object.keys(cookies).length !== Object.keys(state.cookies).length) {
      state.cookies = cookies;
      changed = true;
    }

    if (changed) {
      await this.#storage.save(state);
    }

    this.#state = state;
    this.#setSnapshot("signed-out", null);
    return state;
  }

  async #requireState() {
    try {
      return await this.#load();
    } catch (error) {
      if (error instanceof ProtectedStorageError) {
        this.#setSnapshot("protected-storage-unavailable", null);
      }
      throw error;
    }
  }

  async #requirePendingState() {
    const state = await this.#requireState();

    if (!state.pendingAuth || !isValidPendingAuth(state.pendingAuth, this.#now())) {
      if (state.pendingAuth) {
        state.pendingAuth = null;
        await this.#storage.save(state);
        this.#setSnapshot(this.#current.status, this.#current.user);
      }
      throw new AuthInputError("There is no active sign-in request.");
    }

    return { pendingAuth: state.pendingAuth, state };
  }

  async #exchange(token: RedirectToken) {
    const { pendingAuth, state } = await this.#requirePendingState();

    if (token.state !== pendingAuth.state) {
      throw new AuthInputError("The sign-in response does not match the active request.");
    }

    const response = await this.#send(
      "/api/auth/electron/token",
      {
        body: JSON.stringify({
          code_verifier: pendingAuth.verifier,
          state: pendingAuth.state,
          token: token.identifier,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      false,
    );

    if (!response.ok) {
      throw new AuthRequestError("The authentication service rejected the sign-in response.");
    }

    const data = await readJson(response);
    const user = sanitizeUser(isRecord(data) ? data.user : null);
    const next = this.#cookiesFromResponse(response, state.cookies);

    if (Object.keys(next).length === 0) {
      throw new AuthRequestError("The authentication service did not return a session.");
    }

    state.cookies = next;
    state.pendingAuth = null;
    await this.#storage.save(state);
    return this.#setSnapshot("signed-in", user);
  }

  async #refresh() {
    const state = await this.#requireState();

    if (Object.keys(state.cookies).length === 0) {
      return this.#setSnapshot("signed-out", null);
    }

    try {
      const response = await this.#send("/api/auth/get-session", { method: "GET" });

      if (response.status === 401 || response.status === 403) {
        state.cookies = {};
        await this.#storage.save(state);
        return this.#setSnapshot("signed-out", null);
      }
      if (!response.ok) {
        return this.#setSnapshot("sync-paused", this.#current.user);
      }

      const data = await readJson(response);

      if (data === null) {
        state.cookies = {};
        await this.#storage.save(state);
        return this.#setSnapshot("signed-out", null);
      }

      return this.#setSnapshot("signed-in", sanitizeUser(isRecord(data) ? data.user : null));
    } catch (error) {
      if (error instanceof ProtectedStorageError) {
        throw error;
      }
      return this.#setSnapshot("sync-paused", this.#current.user);
    }
  }

  async #send(path: string, init: RequestInit, persistCookies = true) {
    const state = await this.#requireState();
    const url = new URL(path, this.#origin);

    if (url.origin !== this.#origin) {
      throw new AuthInputError("Authentication requests must use the configured origin.");
    }

    const headers = new Headers(init.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    headers.set("electron-origin", `${AUTH_PROTOCOL}:/`);
    headers.set("x-skip-oauth-proxy", "true");
    if (path.startsWith("/api/auth/")) {
      headers.set("origin", `${AUTH_PROTOCOL}:/`);
    } else {
      headers.delete("origin");
    }

    const cookie = this.#cookieHeader(state.cookies);
    if (cookie) {
      headers.set("cookie", cookie);
    }

    let response: Response;
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.#requestTimeoutMs);

    try {
      response = await this.#fetch(url, {
        ...init,
        credentials: "omit",
        headers,
        redirect: "error",
        signal: init.signal
          ? AbortSignal.any([init.signal, timeoutController.signal])
          : timeoutController.signal,
      });
    } catch (error) {
      throw new AuthRequestError("The authentication service could not be reached.", {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.redirected || (response.url && new URL(response.url).origin !== this.#origin)) {
      throw new AuthRequestError("The authentication service returned an invalid response.");
    }

    if (persistCookies) {
      const next = this.#cookiesFromResponse(response, state.cookies);
      if (!sameCookies(next, state.cookies)) {
        state.cookies = next;
        await this.#storage.save(state);
        this.#setSnapshot(this.#current.status, this.#current.user);
      }
    }

    return response;
  }

  #cookiesFromResponse(response: Response, current: Record<string, StoredAuthCookie>) {
    const next: Record<string, StoredAuthCookie> = { ...current };
    const now = this.#now();

    for (const header of getSetCookieHeaders(response.headers)) {
      for (const value of splitSetCookieHeader(header)) {
        for (const [name, attributes] of parseSetCookieHeader(value)) {
          if (!this.#acceptsCookie(name, attributes, response.url)) {
            continue;
          }

          const expiresAt = cookieExpiry(attributes, now);
          if (expiresAt !== null && expiresAt <= now) {
            delete next[name];
            continue;
          }

          if (!SAFE_COOKIE_VALUE.test(attributes.value)) {
            continue;
          }

          next[name] = { expiresAt, value: attributes.value };
        }
      }
    }

    return this.#validatedCookies(next);
  }

  #acceptsCookie(
    name: string,
    attributes: ReturnType<typeof parseSetCookieHeader> extends Map<string, infer Attributes>
      ? Attributes
      : never,
    responseUrl: string,
  ) {
    const plainName = stripSecureCookiePrefix(name);
    if (
      !cookieNameRegex.test(name) ||
      !plainName.startsWith(`${this.#cookiePrefix}.`) ||
      Buffer.byteLength(`${name}=${attributes.value}`) > this.#maxCookieBytes
    ) {
      return false;
    }

    const origin = responseUrl ? new URL(responseUrl).origin : this.#origin;
    if (origin !== this.#origin) {
      return false;
    }

    const hostname = new URL(this.#origin).hostname;
    if (attributes.domain && attributes.domain.replace(/^\./, "") !== hostname) {
      return false;
    }

    if (name.startsWith("__Secure-") && !attributes.secure) {
      return false;
    }
    if (
      name.startsWith("__Host-") &&
      (!attributes.secure || attributes.domain !== undefined || attributes.path !== "/")
    ) {
      return false;
    }

    return true;
  }

  #validatedCookies(cookies: Record<string, StoredAuthCookie>) {
    const now = this.#now();
    const valid: Record<string, StoredAuthCookie> = {};

    for (const [name, cookie] of Object.entries(cookies)) {
      const plainName = stripSecureCookiePrefix(name);
      if (
        cookieNameRegex.test(name) &&
        plainName.startsWith(`${this.#cookiePrefix}.`) &&
        SAFE_COOKIE_VALUE.test(cookie.value) &&
        Buffer.byteLength(`${name}=${cookie.value}`) <= this.#maxCookieBytes &&
        (cookie.expiresAt === null || cookie.expiresAt > now)
      ) {
        valid[name] = cookie;
      }
    }

    const entries = Object.entries(valid);
    if (
      entries.length > this.#maxCookies ||
      Buffer.byteLength(cookieHeader(entries)) > this.#maxCookieJarBytes
    ) {
      throw new AuthRequestError("The authentication cookie jar exceeds its safety limit.");
    }

    return valid;
  }

  #cookieHeader(cookies: Record<string, StoredAuthCookie>) {
    return cookieHeader(Object.entries(this.#validatedCookies(cookies)));
  }

  #setSnapshot(status: AuthStatus, user: AuthUser | null) {
    this.#current = {
      pendingAuth: Boolean(
        this.#state?.pendingAuth && isValidPendingAuth(this.#state.pendingAuth, this.#now()),
      ),
      status,
      user: user ? { ...user } : null,
    };
    return this.snapshot();
  }

  #serialize<Result>(operation: () => Promise<Result>) {
    const protectedOperation = async () => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof ProtectedStorageError) {
          this.#setSnapshot("protected-storage-unavailable", null);
        }
        throw error;
      }
    };
    const result = this.#operations.then(protectedOperation, protectedOperation);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function resolveAuthOrigin(value = process.env[AUTH_ORIGIN_ENV]) {
  const raw = value ?? DEFAULT_AUTH_ORIGIN;
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new AuthInputError("The configured authentication origin is invalid.");
  }

  if (
    url.origin === "null" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname)))
  ) {
    throw new AuthInputError("The configured authentication origin is invalid.");
  }

  return url.origin;
}

export function isAuthCallbackUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    parseDeepLink(value);
    return true;
  } catch {
    return false;
  }
}

interface RedirectToken {
  identifier: string;
  state: string;
}

function parseDeepLink(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new AuthInputError("The sign-in callback is invalid.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuthInputError("The sign-in callback is invalid.");
  }

  if (
    url.protocol !== `${AUTH_PROTOCOL}:` ||
    `/${url.hostname}${url.pathname}` !== AUTH_CALLBACK_PATH ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    !url.hash.startsWith("#token=") ||
    url.hash.includes("&")
  ) {
    throw new AuthInputError("The sign-in callback is invalid.");
  }

  return parseEncodedAuthorizationCode(url.hash.slice(7));
}

function parseEncodedAuthorizationCode(value: string): RedirectToken {
  if (!value || value.length > 512) {
    throw new AuthInputError("The authorization code is invalid.");
  }

  let encoded: string;
  try {
    encoded = decodeURIComponent(value);
  } catch {
    throw new AuthInputError("The authorization code is invalid.");
  }

  if (!ENCODED_AUTHORIZATION_CODE.test(encoded)) {
    throw new AuthInputError("The authorization code is invalid.");
  }

  let data: unknown;
  try {
    const unpadded = encoded.replace(/=+$/, "");
    const decoded = Buffer.from(unpadded, "base64url");
    const canonical = decoded.toString("base64url");
    const padded = canonical.padEnd(Math.ceil(canonical.length / 4) * 4, "=");
    if (encoded !== canonical && encoded !== padded) {
      throw new Error("Non-canonical authorization code.");
    }
    data = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new AuthInputError("The authorization code is invalid.");
  }

  if (
    !isRecord(data) ||
    Object.keys(data).length !== 2 ||
    typeof data.identifier !== "string" ||
    !RAW_AUTHORIZATION_CODE.test(data.identifier) ||
    typeof data.state !== "string" ||
    !PKCE_VALUE.test(data.state)
  ) {
    throw new AuthInputError("The authorization code is invalid.");
  }

  return { identifier: data.identifier, state: data.state };
}

function createPendingAuth(now: number): PendingAuth {
  return {
    expiresAt: now + AUTH_FLOW_TTL_MS,
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
  };
}

function isValidPendingAuth(value: PendingAuth, now: number) {
  return (
    PKCE_VALUE.test(value.state) &&
    PKCE_VALUE.test(value.verifier) &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > now
  );
}

function cookieExpiry(
  attributes: ReturnType<typeof parseSetCookieHeader> extends Map<string, infer Attributes>
    ? Attributes
    : never,
  now: number,
) {
  if (attributes["max-age"] !== undefined) {
    const seconds = attributes["max-age"];
    if (!Number.isFinite(seconds)) {
      return now;
    }
    const expiresAt = now + seconds * 1_000;
    return Number.isSafeInteger(expiresAt) ? expiresAt : now;
  }

  if (attributes.expires !== undefined) {
    const expiresAt = attributes.expires.getTime();
    return Number.isFinite(expiresAt) ? expiresAt : now;
  }

  return null;
}

function getSetCookieHeaders(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  return getSetCookie
    ? getSetCookie.call(headers)
    : splitSetCookieHeader(headers.get("set-cookie") ?? "");
}

function sanitizeUser(value: unknown): AuthUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    value.name.length > 200 ||
    hasControlCharacter(value.name) ||
    typeof value.email !== "string" ||
    value.email.length === 0 ||
    value.email.length > 320 ||
    hasControlCharacter(value.email)
  ) {
    throw new AuthRequestError("The authentication service returned an invalid user.");
  }

  let image: string | null = null;
  if (typeof value.image === "string" && value.image.length <= 2_048) {
    try {
      const url = new URL(value.image);
      if (url.protocol === "https:") {
        image = url.href;
      }
    } catch {
      // Invalid profile images are omitted from the renderer-facing user.
    }
  }

  return { email: value.email, id: value.id, image, name: value.name };
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    throw new AuthRequestError("The authentication service returned invalid data.", {
      cause: error,
    });
  }
}

function validateCookiePrefix(value: string) {
  if (
    !value ||
    value.length > 64 ||
    !cookieNameRegex.test(value) ||
    stripSecureCookiePrefix(value) !== value
  ) {
    throw new AuthInputError("The authentication cookie prefix is invalid.");
  }
  return value;
}

function positiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AuthInputError(`The configured ${name} is invalid.`);
  }
  return value;
}

function cookieHeader(entries: [string, StoredAuthCookie][]) {
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, cookie]) => `${name}=${cookie.value}`)
    .join("; ");
}

function sameCookies(
  left: Record<string, StoredAuthCookie>,
  right: Record<string, StoredAuthCookie>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacter(value: string) {
  return value.includes("\r") || value.includes("\n") || value.includes("\0");
}
