import assert from "node:assert/strict";

import { workspaceIdForBindingSecret } from "@mooligan/workspace";
import { env, exports } from "cloudflare:workers";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports -- Cloudflare's pool must share Vitest's runner instance.
import { test } from "vitest";

import { authenticatedTestUser } from "./auth-helpers.ts";

const apiOrigin = "http://127.0.0.1:3000";

test("personal workspace creation is authenticated and idempotent", async () => {
  const { headers, userId } = await authenticatedTestUser("workspace-create@example.com");
  const missing = await request("/api/workspace", { headers });
  const first = await request("/api/workspace", { headers, method: "POST" });
  const second = await request("/api/workspace", { headers, method: "POST" });
  const read = await request("/api/workspace", { headers });
  const firstWorkspace = await workspaceBody(first);

  assert.equal(missing.status, 404);
  assert.equal(first.status, 200);
  assert.deepEqual(await workspaceBody(second), firstWorkspace);
  assert.deepEqual(await workspaceBody(read), firstWorkspace);
  assert.equal(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM personal_workspace WHERE user_id = ?")
      .bind(userId)
      .first("count"),
    1,
  );
});

test("an unbound workspace binds once and rejects a second workspace", async () => {
  const { headers } = await authenticatedTestUser("workspace-bind@example.com");
  const binding = workspaceBinding();
  const bound = await bindWorkspace(headers, binding);
  const repeated = await bindWorkspace(headers, binding);
  const conflict = await bindWorkspace(headers, workspaceBinding());

  assert.equal(bound.status, 200);
  assert.equal((await workspaceBody(bound)).workspaceId, binding.workspaceId);
  assert.equal(repeated.status, 200);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "account_has_workspace" });
});

test("a workspace cannot bind to a second account", async () => {
  const owner = await authenticatedTestUser("workspace-owner@example.com");
  const other = await authenticatedTestUser("workspace-other@example.com");
  const binding = workspaceBinding();

  assert.equal((await bindWorkspace(owner.headers, binding)).status, 200);
  const conflict = await bindWorkspace(other.headers, binding);

  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "workspace_owned_by_another_account" });
});

test("knowing an unbound workspace ID does not establish control", async () => {
  const owner = await authenticatedTestUser("workspace-proof-owner@example.com");
  const attacker = await authenticatedTestUser("workspace-proof-attacker@example.com");
  const ownerBinding = workspaceBinding();
  const attackerBinding = workspaceBinding();
  const uuidOnlyTakeover = await request("/api/workspace/bind", {
    body: JSON.stringify({ workspaceId: ownerBinding.workspaceId }),
    headers: jsonHeaders(attacker.headers),
    method: "POST",
  });
  const attemptedTakeover = await bindWorkspace(attacker.headers, {
    bindingSecret: attackerBinding.bindingSecret,
    workspaceId: ownerBinding.workspaceId,
  });
  const attackerCredential = await request("/api/workspace/sync-credential", {
    headers: attacker.headers,
    method: "POST",
  });
  const legitimateBind = await bindWorkspace(owner.headers, ownerBinding);

  assert.equal(uuidOnlyTakeover.status, 400);
  assert.deepEqual(await uuidOnlyTakeover.json(), { error: "invalid_workspace_binding" });
  assert.equal(attemptedTakeover.status, 403);
  assert.deepEqual(await attemptedTakeover.json(), { error: "workspace_control_required" });
  assert.equal(attackerCredential.status, 404);
  assert.equal(legitimateBind.status, 200);
  assert.equal((await workspaceBody(legitimateBind)).workspaceId, ownerBinding.workspaceId);
});

test("workspace endpoints reject missing authentication and malformed bindings", async () => {
  const unauthorized = await request("/api/workspace", { method: "POST" });
  const { headers } = await authenticatedTestUser("workspace-invalid@example.com");
  const malformed = await request("/api/workspace/bind", {
    body: JSON.stringify({ bindingSecret: crypto.randomUUID(), workspaceId: "not-a-workspace" }),
    headers: jsonHeaders(headers),
    method: "POST",
  });
  const invalidJson = await request("/api/workspace/bind", {
    body: "{",
    headers: jsonHeaders(headers),
    method: "POST",
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(malformed.status, 400);
  assert.equal(invalidJson.status, 400);
});

type WorkspaceBinding = { bindingSecret: string; workspaceId: string };

async function bindWorkspace(headers: Headers, binding: WorkspaceBinding) {
  return request("/api/workspace/bind", {
    body: JSON.stringify(binding),
    headers: jsonHeaders(headers),
    method: "POST",
  });
}

function workspaceBinding(): WorkspaceBinding {
  const bindingSecret = crypto.randomUUID();
  return { bindingSecret, workspaceId: workspaceIdForBindingSecret(bindingSecret) };
}

function request(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${apiOrigin}${path}`, init));
}

function jsonHeaders(headers: Headers) {
  const result = new Headers(headers);
  result.set("content-type", "application/json");
  return result;
}

async function workspaceBody(response: Response) {
  return response.json<{ createdAt: string; workspaceId: string }>();
}
