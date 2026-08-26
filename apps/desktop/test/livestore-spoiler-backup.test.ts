import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import {
  events,
  spoilerDecisionsQuery,
  spoilerSettingsQuery,
  workspaceSchema,
} from "@mooligan/workspace/schema";

import type { WorkspaceLegacyBackupSnapshot } from "../shared/desktop-api.ts";
import {
  createWorkspaceBackup,
  restoreSpoilerBackup,
} from "../src/features/workspace/workspace-backup.ts";

const emptyLegacySnapshot: WorkspaceLegacyBackupSnapshot = {
  cardLists: [],
  collectionLots: [],
  decks: [],
  motion: "reduced",
};

void test("staged backup export reads policy and explicit decisions from LiveStore", async () => {
  const store = await openStore("backup-source");
  try {
    store.commit(events.spoilerPolicyChanged({ policy: "show" }));
    store.commit(
      events.spoilerDecisionChanged({
        decisionId: "decision-one",
        generation: 0,
        observedDecisionId: null,
        resetId: "initial",
        scope: "printing",
        state: "reveal",
        targetId: "printing-one",
      }),
    );

    const backup = createWorkspaceBackup(store, emptyLegacySnapshot);
    assert.deepEqual(backup.preferences, { motion: "reduced", spoilerPolicy: "show" });
    assert.deepEqual(backup.spoilerDecisions, [
      { scope: "printing", state: "reveal", targetId: "printing-one" },
    ]);
  } finally {
    await store.shutdownPromise();
  }
});

void test("staged restore commits and verifies spoiler events in a new LiveStore", async () => {
  const store = await openStore("backup-target");
  try {
    restoreSpoilerBackup(store, {
      cardLists: [],
      collectionLots: [],
      decks: [],
      format: "mooligan-workspace",
      preferences: { motion: "system", spoilerPolicy: "protect" },
      spoilerDecisions: [
        { scope: "release", state: "protect", targetId: "release-one" },
        { scope: "printing", state: "reveal", targetId: "printing-one" },
      ],
      version: 2,
    });

    assert.equal(store.query(spoilerSettingsQuery).policy, "protect");
    assert.deepEqual(
      store
        .query(spoilerDecisionsQuery)
        .map(({ scope, state, targetId }) => ({ scope, state, targetId })),
      [
        { scope: "printing", state: "reveal", targetId: "printing-one" },
        { scope: "release", state: "protect", targetId: "release-one" },
      ],
    );
  } finally {
    await store.shutdownPromise();
  }
});

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}
