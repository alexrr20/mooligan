import assert from "node:assert/strict";
import { test } from "node:test";
import * as z from "zod";
import type { JSONType } from "zod";

import type { MotionPreference, Preferences } from "../electron/workspace/preferences.ts";
import {
  PreferenceSyncCoordinator,
  type PreferenceSyncAuth,
  type PreferenceSyncWorkspace,
} from "../electron/workspace/preference-sync.ts";
import type { PreferenceSyncState, RemoteMotionPreference } from "../electron/workspace/store.ts";

const REMOTE_A = "01989924-0000-7000-8000-000000000001";
const REMOTE_B = "01989924-0000-7000-8000-000000000002";
const UpdateRequestSchema = z.object({
  updates: z.tuple([
    z.object({ key: z.literal("motion"), value: z.enum(["full", "reduced", "system"]) }),
  ]),
});

void test("first bind uploads local motion and an existing account downloads cloud motion", async () => {
  const local = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, local);

  local.update("full");
  auth.respond = (request) => {
    assert.equal(request.path, "/sync/workspace/bind");
    assert.deepEqual(request.body, {
      localWorkspaceId: local.workspaceId,
      preferences: { motion: "full" },
    });
    return json(bindResponse(REMOTE_A, remote("full", 1)));
  };

  assert.deepEqual(await sync.connect("user-a"), { status: "synced" });
  assert.equal(local.remoteWorkspaceId, REMOTE_A);
  assert.equal(local.motion, "full");
  assert.equal(local.pending, false);
  assert.equal(auth.requests.length, 1);

  const secondDevice = new FakeWorkspace();
  const secondAuth = new FakeAuth();
  const secondSync = new PreferenceSyncCoordinator(secondAuth, secondDevice);

  secondAuth.respond = () => json(bindResponse(REMOTE_A, remote("reduced", 2)));
  assert.deepEqual(await secondSync.connect("user-a"), { status: "synced" });
  assert.equal(secondDevice.motion, "reduced");
  assert.equal(secondDevice.pending, false);
});

void test("a pending local preference wins a cloud conflict", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  workspace.update("full");
  auth.respond = (request) => {
    if (request.path === "/sync/workspace/bind") {
      return json(bindResponse(REMOTE_A, remote("reduced", 4)));
    }

    assert.deepEqual(request.body, { updates: [{ key: "motion", value: "full" }] });
    return json(preferencesResponse(remote("full", 5)));
  };

  assert.deepEqual(await sync.connect("user-a"), { status: "synced" });
  assert.equal(workspace.motion, "full");
  assert.deepEqual(workspace.readPreferenceSyncState(), {
    motion: { conflict: null, pending: false, remoteVersion: 5 },
  });
  assert.deepEqual(
    auth.requests.map(({ path }) => path),
    ["/sync/workspace/bind", "/sync/preferences"],
  );
});

void test("offline edits remain pending, reconnect, and reject invalid cloud data safely", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  auth.respond = () => json(bindResponse(REMOTE_A, remote("system", 1)));
  await sync.connect("user-a");
  workspace.update("reduced");
  auth.respond = () => {
    throw new TypeError("offline");
  };

  assert.deepEqual(await sync.preferenceChanged(), { status: "pending" });
  assert.equal(workspace.motion, "reduced");
  assert.equal(workspace.pending, true);

  auth.respond = (request) =>
    request.init?.method === "POST"
      ? json(preferencesResponse(remote("reduced", 2)))
      : json(preferencesResponse(remote("system", 1)));
  assert.deepEqual(await sync.sync(), { status: "synced" });
  assert.equal(workspace.motion, "reduced");
  assert.equal(workspace.pending, false);

  auth.respond = () => json({ preferences: { motion: { ...remote("full", 3), extra: true } } });
  assert.deepEqual(await sync.sync(), { status: "paused" });
  assert.equal(workspace.motion, "reduced");

  workspace.update("full");
  auth.respond = () => new Response(null, { status: 401 });
  assert.deepEqual(await sync.preferenceChanged(), { status: "pending" });
  assert.equal(workspace.motion, "full");
});

void test("switching accounts selects isolated local workspaces", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);
  let account: keyof typeof cloud = "user-a";
  const cloud = {
    "user-a": { motion: remote("full", 1), workspaceId: REMOTE_A },
    "user-b": { motion: remote("reduced", 1), workspaceId: REMOTE_B },
  };

  auth.respond = (request) => {
    const current = cloud[account];
    if (request.path === "/sync/workspace/bind") {
      return json(bindResponse(current.workspaceId, current.motion));
    }

    if (request.init?.method === "POST") {
      const body = UpdateRequestSchema.parse(request.body);
      current.motion = remote(body.updates[0].value, current.motion.version + 1);
    }

    return json(preferencesResponse(current.motion));
  };

  await sync.connect("user-a");
  const localA = workspace.workspaceId;
  assert.equal(workspace.motion, "full");

  account = "user-b";
  const switching = sync.connect("user-b");
  workspace.update("system");
  const staleChange = sync.preferenceChanged();
  await switching;
  await staleChange;
  const localB = workspace.workspaceId;
  assert.notEqual(localB, localA);
  assert.equal(workspace.motion, "reduced");

  account = "user-a";
  await sync.connect("user-a");
  assert.equal(workspace.workspaceId, localA);
  assert.equal(workspace.remoteWorkspaceId, REMOTE_A);
  assert.equal(workspace.motion, "system");
  assert.equal(cloud["user-a"].motion.value, "system");
  assert.equal(cloud["user-b"].motion.value, "reduced");

  assert.deepEqual(await sync.disconnect(), { status: "local-only" });
});

void test("a local edit racing an in-flight push is not cleared", async () => {
  const workspace = new FakeWorkspace();
  const auth = new FakeAuth();
  const sync = new PreferenceSyncCoordinator(auth, workspace);

  auth.respond = () => json(bindResponse(REMOTE_A, remote("system", 1)));
  await sync.connect("user-a");

  const firstStarted = deferred<void>();
  const releaseFirst = deferred<Response>();
  let push = 0;

  auth.respond = (request) => {
    push += 1;
    if (push === 1) {
      assert.deepEqual(request.body, { updates: [{ key: "motion", value: "full" }] });
      firstStarted.resolve();
      return releaseFirst.promise;
    }

    assert.deepEqual(request.body, { updates: [{ key: "motion", value: "reduced" }] });
    return json(preferencesResponse(remote("reduced", 3)));
  };

  workspace.update("full");
  const first = sync.preferenceChanged();
  await firstStarted.promise;

  workspace.update("reduced");
  const second = sync.preferenceChanged();
  releaseFirst.resolve(json(preferencesResponse(remote("full", 2))));

  assert.deepEqual(await first, { status: "pending" });
  assert.deepEqual(await second, { status: "synced" });
  assert.equal(workspace.motion, "reduced");
  assert.equal(workspace.pending, false);
  assert.equal(push, 2);
});

type LocalWorkspace = {
  boundUserId: string | null;
  conflict: RemoteMotionPreference | null;
  motion: MotionPreference;
  pending: boolean;
  remoteVersion: number | null;
  remoteWorkspaceId: string | null;
  workspaceId: string;
};

class FakeWorkspace implements PreferenceSyncWorkspace {
  readonly #accounts = new Map<string, LocalWorkspace>();
  #active = createLocalWorkspace();

  get motion() {
    return this.#active.motion;
  }

  get pending() {
    return this.#active.pending;
  }

  get remoteWorkspaceId() {
    return this.#active.remoteWorkspaceId;
  }

  get workspaceId() {
    return this.#active.workspaceId;
  }

  applyRemotePreference(remotePreference: RemoteMotionPreference): "applied" | "conflict" {
    if (this.#active.pending && this.#active.motion !== remotePreference.value) {
      this.#active.conflict = remotePreference;
      this.#active.remoteVersion = remotePreference.version;
      return "conflict";
    }

    this.#active.motion = remotePreference.value;
    this.#active.pending = false;
    this.#active.conflict = null;
    this.#active.remoteVersion = remotePreference.version;
    return "applied";
  }

  bindActiveWorkspace(userId: string, remoteWorkspaceId: string) {
    assert.equal(this.#active.boundUserId, userId);
    this.#active.remoteWorkspaceId = remoteWorkspaceId;
  }

  markPreferenceSynced(pushedValue: MotionPreference, preference: RemoteMotionPreference) {
    assert.equal(preference.value, pushedValue);
    const unchanged = this.#active.motion === pushedValue;

    this.#active.conflict = null;
    this.#active.pending = !unchanged;
    this.#active.remoteVersion = preference.version;
    return unchanged;
  }

  readPreferences(): Preferences {
    return { motion: this.#active.motion };
  }

  readPreferenceSyncState(): PreferenceSyncState {
    return {
      motion: {
        conflict: this.#active.conflict,
        pending: this.#active.pending,
        remoteVersion: this.#active.remoteVersion,
      },
    };
  }

  selectForUser(userId: string) {
    const existing = this.#accounts.get(userId);

    if (existing) {
      this.#active = existing;
      return existing;
    }

    if (this.#active.boundUserId === null) {
      this.#active.boundUserId = userId;
    } else if (this.#active.boundUserId !== userId) {
      this.#active = createLocalWorkspace();
      this.#active.boundUserId = userId;
    }

    this.#accounts.set(userId, this.#active);
    return this.#active;
  }

  update(motion: MotionPreference) {
    this.#active.motion = motion;
    this.#active.pending = true;
  }
}

type CapturedRequest = {
  body: JSONType | undefined;
  init: RequestInit | undefined;
  path: `/sync/${string}`;
};

class FakeAuth implements PreferenceSyncAuth {
  readonly requests: CapturedRequest[] = [];
  respond: (request: CapturedRequest) => Response | Promise<Response> = () => {
    throw new Error("Unexpected sync request.");
  };

  async request(path: `/sync/${string}`, init?: RequestInit) {
    const body = z.string().safeParse(init?.body);
    const request = {
      body: body.success ? z.json().parse(JSON.parse(body.data)) : undefined,
      init,
      path,
    };
    this.requests.push(request);
    return await this.respond(request);
  }
}

let nextWorkspace = 0;

function createLocalWorkspace(): LocalWorkspace {
  nextWorkspace += 1;
  return {
    boundUserId: null,
    conflict: null,
    motion: "system",
    pending: false,
    remoteVersion: null,
    remoteWorkspaceId: null,
    workspaceId: `00000000-0000-4000-8000-${String(nextWorkspace).padStart(12, "0")}`,
  };
}

function remote(value: MotionPreference, version: number): RemoteMotionPreference {
  return {
    updatedAt: `2026-08-04T10:${String(version).padStart(2, "0")}:00.000Z`,
    value,
    version,
  };
}

function bindResponse(workspaceId: string, motion: RemoteMotionPreference) {
  return { preferences: { motion }, workspaceId };
}

function preferencesResponse(motion: RemoteMotionPreference) {
  return { preferences: { motion } };
}

function json(value: JSONType) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
