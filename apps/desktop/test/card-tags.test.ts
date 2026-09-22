import assert from "node:assert/strict";
import { test } from "node:test";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import { Schema } from "effect";
import { workspaceBackupSchema } from "@mooligan/workspace/backup";
import {
  cardTagsQuery,
  tagAssignmentsQuery,
  tagTemplatesQuery,
  events,
  workspaceSchema,
  workspaceSyncedEventSchema,
} from "@mooligan/workspace/schema";
import { createDeckMutations } from "@mooligan/workspace/client/deck-mutations";
import { createTagMutations } from "@mooligan/workspace/client/tag-mutations";
import { cardIdentity, groupEntriesByTag, tagsForDeck } from "@mooligan/workspace/client/tag-state";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";
import { normalizeScryfallCardDetail } from "@mooligan/domain/catalog-detail";
import { ScryfallCardDownloadSchema } from "@mooligan/domain/catalog-download";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";

void test("card tags keep scopes, templates, duplication, and backups intact without an account", async () => {
  const source = await openStore("tag-source");
  const restored = await openStore("tag-restored");
  try {
    const decks = createDeckMutations(source, async () => null);
    const deckId = decks.create({
      name: "Roles",
      formatId: "commander",
      tags: [],
      notes: "",
      archived: false,
    });
    const tags = createTagMutations(source);
    const local = tags.create(deckId, { name: " Ramp ", color: "sage" });
    const global = tags.create(null, { name: "Ramp", color: "blue" });
    tags.assign(local, ["sol-ring", "sol-ring"], true);
    tags.assign(global, ["sol-ring", "mana-vault"], true);
    assert.equal(source.query(tagAssignmentsQuery).length, 3);
    assert.throws(() => tags.create(deckId, { name: "rAMP", color: "rose" }), /already exists/u);
    assert.throws(() => tags.create(null, { name: " ", color: "rose" }));
    assert.equal(tagsForDeck(source.query(cardTagsQuery), deckId, false).length, 1);
    tags.update(local, { name: "Mana rocks" });
    tags.update(local, { color: "amber" });
    assert.equal(source.query(cardTagsQuery).find(({ id }) => id === local)?.name, "Mana rocks");
    const template = tags.saveTemplate("Commander", [
      { name: "Mana rocks", color: "sage" },
      { name: "Draw", color: "blue" },
    ]);
    assert.equal(tags.applyTemplate(deckId, template), 1);
    assert.equal(tags.applyTemplate(deckId, template), 0);
    const duplicate = decks.duplicate(deckId);
    const copied = source.query(cardTagsQuery).filter((tag) => tag.deckId === duplicate);
    assert.equal(copied.length, 2);
    assert.ok(copied.every(({ id }) => id !== local));
    assert.equal(
      source.query(tagAssignmentsQuery).filter(({ tagId }) => copied.some(({ id }) => id === tagId))
        .length,
      1,
    );
    const backup = Schema.decodeUnknownSync(workspaceBackupSchema)(createWorkspaceBackup(source));
    await restoreWorkspaceBackup(restored, backup);
    assert.deepEqual(createWorkspaceBackup(restored), createWorkspaceBackup(source));
    assert.throws(() =>
      Schema.decodeUnknownSync(workspaceBackupSchema)({ ...backup, cardTags: [] }),
    );
    tags.assign(global, ["sol-ring"], false);
    assert.ok(
      source
        .query(tagAssignmentsQuery)
        .some(({ tagId, cardId }) => tagId === global && cardId === "mana-vault"),
    );
    decks.remove(deckId);
    source.commit(events.cardsTagged({ tagId: local, cardIds: ["late-card"], assigned: true }));
    source.commit(events.cardTagChanged({ id: local, name: "Stale name" }));
    assert.ok(!source.query(cardTagsQuery).some(({ id }) => id === local));
    assert.ok(!source.query(tagAssignmentsQuery).some(({ tagId }) => tagId === local));
    assert.ok(source.query(cardTagsQuery).some(({ id }) => id === global));
    tags.remove(global);
    source.commit(events.cardsTagged({ tagId: global, cardIds: ["late-card"], assigned: true }));
    assert.ok(!source.query(tagAssignmentsQuery).some(({ tagId }) => tagId === global));
    tags.removeTemplate(template);
    source.commit(
      events.tagTemplateSaved({
        id: template,
        name: "Stale template",
        categories: [{ name: "Draw", color: "blue" }],
      }),
    );
    assert.equal(source.query(tagTemplatesQuery).length, 0);
  } finally {
    await Promise.all([source.shutdownPromise(), restored.shutdownPromise()]);
  }
});

void test("tag groups share rules identity, count copies once per category, and conceal protected identities", () => {
  const first = printing("first");
  const second = printing("second");
  const protectedCard: CatalogPrintingResult = {
    status: "protected",
    printingId: "hidden",
    releasedOn: "2027-01-01",
    release: {
      code: "future",
      name: "Future set",
      nextReleaseOn: "2027-01-01",
      rootSetId: "future",
      symbol: { setId: "future" },
    },
  };
  const entries = ["first", "second", "hidden", "missing"].map((printingId) => ({
    id: printingId,
    printingId,
    finish: "nonfoil" as const,
    quantity: 2,
    section: "mainboard" as const,
  }));
  const tags = [
    { id: "ramp", name: "Ramp", deckId: null, color: "sage" as const },
    { id: "draw", name: "Draw", deckId: "deck", color: "blue" as const },
  ];
  const assignments = tags.map(({ id }) => ({ tagId: id, cardId: "shared-card" }));
  const groups = groupEntriesByTag(
    entries,
    new Map([
      ["first", first],
      ["second", second],
      ["hidden", protectedCard],
    ]),
    tags,
    assignments,
  );
  assert.equal(cardIdentity(first), cardIdentity(second));
  assert.equal(cardIdentity(protectedCard), null);
  assert.deepEqual(
    groups.map(({ id, quantity }) => [id, quantity]),
    [
      ["ramp", 4],
      ["draw", 4],
      ["untagged", 4],
    ],
  );
});

void test("tag events enforce scoped Unicode name uniqueness without blocking valid edits", async () => {
  const store = await openStore("tag-name-conflicts");
  try {
    const deckId = createDeckMutations(store, async () => null).create({
      name: "Roles",
      formatId: "casual",
      tags: [],
      notes: "",
      archived: false,
    });
    const tag = { id: "first", name: "Énergie", color: "sage" as const, deckId: null };
    store.commit(
      events.cardTagCreated(tag),
      events.cardTagCreated({ ...tag, id: "collision", name: "éNERGIE" }),
      events.cardTagCreated({ ...tag, id: "local", deckId }),
      events.cardTagCreated({ ...tag, id: "other", name: "Draw" }),
      events.cardTagChanged({ id: "other", name: "énergie", color: "rose" }),
    );
    assert.deepEqual(
      store.query(cardTagsQuery).map(({ id, name, color }) => [id, name, color]),
      [
        ["first", "Énergie", "sage"],
        ["local", "Énergie", "sage"],
        ["other", "Draw", "sage"],
      ],
    );
    store.commit(
      events.cardTagChanged({ id: "first", name: "ÉNERGIE", color: "blue" }),
      events.cardTagChanged({ id: "other", color: "amber" }),
    );
    assert.equal(store.query(cardTagsQuery)[0]?.name, "ÉNERGIE");
    assert.equal(store.query(cardTagsQuery).find(({ id }) => id === "other")?.color, "amber");
    store.commit(
      events.cardTagDeleted({ id: "first" }),
      events.cardTagCreated({ ...tag, id: "reuse" }),
    );
    assert.ok(store.query(cardTagsQuery).some(({ id }) => id === "reuse"));

    const template = {
      id: "first",
      name: "Énergie",
      categories: [{ name: "Draw", color: "blue" as const }],
    };
    store.commit(
      events.tagTemplateSaved(template),
      events.tagTemplateSaved({ ...template, id: "collision", name: "éNERGIE" }),
      events.tagTemplateSaved({ ...template, id: "other", name: "Other" }),
      events.tagTemplateSaved({ ...template, id: "other", name: "énergie" }),
    );
    assert.deepEqual(
      store.query(tagTemplatesQuery).map(({ id, name }) => [id, name]),
      [
        ["first", "Énergie"],
        ["other", "Other"],
      ],
    );
    store.commit(
      events.tagTemplateSaved({
        ...template,
        name: "ÉNERGIE",
        categories: [{ name: "Ramp", color: "sage" }],
      }),
    );
    assert.equal(store.query(tagTemplatesQuery)[0]?.name, "ÉNERGIE");
    assert.deepEqual(JSON.parse(store.query(tagTemplatesQuery)[0]!.categories), [
      { name: "Ramp", color: "sage" },
    ]);
    store.commit(
      events.tagTemplateDeleted({ id: "first" }),
      events.tagTemplateSaved({ ...template, id: "reuse" }),
    );
    assert.ok(store.query(tagTemplatesQuery).some(({ id }) => id === "reuse"));
  } finally {
    await store.shutdownPromise();
  }
});

void test("sync validates tagging payloads", () => {
  const decode = Schema.decodeUnknownSync(workspaceSyncedEventSchema);
  assert.doesNotThrow(() =>
    decode({
      name: events.cardsTagged.name,
      args: { tagId: "tag", cardIds: ["card"], assigned: true },
    }),
  );
  assert.throws(() =>
    decode({
      name: events.cardsTagged.name,
      args: { tagId: "tag", cardIds: [""], assigned: true },
    }),
  );
  assert.throws(() =>
    decode({
      name: events.cardTagCreated.name,
      args: { id: "tag", deckId: null, name: " ", color: "sage" },
    }),
  );
});

function printing(id: string): CatalogPrintingResult {
  return {
    status: "visible",
    visibility: { reason: "released" },
    detail: normalizeScryfallCardDetail(
      ScryfallCardDownloadSchema.parse({
        id,
        oracle_id: "shared-card",
        name: "Sol Ring",
        object: "card",
        collector_number: "1",
        set: "test",
        set_id: "test",
        set_name: "Test",
        rarity: "common",
        type_line: "Artifact",
        cmc: 1,
        layout: "normal",
      }),
    ),
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
