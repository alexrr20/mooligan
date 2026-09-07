import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as z from "zod";
import type { JSONType } from "zod";
import { workspaceEventSchemaVersion } from "@mooligan/workspace";

import type { AuthSnapshot } from "../shared/desktop-api.ts";
import type { AccountWorkspaceApiPath } from "../electron/auth/service.ts";
import { AccountWorkspace, type AccountWorkspaceAuth } from "@mooligan/account/workspace";
import { WorkspaceRegistry } from "../electron/workspace/registry.ts";

const now = 1_000_000;

void test("sign-in binds the active unbound Workspace and refreshes its in-memory credential", async () => {
  await withRegistry(async (registry) => {
    const initial = registry.bootstrap();
    const bindingSecret = registry.bindingSecret(initial.workspaceId);
    let remoteWorkspaceId: string | null = null;
    let credentialNumber = 0;
    const auth = new FakeAccountAuth(signedIn("account-one"), async (path, init) => {
      if (path === "/api/workspace" && init.method === "GET") {
        return remoteWorkspaceId
          ? jsonResponse(workspaceResponse(remoteWorkspaceId))
          : jsonResponse({ error: "workspace_not_found" }, 404);
      }
      if (path === "/api/workspace/bind") {
        const body = JSON.parse(z.string().parse(init.body));
        assert.deepEqual(body, { bindingSecret, workspaceId: initial.workspaceId });
        remoteWorkspaceId = initial.workspaceId;
        return jsonResponse(workspaceResponse(initial.workspaceId));
      }
      if (path === "/api/workspace/sync-credential") {
        assert.deepEqual(JSON.parse(z.string().parse(init.body)), {
          appVersion: "0.0.0",
          eventSchemaVersion: workspaceEventSchemaVersion,
        });
        assert.equal(new Headers(init.headers).get("content-type"), "application/json");
        credentialNumber += 1;
        return jsonResponse({ credential: `credential-${credentialNumber}`, expiresAt: 1_300 });
      }
      throw new Error("Unexpected Account Workspace request.");
    });
    const changes: boolean[] = [];
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      (workspaceChanged) => {
        changes.push(workspaceChanged);
      },
      () => now,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    const connected = accountWorkspace.runtime();

    assert.equal(connected.workspaceId, initial.workspaceId);
    assert.equal(connected.sync?.credential, "credential-1");
    assert.equal(connected.sync?.accountWorkspaceId, initial.workspaceId);
    assert.equal(connected.syncIssue, null);
    assert.equal(connected.workspaces[0]?.accountAssociation, "account");
    assert.equal(JSON.stringify(connected).includes(bindingSecret), false);
    assert.deepEqual(changes, [false]);

    const refreshed = await accountWorkspace.refreshSync();
    assert.equal(refreshed.sync?.credential, "credential-2");
    assert.deepEqual(changes, [false, false]);

    auth.current = signedOut();
    await accountWorkspace.authChanged(auth.snapshot());
    const signedOutRuntime = accountWorkspace.runtime();
    assert.equal(signedOutRuntime.workspaceId, initial.workspaceId);
    assert.equal(signedOutRuntime.sync, null);
    assert.equal(signedOutRuntime.syncIssue, null);
  });
});

void test("an old desktop client keeps local data open when sync requires an upgrade", async () => {
  await withRegistry(async (registry) => {
    const workspaceId = registry.bootstrap().workspaceId;
    const auth = new FakeAccountAuth(signedIn("account-old-client"), async (path) => {
      if (path === "/api/workspace") {
        return jsonResponse(workspaceResponse(workspaceId));
      }
      if (path === "/api/workspace/sync-credential") {
        return jsonResponse(
          {
            error: "client_upgrade_required",
            message: "Update Mooligan before using Workspace sync.",
            minimumEventSchemaVersion: workspaceEventSchemaVersion + 1,
          },
          426,
        );
      }
      throw new Error(`Unexpected Account Workspace request: ${path}`);
    });
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      () => undefined,
      () => now,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    const runtime = accountWorkspace.runtime();

    assert.equal(runtime.workspaceId, workspaceId);
    assert.equal(runtime.sync, null);
    assert.equal(runtime.syncIssue, "client-upgrade-required");
    assert.equal(runtime.workspaces[0]?.active, true);
  });
});

void test("an existing Account Workspace opens separately and retains the prior unbound Workspace", async () => {
  await withRegistry(async (registry) => {
    const localWorkspaceId = registry.bootstrap().workspaceId;
    const accountWorkspaceId = randomUUID();
    let credentialsIssued = 0;
    const auth = new FakeAccountAuth(signedIn("account-existing"), async (path) => {
      if (path === "/api/workspace") {
        return jsonResponse(workspaceResponse(accountWorkspaceId));
      }
      if (path === "/api/workspace/sync-credential") {
        credentialsIssued += 1;
        return jsonResponse({ credential: `remote-${credentialsIssued}`, expiresAt: 1_300 });
      }
      throw new Error(`Unexpected Account Workspace request: ${path}`);
    });
    const switches: boolean[] = [];
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      (workspaceChanged) => {
        switches.push(workspaceChanged);
      },
      () => now,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    const connected = accountWorkspace.runtime();

    assert.equal(connected.workspaceId, accountWorkspaceId);
    assert.equal(connected.workspaces.length, 2);
    assert.deepEqual(
      connected.workspaces.map(({ accountAssociation, workspaceId }) => ({
        accountAssociation,
        workspaceId,
      })),
      [
        { accountAssociation: "unbound", workspaceId: localWorkspaceId },
        { accountAssociation: "account", workspaceId: accountWorkspaceId },
      ],
    );
    assert.deepEqual(switches, [true]);

    await accountWorkspace.selectWorkspace(localWorkspaceId);
    assert.equal(accountWorkspace.runtime().sync, null);
    assert.equal(accountWorkspace.runtime().workspaceId, localWorkspaceId);

    await accountWorkspace.selectWorkspace(accountWorkspaceId);
    assert.equal(accountWorkspace.runtime().sync?.credential, "remote-2");
    assert.deepEqual(switches, [true, true, true]);
  });
});

void test("switching Accounts never reuses the previous Account credential or Workspace", async () => {
  await withRegistry(async (registry) => {
    const firstWorkspaceId = randomUUID();
    const secondWorkspaceId = randomUUID();
    const auth = new FakeAccountAuth(signedIn("account-first"), async (path) => {
      if (path === "/api/workspace") {
        const workspaceId =
          auth.current.user?.id === "account-first" ? firstWorkspaceId : secondWorkspaceId;
        return jsonResponse(workspaceResponse(workspaceId));
      }
      if (path === "/api/workspace/sync-credential") {
        const credential =
          auth.current.user?.id === "account-first" ? "credential-first" : "credential-second";
        return jsonResponse({ credential, expiresAt: 1_300 });
      }
      throw new Error(`Unexpected Account Workspace request: ${path}`);
    });
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      () => undefined,
      () => now,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    assert.equal(accountWorkspace.runtime().sync?.credential, "credential-first");

    auth.current = signedOut();
    await accountWorkspace.authChanged(auth.snapshot());
    auth.current = signedIn("account-second");
    await accountWorkspace.authChanged(auth.snapshot());
    const switched = accountWorkspace.runtime();

    assert.equal(switched.workspaceId, secondWorkspaceId);
    assert.equal(switched.sync?.credential, "credential-second");
    assert.equal(JSON.stringify(switched).includes("credential-first"), false);
    assert.equal(switched.workspaces.length, 3);
    assert.equal(registry.accountId(firstWorkspaceId), "account-first");
    assert.equal(registry.accountId(secondWorkspaceId), "account-second");

    await assert.rejects(
      accountWorkspace.selectWorkspace(firstWorkspaceId),
      /associated with another Account/u,
    );
    assert.equal(accountWorkspace.runtime().workspaceId, secondWorkspaceId);
    assert.equal(accountWorkspace.runtime().sync?.credential, "credential-second");
  });
});

void test("Account service failure pauses sync without replacing the local Workspace", async () => {
  await withRegistry(async (registry) => {
    const localWorkspaceId = registry.bootstrap().workspaceId;
    const auth = new FakeAccountAuth(signedIn("account-offline"), async () => {
      const error = new Error("offline");
      error.name = "AuthRequestError";
      throw error;
    });
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      () => undefined,
      () => now,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    const runtime = accountWorkspace.runtime();

    assert.equal(runtime.workspaceId, localWorkspaceId);
    assert.equal(runtime.sync, null);
    assert.equal(runtime.syncIssue, "account-service-unavailable");
    assert.equal(runtime.workspaces.length, 1);
  });
});

void test("a failed new-Account binding switches away from the prior Account Workspace", async () => {
  await withRegistry(async (registry) => {
    const priorWorkspaceId = registry.bootstrap().workspaceId;
    registry.bindWorkspace(priorWorkspaceId, "account-prior");
    const changes: boolean[] = [];
    const auth = new FakeAccountAuth(signedIn("account-new"), async (path) => {
      if (path === "/api/workspace") {
        return jsonResponse({ error: "workspace_not_found" }, 404);
      }
      if (path === "/api/workspace/bind") {
        throw new Error("offline");
      }
      throw new Error(`Unexpected Account Workspace request: ${path}`);
    });
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      (workspaceChanged) => {
        changes.push(workspaceChanged);
      },
      () => now,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    const runtime = accountWorkspace.runtime();

    assert.notEqual(runtime.workspaceId, priorWorkspaceId);
    assert.equal(runtime.sync, null);
    assert.equal(runtime.syncIssue, "workspace-unavailable");
    assert.equal(runtime.workspaces.length, 2);
    assert.equal(registry.accountId(runtime.workspaceId), null);
    assert.equal(registry.accountId(priorWorkspaceId), "account-prior");
    assert.deepEqual(changes, [true, false]);
  });
});

void test("switching Accounts leaves the prior Account Workspace before connecting", async () => {
  await withRegistry(async (registry) => {
    const priorWorkspaceId = registry.bootstrap().workspaceId;
    registry.bindWorkspace(priorWorkspaceId, "account-prior");
    const events: string[] = [];
    let resolveRequest: ((response: Response) => void) | undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const auth = new FakeAccountAuth(signedIn("account-new"), async () => {
      events.push("request");
      return await pendingResponse;
    });
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      (workspaceChanged) => {
        events.push(`workspace:${String(workspaceChanged)}`);
      },
      () => now,
    );

    const connecting = accountWorkspace.authChanged(auth.snapshot());
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.notEqual(registry.bootstrap().workspaceId, priorWorkspaceId);
    assert.deepEqual(events, ["workspace:true", "request"]);

    assert.ok(resolveRequest);
    resolveRequest(jsonResponse({ error: "service_unavailable" }, 503));
    await connecting;

    assert.notEqual(accountWorkspace.runtime().workspaceId, priorWorkspaceId);
    assert.equal(accountWorkspace.runtime().syncIssue, "account-service-unavailable");
    assert.deepEqual(events, ["workspace:true", "request", "workspace:false"]);
  });
});

void test("an expired credential disappears from runtime without changing local Workspace state", async () => {
  await withRegistry(async (registry) => {
    let clock = now;
    const workspaceId = registry.bootstrap().workspaceId;
    const auth = new FakeAccountAuth(signedIn("account-expiry"), async (path) => {
      if (path === "/api/workspace") {
        return jsonResponse({ error: "workspace_not_found" }, 404);
      }
      if (path === "/api/workspace/bind") {
        return jsonResponse(workspaceResponse(workspaceId));
      }
      if (path === "/api/workspace/sync-credential") {
        return jsonResponse({ credential: "expiring-credential", expiresAt: 1_001 });
      }
      throw new Error("Unexpected Account Workspace request.");
    });
    const accountWorkspace = new AccountWorkspace(
      auth,
      registry,
      () => undefined,
      () => clock,
    );

    await accountWorkspace.authChanged(auth.snapshot());
    assert.equal(accountWorkspace.runtime().sync?.credential, "expiring-credential");

    clock = 1_001_001;
    const expired = accountWorkspace.runtime();
    assert.equal(expired.workspaceId, workspaceId);
    assert.equal(expired.sync, null);
    assert.equal(expired.syncIssue, null);
    assert.equal(expired.workspaces[0]?.active, true);
  });
});

class FakeAccountAuth implements AccountWorkspaceAuth {
  current: AuthSnapshot;
  readonly #request: (path: AccountWorkspaceApiPath, init: RequestInit) => Promise<Response>;

  constructor(
    snapshot: AuthSnapshot,
    request: (path: AccountWorkspaceApiPath, init: RequestInit) => Promise<Response>,
  ) {
    this.current = snapshot;
    this.#request = request;
  }

  requestAccountWorkspace(path: AccountWorkspaceApiPath, init: RequestInit) {
    return this.#request(path, init);
  }

  snapshot() {
    return structuredClone(this.current);
  }
}

function signedIn(accountId: string): AuthSnapshot {
  return {
    pendingAuth: false,
    status: "signed-in",
    user: {
      email: `${accountId}@example.com`,
      id: accountId,
      image: null,
      name: accountId,
    },
  };
}

function signedOut(): AuthSnapshot {
  return { pendingAuth: false, status: "signed-out", user: null };
}

function workspaceResponse(workspaceId: string) {
  return { createdAt: "2026-08-26T12:00:00.000Z", workspaceId };
}

function jsonResponse(body: JSONType, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

async function withRegistry(run: (registry: WorkspaceRegistry) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-account-workspace-"));
  const registry = new WorkspaceRegistry(directory);
  try {
    await run(registry);
  } finally {
    registry.close();
    await rm(directory, { force: true, recursive: true });
  }
}
