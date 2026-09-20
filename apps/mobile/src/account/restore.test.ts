import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceRegistry } from "@mooligan/account/registry";
import { expect, test } from "vite-plus/test";
import { MobileAccount } from "./mobile-account";

test("restoring a mobile backup activates a separate unbound workspace and keeps the original", async () => {
  const registry = new WorkspaceRegistry(new DatabaseSync(":memory:"), randomUUID);
  const account = new MobileAccount(
    null,
    registry,
    async (runtime) => ({
      id: runtime.workspaceId,
      close: async () => undefined,
      observeConnection: () => () => undefined,
    }),
    "1.0.0",
    null,
  );
  try {
    await account.initialize();
    const original = account.getSnapshot().runtime.workspaceId;
    let restored: string | undefined;
    await account.restoreWorkspace(async (workspace) => {
      restored = workspace.id;
    });
    expect(account.getSnapshot().runtime.workspaceId).toBe(restored);
    expect(restored).not.toBe(original);
    expect(registry.accountId(restored!)).toBeNull();
    expect(registry.workspaces()).toHaveLength(2);
    await account.refresh();
    expect(account.getSnapshot().runtime.workspaceId).toBe(restored);
    await account.selectWorkspace(original);
    expect(account.getSnapshot().runtime.workspaceId).toBe(original);
  } finally {
    account.setActive(false);
    registry.close();
  }
});

test("an interrupted mobile restore leaves the active workspace untouched and discards the pending registry entry", async () => {
  const registry = new WorkspaceRegistry(new DatabaseSync(":memory:"), randomUUID);
  let closed = 0;
  const account = new MobileAccount(
    null,
    registry,
    async () => ({
      close: async () => {
        closed++;
      },
      observeConnection: () => () => undefined,
    }),
    "1.0.0",
    null,
  );
  try {
    await account.initialize();
    const original = account.getSnapshot().runtime.workspaceId;
    await account.restoreWorkspace(async () => {
      throw new Error("Backup verification failed");
    });
    expect(account.getSnapshot().runtime.workspaceId).toBe(original);
    expect(account.getSnapshot().error).toBe("Backup verification failed");
    expect(registry.workspaces()).toHaveLength(1);
    expect(closed).toBe(1);
  } finally {
    account.setActive(false);
    registry.close();
  }
});
