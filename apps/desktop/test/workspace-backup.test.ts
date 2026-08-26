import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { workspaceBackupMaxBytes, type WorkspaceBackup } from "@mooligan/workspace/backup";

import {
  parseWorkspaceBackup,
  readUtf8FileWithinLimit,
  serializeWorkspaceBackup,
} from "../electron/workspace/backup.ts";
import { WorkspaceRegistry } from "../electron/workspace/registry.ts";

const backup: WorkspaceBackup = {
  collectionLots: [
    {
      acquiredAt: "2026-08-01T10:00:00.000Z",
      condition: "near-mint",
      finish: "foil",
      id: "lot-stable-id",
      language: "en",
      notes: "Draft night",
      printingId: "printing-1",
      quantity: 2,
      unitCost: { amountMinor: 125, currency: "EUR" },
    },
  ],
  format: "mooligan-workspace",
  spoilers: {
    decisions: [
      { scope: "printing", state: "reveal", targetId: "preview-printing" },
      { scope: "release", state: "protect", targetId: "preview-release" },
    ],
    policy: "show",
    resetGeneration: 3,
  },
  version: 3,
};

void test("version 3 backups round trip without device or account metadata", () => {
  const parsed = parseWorkspaceBackup(serializeWorkspaceBackup(backup));

  assert.deepEqual(parsed, backup);
  assert.equal(Object.hasOwn(parsed, "clientId"), false);
  assert.equal(Object.hasOwn(parsed, "workspaceId"), false);
  assert.equal(Object.hasOwn(parsed, "motion"), false);
  assert.equal(Object.hasOwn(parsed, "account"), false);
});

void test("old backup versions and unknown fields are rejected", () => {
  assert.throws(
    () => parseWorkspaceBackup(JSON.stringify({ ...backup, version: 2 })),
    /invalid or exceeds a limit/u,
  );
  assert.throws(
    () => parseWorkspaceBackup(JSON.stringify({ ...backup, deviceId: "device-one" })),
    /invalid or exceeds a limit/u,
  );
  assert.throws(
    () =>
      parseWorkspaceBackup(
        JSON.stringify({
          ...backup,
          spoilers: { ...backup.spoilers, credentials: "secret" },
        }),
      ),
    /invalid or exceeds a limit/u,
  );
});

void test("restore registry entries stay inactive until verification succeeds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-backup-restore-"));

  try {
    const registry = new WorkspaceRegistry(directory);
    const original = registry.bootstrap();
    const failed = registry.beginRestore();

    assert.notEqual(failed.workspaceId, original.workspaceId);
    assert.equal(registry.bootstrap().workspaceId, original.workspaceId);
    assert.throws(() => registry.beginRestore(), /already in progress/u);

    registry.cancelRestore(failed.workspaceId);
    assert.deepEqual(registry.bootstrap(), original);

    const restored = registry.beginRestore();
    assert.equal(registry.bootstrap().workspaceId, original.workspaceId);
    assert.equal(registry.accountId(restored.workspaceId), null);
    registry.activateRestore(restored.workspaceId);
    assert.equal(registry.bootstrap().workspaceId, restored.workspaceId);
    registry.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("native backup reads stop at the 50 MiB limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-backup-limit-"));
  const path = join(directory, "backup.json");

  try {
    await writeFile(path, "{}", "utf8");
    assert.equal(await readUtf8FileWithinLimit(path), "{}");

    await truncate(path, workspaceBackupMaxBytes + 1);
    await assert.rejects(readUtf8FileWithinLimit(path), /too large/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("legacy workspace persistence is absent from desktop source", async () => {
  const workspaceDirectory = new URL("../electron/workspace/", import.meta.url);

  for (const obsoleteFile of ["mutations.ts", "preferences.ts", "store.ts"]) {
    await assert.rejects(access(new URL(obsoleteFile, workspaceDirectory)));
  }

  const sourceFiles = (await readdir(workspaceDirectory)).filter((name) => name.endsWith(".ts"));
  const source = (
    await Promise.all(
      sourceFiles.map((name) => readFile(new URL(name, workspaceDirectory), "utf8")),
    )
  ).join("\n");

  assert.doesNotMatch(source, /WorkspaceStore|WorkspaceLegacyBackup|card_lists|preferences:/u);
  assert.doesNotMatch(source, /BackupSchema.*version.*(?:1|2)/u);
});
