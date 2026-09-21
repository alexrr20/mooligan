import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceRegistry } from "@mooligan/account/registry";
import { expect, test, vi } from "vite-plus/test";
import { MobileAccount } from "./mobile-account";

test("restoring a mobile backup adopts the open workspace without a fallible reopen", async () => {
  const registry = new WorkspaceRegistry(new DatabaseSync(":memory:"), randomUUID);
  let restored: string | undefined;
  const closed: string[] = [];
  const stopped: string[] = [];
  const account = new MobileAccount(
    null,
    registry,
    async (runtime) => {
      if (runtime.workspaceId === restored) throw new Error("The restored SQLite cannot reopen.");
      return {
        id: runtime.workspaceId,
        close: async () => {
          closed.push(runtime.workspaceId);
        },
        observeConnection: () => () => {
          stopped.push(runtime.workspaceId);
        },
      };
    },
    "1.0.0",
    null,
  );
  try {
    await account.initialize();
    const original = account.getSnapshot().runtime.workspaceId;
    await account.restoreWorkspace(async (workspace) => {
      restored = workspace.id;
      expect(registry.bootstrap().workspaceId).toBe(original);
      expect(account.getSnapshot().workspace?.id).toBe(original);
      expect(closed).toEqual([]);
      expect(stopped).toEqual([]);
    });
    expect(account.getSnapshot().error).toBeNull();
    expect(account.getSnapshot().runtime.workspaceId).toBe(restored);
    expect(account.getSnapshot().workspace?.id).toBe(restored);
    expect(registry.bootstrap().workspaceId).toBe(restored);
    expect(closed).toEqual([original]);
    expect(stopped).toEqual([original]);
    expect(restored).not.toBe(original);
    expect(registry.accountId(restored!)).toBeNull();
    expect(registry.workspaces()).toHaveLength(2);
    await account.refresh();
    expect(account.getSnapshot().runtime.workspaceId).toBe(restored);
    expect(account.getSnapshot().error).toBeNull();
    await account.selectWorkspace(original);
    expect(account.getSnapshot().runtime.workspaceId).toBe(original);
  } finally {
    account.setActive(false);
    registry.close();
  }
});

test.each(["open", "activate"])(
  "a failed restore %s retains the open workspace",
  async (failure) => {
    const registry = new WorkspaceRegistry(new DatabaseSync(":memory:"), randomUUID);
    const original = registry.bootstrap().workspaceId;
    const close = vi.fn(async () => undefined);
    const stop = vi.fn();
    const restoredClose = vi.fn(async () => undefined);
    let pending: string | undefined;
    const account = new MobileAccount(
      null,
      registry,
      async (runtime) => {
        if (runtime.workspaceId !== original) {
          pending = runtime.workspaceId;
          if (failure === "open") throw new Error("Restore failed.");
          return { close: restoredClose, observeConnection: () => vi.fn() };
        }
        return { close, observeConnection: () => stop };
      },
      "1.0.0",
      null,
    );
    const activate = vi.spyOn(registry, "activateRestore");
    if (failure === "activate") {
      activate.mockImplementation(() => {
        throw new Error("Restore failed.");
      });
    }
    try {
      await account.initialize();
      const workspace = account.getSnapshot().workspace;
      await account.restoreWorkspace(async () => undefined);
      expect(account.getSnapshot().error).toBe("Restore failed.");
      expect(account.getSnapshot().runtime.workspaceId).toBe(original);
      expect(account.getSnapshot().workspace).toBe(workspace);
      expect(registry.bootstrap().workspaceId).toBe(original);
      expect(registry.workspaces()).toHaveLength(1);
      expect(() => registry.workspace(pending!)).toThrow();
      expect(close).not.toHaveBeenCalled();
      expect(stop).not.toHaveBeenCalled();
      expect(restoredClose).toHaveBeenCalledTimes(failure === "activate" ? 1 : 0);
      const next = registry.beginRestore();
      registry.cancelRestore(next.workspaceId);
      await account.refresh();
      expect(account.getSnapshot().workspace).toBe(workspace);
    } finally {
      activate.mockRestore();
      account.setActive(false);
      registry.close();
    }
  },
);

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
