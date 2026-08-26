import assert from "node:assert/strict";
import { test } from "node:test";

import { Schema } from "effect";

import {
  workspaceBackupMaxBytes,
  workspaceBackupSchema,
  type WorkspaceBackup,
} from "../src/backup.ts";

const decodeBackup = Schema.decodeUnknownSync(workspaceBackupSchema, {
  onExcessProperty: "error",
});

void test("backup v3 validation is strict and rejects old versions", () => {
  const backup = fixture();

  assert.deepEqual(decodeBackup(backup), backup);
  assert.throws(() => decodeBackup({ ...backup, version: 2 }));
  assert.throws(() => decodeBackup({ ...backup, deviceId: "device-one" }));
  assert.throws(() =>
    decodeBackup({
      ...backup,
      spoilers: { ...backup.spoilers, credentials: "secret" },
    }),
  );
});

void test("backup v3 rejects duplicate state and invalid collection values", () => {
  const backup = fixture();

  assert.throws(() =>
    decodeBackup({
      ...backup,
      collectionLots: [backup.collectionLots[0], backup.collectionLots[0]],
    }),
  );
  assert.throws(() =>
    decodeBackup({
      ...backup,
      spoilers: {
        ...backup.spoilers,
        decisions: [backup.spoilers.decisions[0], backup.spoilers.decisions[0]],
      },
    }),
  );
  assert.throws(() =>
    decodeBackup({
      ...backup,
      collectionLots: [{ ...backup.collectionLots[0], quantity: 0 }],
    }),
  );
});

void test(
  "backup v3 round trips 100,000 lots and 100,000 spoiler decisions within 50 MiB",
  { timeout: 60_000 },
  () => {
    const largeBackup = {
      collectionLots: Array.from({ length: 100_000 }, (_, index) => ({
        condition: "near-mint" as const,
        finish: "nonfoil" as const,
        id: `lot-${index}`,
        language: "en" as const,
        printingId: `printing-${index}`,
        quantity: 1,
      })),
      format: "mooligan-workspace" as const,
      spoilers: {
        decisions: Array.from({ length: 100_000 }, (_, index) => ({
          scope: "printing" as const,
          state: "reveal" as const,
          targetId: `printing-${index}`,
        })),
        policy: "protect" as const,
        resetGeneration: 12,
      },
      version: 3 as const,
    } satisfies WorkspaceBackup;
    const serialized = JSON.stringify(largeBackup);

    assert.ok(Buffer.byteLength(serialized, "utf8") <= workspaceBackupMaxBytes);
    const restored = decodeBackup(JSON.parse(serialized));
    assert.equal(restored.collectionLots.length, 100_000);
    assert.equal(restored.spoilers.decisions.length, 100_000);
    assert.deepEqual(restored.collectionLots.at(-1), largeBackup.collectionLots.at(-1));
    assert.deepEqual(restored.spoilers.decisions.at(-1), largeBackup.spoilers.decisions.at(-1));
  },
);

function fixture(): WorkspaceBackup {
  return {
    collectionLots: [
      {
        condition: "near-mint",
        finish: "nonfoil",
        id: "lot-one",
        language: "en",
        printingId: "printing-one",
        quantity: 1,
      },
    ],
    format: "mooligan-workspace",
    spoilers: {
      decisions: [{ scope: "printing", state: "reveal", targetId: "printing-one" }],
      policy: "protect",
      resetGeneration: 0,
    },
    version: 3,
  };
}
