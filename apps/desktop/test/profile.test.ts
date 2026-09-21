import assert from "node:assert/strict";
import { test } from "node:test";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise, StoreInternalsSymbol } from "@livestore/livestore";
import { normalizeScryfallCardDetail } from "@mooligan/domain/catalog-detail";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import { Effect, Schema } from "effect";
import { workspaceBackupSchema } from "@mooligan/workspace/backup";
import {
  emptyProfile,
  events,
  profileQuery,
  readProfile,
  workspaceSchema,
  workspaceSyncedEventSchema,
} from "@mooligan/workspace/schema";

import type { AuthSnapshot, WorkspaceRuntime } from "../shared/desktop-api.ts";
import { canAccessProfile } from "../src/features/profile/profile-access.ts";
import {
  changeProfileBanner,
  featureProfileCard,
} from "@mooligan/workspace/client/profile-mutations";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";

const signedIn: AuthSnapshot = {
  pendingAuth: false,
  status: "signed-in",
  user: { id: "owner", name: "Alex", email: "alex@example.com", image: null },
};
const runtime: WorkspaceRuntime = {
  clientId: "device",
  workspaceId: "workspace",
  sync: null,
  syncIssue: null,
  workspaces: [
    {
      active: true,
      accountAssociation: "account",
      label: "My workspace",
      workspaceId: "workspace",
    },
  ],
};

void test("profiles require sign-in and the active account workspace", () => {
  assert.equal(canAccessProfile(signedIn, runtime), true);
  for (const status of [
    "signed-out",
    "session-unavailable",
    "protected-storage-unavailable",
  ] as const) {
    assert.equal(canAccessProfile({ ...signedIn, status }, runtime), false);
  }
  assert.equal(canAccessProfile({ ...signedIn, user: null }, runtime), false);
  assert.equal(
    canAccessProfile(signedIn, {
      ...runtime,
      workspaces: [{ ...runtime.workspaces[0]!, accountAssociation: "unbound" }],
    }),
    false,
  );
  assert.equal(canAccessProfile(signedIn, { ...runtime, workspaceId: "different" }), false);
});

void test("four featured cards and banner changes persist through snapshot and backup restore", async () => {
  const source = await openStore("profile-source");
  const restored = await openStore("profile-restored");
  try {
    assert.deepEqual(readProfile(source.query(profileQuery)), emptyProfile);
    for (let index = 0; index < 4; index++) {
      const printingId = `card-${index}`;
      source.commit(
        events.collectionCopiesAdded({
          additionId: `add-${index}`,
          lot: {
            acquiredAt: null,
            condition: "near-mint",
            finish: "nonfoil",
            id: `lot-${index}`,
            language: "en",
            locationId: null,
            notes: null,
            printingId,
            quantity: 1,
            unitCost: null,
          },
        }),
      );
      await featureProfileCard(source, visible, index, printingId);
    }
    await changeProfileBanner(source, visible, "banner-not-owned");
    assert.deepEqual(readProfile(source.query(profileQuery)), {
      bannerPrintingId: "banner-not-owned",
      featuredPrintingIds: ["card-0", "card-1", "card-2", "card-3"],
    });
    await assert.rejects(featureProfileCard(source, visible, 4, "card-0"), /four/);
    await assert.rejects(featureProfileCard(source, visible, 1, "card-0"), /already featured/);
    await assert.rejects(featureProfileCard(source, visible, 0, "not-owned"), /currently own/);

    const backup = Schema.decodeUnknownSync(workspaceBackupSchema)(
      JSON.parse(JSON.stringify(createWorkspaceBackup(source))),
    );
    await restoreWorkspaceBackup(restored, backup);
    assert.deepEqual(
      readProfile(restored.query(profileQuery)),
      readProfile(source.query(profileQuery)),
    );
    const reopened = await createStorePromise({
      adapter: makeInMemoryAdapter({
        importSnapshot: await source[StoreInternalsSymbol].clientSession.leaderThread.export.pipe(
          Effect.runPromise,
        ),
      }),
      disableDevtools: true,
      schema: workspaceSchema,
      storeId: "profile-reopened",
    });
    try {
      assert.deepEqual(readProfile(reopened.query(profileQuery)), backup.profile);
    } finally {
      await reopened.shutdownPromise();
    }

    await featureProfileCard(restored, visible, 1, null);
    await changeProfileBanner(restored, visible, null);
    assert.deepEqual(readProfile(restored.query(profileQuery)), {
      bannerPrintingId: null,
      featuredPrintingIds: ["card-0", null, "card-2", "card-3"],
    });
  } finally {
    await Promise.all([source.shutdownPromise(), restored.shutdownPromise()]);
  }
});

void test("profile selection rejects hidden cards and rechecks ownership after catalog reads", async () => {
  const store = await openStore("profile-validation");
  try {
    store.commit(
      events.collectionCopiesAdded({
        additionId: "add",
        lot: {
          acquiredAt: null,
          condition: "near-mint",
          finish: "nonfoil",
          id: "lot",
          language: "en",
          locationId: null,
          notes: null,
          printingId: "owned",
          quantity: 1,
          unitCost: null,
        },
      }),
    );
    await assert.rejects(
      featureProfileCard(store, async () => null, 0, "owned"),
      /unavailable or protected/,
    );
    await assert.rejects(
      changeProfileBanner(store, async () => null, "missing"),
      /no available banner/,
    );
    await assert.rejects(
      changeProfileBanner(store, (id) => visible(id, false), "no-art"),
      /no available banner/,
    );
    await assert.rejects(
      featureProfileCard(
        store,
        async (id) => {
          store.commit(
            events.collectionLotRemoved({ lotId: "lot", removalId: "removed-while-reading" }),
          );
          return visible(id);
        },
        0,
        "owned",
      ),
      /currently own/,
    );
    assert.deepEqual(readProfile(store.query(profileQuery)), emptyProfile);
  } finally {
    await store.shutdownPromise();
  }
});

void test("sync rejects more than four slots and duplicate featured printings", () => {
  const decode = Schema.decodeUnknownSync(workspaceSyncedEventSchema);
  for (const ids of [["a", "b", "c", "d", "e"], ["a", "a", null, null], [null]]) {
    assert.throws(() =>
      decode({
        name: events.profileChanged.name,
        args: { bannerPrintingId: null, featuredPrintingIds: ids },
      }),
    );
  }
  assert.doesNotThrow(() => decode({ name: events.profileChanged.name, args: emptyProfile }));
});

async function visible(id: string, art = true): Promise<CatalogPrintingResult> {
  return {
    status: "visible",
    visibility: { reason: "released" },
    detail: normalizeScryfallCardDetail({
      id,
      object: "card",
      name: id,
      collector_number: "1",
      rarity: "rare",
      set: "test",
      set_id: "test",
      set_name: "Test",
      type_line: "Creature",
      image_uris: {
        normal: `https://cards.scryfall.io/normal/front/${id}.jpg`,
        art_crop: art ? `https://cards.scryfall.io/art_crop/front/${id}.jpg` : undefined,
      },
    }),
  };
}

function openStore(storeId: string) {
  return createStorePromise({
    adapter: makeInMemoryAdapter({ clientId: `client-${storeId}` }),
    disableDevtools: true,
    schema: workspaceSchema,
    storeId,
  });
}
