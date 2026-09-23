import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { createAuthClient } from "better-auth/react";
import type { MobileAuthClient } from "./auth-client";
import { WorkspaceRegistry } from "@mooligan/account/registry";
import type { WorkspaceRuntime } from "@mooligan/account/runtime";
import { workspaceEventSchemaVersion, workspaceIdForBindingSecret } from "@mooligan/workspace";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { UuidSchema, UuidV4Schema } from "@mooligan/domain/schema";
import { Schema } from "effect";

import { accountConfiguration } from "./config";
import { MobileAccount, type LocalWorkspace } from "./mobile-account";

const decodeBody = Schema.decodeUnknownSync(Schema.parseJson());
const decodeBinding = Schema.decodeUnknownSync(
  Schema.parseJson(Schema.Struct({ workspaceId: UuidSchema, bindingSecret: UuidV4Schema })),
);

const user = { id: randomUUID(), name: "Molly", email: "molly@example.com", image: null };
const initialTime = Date.now();
const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.close();
  vi.useRealTimers();
});

class Fixture {
  signedIn = false;
  cancelSignIn = false;
  storageUnavailable = false;
  remoteWorkspaceId: string | null = null;
  online = true;
  unauthorized = false;
  upgradeRequired = false;
  bindFails = false;
  credentialRequests = 0;
  signInRequests = 0;
  liveStores = 0;
  maxLiveStores = 0;
  readonly opened: WorkspaceRuntime[] = [];
  readonly registry = new WorkspaceRegistry(new DatabaseSync(":memory:"), randomUUID);
  readonly auth: MobileAuthClient;
  readonly account: MobileAccount<LocalWorkspace>;

  constructor() {
    fixtures.push(this);
    const request: typeof fetch = async (input, init) => {
      if (!this.online) throw new Error("offline");
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/api/auth/sign-in/social") {
        this.signInRequests++;
        expect(decodeBody(init?.body)).toEqual({
          provider: "google",
          callbackURL: "com.mooligan.app://settings",
        });
        this.signedIn = !this.cancelSignIn;
        return Response.json({ redirect: false, url: "https://accounts.google.com" });
      }
      if (this.unauthorized) return new Response(null, { status: 401 });
      if (url.pathname === "/api/auth/get-session")
        return Response.json(this.signedIn ? session() : null);
      if (url.pathname === "/api/auth/sign-out") return Response.json({ success: true });
      expect(new Headers(init?.headers).get("cookie")).toBe("better-auth.session_token=secret");
      expect(init?.credentials).toBe("omit");
      if (url.pathname === "/api/workspace") {
        return this.remoteWorkspaceId
          ? Response.json({ workspaceId: this.remoteWorkspaceId, createdAt: "2026-09-06" })
          : new Response(null, { status: 404 });
      }
      if (url.pathname === "/api/workspace/bind") {
        if (this.bindFails) return new Response(null, { status: 503 });
        const body = decodeBinding(init?.body);
        expect(workspaceIdForBindingSecret(body.bindingSecret)).toBe(body.workspaceId);
        this.remoteWorkspaceId = body.workspaceId;
        return Response.json({ workspaceId: body.workspaceId, createdAt: "2026-09-06" });
      }
      if (url.pathname === "/api/workspace/sync-credential") {
        this.credentialRequests++;
        expect(decodeBody(init?.body)).toEqual({
          appVersion: "1.0.0",
          eventSchemaVersion: workspaceEventSchemaVersion,
        });
        if (this.upgradeRequired) return new Response(null, { status: 426 });
        return Response.json({
          credential: `credential-${this.credentialRequests}`,
          expiresAt: Math.floor(Date.now() / 1000) + 300,
        });
      }
      throw new Error("Unexpected request");
    };
    this.auth = createAuthClient({
      baseURL: "https://mooligan.example.com",
      fetchOptions: {
        customFetchImpl: request,
        onRequest: (context) => {
          if (context.url.toString().endsWith("/sign-out")) this.signedIn = false;
        },
      },
      plugins: [
        {
          id: "test-session",
          getActions: () => ({
            getCookie: () => (this.signedIn ? "better-auth.session_token=secret" : ""),
          }),
        },
      ],
    });
    this.account = new MobileAccount(
      () => {
        if (this.storageUnavailable) throw new Error("SecureStore is unavailable.");
        return this.auth;
      },
      this.registry,
      async (runtime) => {
        this.opened.push(runtime);
        this.liveStores++;
        this.maxLiveStores = Math.max(this.maxLiveStores, this.liveStores);
        return {
          close: async () => {
            this.liveStores--;
          },
          observeConnection: (changed) => {
            changed(runtime.sync !== null);
            return () => undefined;
          },
        };
      },
      "1.0.0",
      "https://mooligan.example.com",
      request,
    );
  }

  async signIn() {
    await this.account.initialize();
    await this.account.signIn();
  }

  restoreSession() {
    this.signedIn = true;
    const atom = this.auth.$store.atoms.session;
    atom.set({ ...atom.get(), data: session() });
  }

  close() {
    this.account.setActive(false);
    this.registry.close();
  }
}

test("Better Auth sign-in binds the local Workspace", async () => {
  const fixture = new Fixture();
  await fixture.account.initialize();
  const local = fixture.account.getSnapshot().runtime.workspaceId;
  await fixture.account.signIn();
  expect(fixture.signInRequests).toBe(1);
  expect(fixture.account.getSnapshot()).toMatchObject({
    auth: { status: "signed-in", pendingAuth: false, user },
    connected: true,
    runtime: { workspaceId: local, sync: { accountWorkspaceId: local } },
  });
  expect(fixture.maxLiveStores).toBe(1);
  expect(fixture.registry.accountId(local)).toBe(user.id);
});

test("an existing Account Workspace retains the local one and sign-out keeps its data open", async () => {
  const fixture = new Fixture();
  const local = fixture.registry.bootstrap().workspaceId;
  fixture.remoteWorkspaceId = randomUUID();
  await fixture.signIn();
  expect(fixture.account.getSnapshot().runtime.workspaceId).toBe(fixture.remoteWorkspaceId);
  expect(fixture.registry.workspaces()).toHaveLength(2);
  expect(fixture.registry.workspace(local).accountId).toBeNull();
  await fixture.account.signOut();
  expect(fixture.account.getSnapshot()).toMatchObject({
    auth: { status: "signed-out", user: null },
    connected: false,
    runtime: { workspaceId: fixture.remoteWorkspaceId, sync: null },
  });
  expect(fixture.account.getSnapshot().workspace).not.toBeNull();
  expect(fixture.auth.getCookie()).toBe("");
  expect(fixture.maxLiveStores).toBe(1);
});

test("offline restoration opens the local Workspace before requesting the saved session", async () => {
  const fixture = new Fixture();
  fixture.restoreSession();
  fixture.online = false;
  await fixture.account.initialize();
  expect(fixture.opened[0]?.sync).toBeNull();
  expect(fixture.account.getSnapshot()).toMatchObject({
    auth: { status: "session-unavailable", user },
    runtime: { sync: null },
  });
  expect(fixture.account.getSnapshot().workspace).not.toBeNull();
  fixture.online = true;
  fixture.account.setActive(true);
  await fixture.account.refresh();
  expect(fixture.account.getSnapshot().runtime.sync).not.toBeNull();
});

test("a failed bind retries on reconnect, and credential renewal closes the old connection first", async () => {
  vi.useFakeTimers({ now: initialTime });
  const fixture = new Fixture();
  fixture.bindFails = true;
  await fixture.signIn();
  expect(fixture.account.getSnapshot().runtime.syncIssue).toBe("account-service-unavailable");
  fixture.bindFails = false;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fixture.account.getSnapshot().runtime.sync?.credential).toBe("credential-1");
  await vi.advanceTimersByTimeAsync(240_000);
  expect(fixture.account.getSnapshot().runtime.sync?.credential).toBe("credential-2");
  expect(fixture.maxLiveStores).toBe(1);
});

test("an expired session or incompatible client pauses sync while keeping the Workspace", async () => {
  const fixture = new Fixture();
  await fixture.signIn();
  const id = fixture.account.getSnapshot().runtime.workspaceId;
  fixture.upgradeRequired = true;
  await fixture.account.refresh();
  expect(fixture.account.getSnapshot().runtime).toMatchObject({
    workspaceId: id,
    sync: null,
    syncIssue: "client-upgrade-required",
  });
  expect(fixture.account.getSnapshot().workspace).not.toBeNull();
  fixture.unauthorized = true;
  await fixture.account.refresh();
  expect(fixture.account.getSnapshot().auth.status).toBe("signed-out");
  expect(fixture.account.getSnapshot().runtime.workspaceId).toBe(id);
});

test("cancelled Better Auth sign-in leaves the Workspace local", async () => {
  const fixture = new Fixture();
  fixture.cancelSignIn = true;
  await fixture.signIn();
  expect(fixture.account.getSnapshot().auth).toMatchObject({
    status: "signed-out",
    pendingAuth: false,
  });
  expect(fixture.account.getSnapshot().runtime.sync).toBeNull();
});

test("offline sign-out clears the mobile session and pauses sync without closing local data", async () => {
  const fixture = new Fixture();
  await fixture.signIn();
  const id = fixture.account.getSnapshot().runtime.workspaceId;
  fixture.online = false;
  await fixture.account.signOut();
  expect(fixture.account.getSnapshot()).toMatchObject({
    auth: { status: "signed-out", user: null },
    runtime: { workspaceId: id, sync: null },
  });
  expect(fixture.account.getSnapshot().workspace).not.toBeNull();
  expect(fixture.auth.getCookie()).toBe("");
});

test("mobile configuration derives sync from the same trusted service origin", () => {
  expect(accountConfiguration(undefined)).toBeNull();
  expect(accountConfiguration("https://mooligan.example.com")).toEqual({
    authOrigin: "https://mooligan.example.com",
    syncUrl: "wss://mooligan.example.com/api/sync",
  });
  expect(accountConfiguration("http://127.0.0.1:3000")?.syncUrl).toBe(
    "ws://127.0.0.1:3000/api/sync",
  );
  for (const origin of [
    "http://untrusted.example.com",
    "https://example.com/path",
    "https://user:secret@example.com",
  ]) {
    expect(() => accountConfiguration(origin)).toThrow();
  }
});

test("selecting a retained local Workspace survives foreground refresh without rebinding it", async () => {
  const fixture = new Fixture();
  const local = fixture.registry.bootstrap().workspaceId;
  fixture.remoteWorkspaceId = randomUUID();
  await fixture.signIn();
  await fixture.account.selectWorkspace(local);
  await fixture.account.refresh();
  expect(fixture.account.getSnapshot().runtime).toMatchObject({ workspaceId: local, sync: null });
  expect(fixture.registry.accountId(local)).toBeNull();
});

function session() {
  return {
    user: { ...user, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    session: {
      id: "session-id",
      userId: user.id,
      token: "secret",
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

test("a SecureStore startup failure leaves local data open and can be retried", async () => {
  const fixture = new Fixture();
  fixture.storageUnavailable = true;
  await fixture.account.initialize();
  expect(fixture.account.getSnapshot().workspace).not.toBeNull();
  expect(fixture.account.getSnapshot().error).toBe("SecureStore is unavailable.");
  fixture.storageUnavailable = false;
  await fixture.account.refresh();
  expect(fixture.account.getSnapshot().error).toBeNull();
  await fixture.account.signIn();
  expect(fixture.account.getSnapshot().auth.status).toBe("signed-in");
});

test("restoring while signed in leaves the new workspace unbound across session refresh", async () => {
  const fixture = new Fixture();
  await fixture.signIn();
  const bound = fixture.account.getSnapshot().runtime.workspaceId;
  await fixture.account.restoreWorkspace(async () => undefined);
  const restored = fixture.account.getSnapshot().runtime.workspaceId;
  expect(restored).not.toBe(bound);
  expect(fixture.registry.accountId(restored)).toBeNull();
  await fixture.account.refresh();
  expect(fixture.account.getSnapshot().runtime).toMatchObject({
    workspaceId: restored,
    sync: null,
  });
  expect(fixture.registry.accountId(bound)).toBe(user.id);
});
