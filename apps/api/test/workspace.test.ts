import assert from "node:assert/strict";

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
  const workspaceId = crypto.randomUUID();
  const bound = await bindWorkspace(headers, workspaceId);
  const repeated = await bindWorkspace(headers, workspaceId);
  const conflict = await bindWorkspace(headers, crypto.randomUUID());

  assert.equal(bound.status, 200);
  assert.equal((await workspaceBody(bound)).workspaceId, workspaceId);
  assert.equal(repeated.status, 200);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "account_has_workspace" });
});

test("a workspace cannot bind to a second account", async () => {
  const owner = await authenticatedTestUser("workspace-owner@example.com");
  const other = await authenticatedTestUser("workspace-other@example.com");
  const workspaceId = crypto.randomUUID();

  assert.equal((await bindWorkspace(owner.headers, workspaceId)).status, 200);
  const conflict = await bindWorkspace(other.headers, workspaceId);

  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "workspace_owned_by_another_account" });
});

test("workspace endpoints reject missing authentication and malformed bindings", async () => {
  const unauthorized = await request("/api/workspace", { method: "POST" });
  const { headers } = await authenticatedTestUser("workspace-invalid@example.com");
  const malformed = await request("/api/workspace/bind", {
    body: JSON.stringify({ workspaceId: "not-a-workspace" }),
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

async function bindWorkspace(headers: Headers, workspaceId: string) {
  return request("/api/workspace/bind", {
    body: JSON.stringify({ workspaceId }),
    headers: jsonHeaders(headers),
    method: "POST",
  });
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
