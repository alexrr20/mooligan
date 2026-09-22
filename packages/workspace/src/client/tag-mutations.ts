import type { Store } from "@livestore/livestore";
import {
  CardTagSchema,
  TagAssignmentSchema,
  TagStyleSchema,
  TagTemplateSchema,
  tagNameKey,
  type TagStyle,
} from "@mooligan/domain/tags";
import {
  cardTagsQuery,
  tagAssignmentsQuery,
  tagTemplatesQuery,
  decksQuery,
  events,
  workspaceSchema,
} from "../schema.ts";
import { materializeTagTemplates } from "./tag-state.ts";

export function createTagMutations(store: Store<typeof workspaceSchema>) {
  function requireDeck(deckId: string | null) {
    if (deckId !== null && !store.query(decksQuery).some(({ id }) => id === deckId))
      throw new Error("This deck is no longer available.");
  }
  function requireTag(id: string) {
    const tag = store.query(cardTagsQuery).find((tag) => tag.id === id);
    if (!tag) throw new Error("This tag has been deleted.");
    requireDeck(tag.deckId);
    return tag;
  }
  function assertUnique(name: string, deckId: string | null, exceptId?: string) {
    if (
      store
        .query(cardTagsQuery)
        .some(
          (tag) =>
            tag.id !== exceptId &&
            tag.deckId === deckId &&
            tagNameKey(tag.name) === tagNameKey(name),
        )
    )
      throw new Error("A tag with this name already exists in this scope.");
  }
  function create(deckId: string | null, style: TagStyle) {
    requireDeck(deckId);
    const tag = CardTagSchema.parse({ ...style, deckId, id: crypto.randomUUID() });
    assertUnique(tag.name, deckId);
    store.commit(events.cardTagCreated(tag));
    return tag.id;
  }
  function applyCategories(deckId: string, categories: readonly TagStyle[]) {
    requireDeck(deckId);
    const parsed = TagTemplateSchema.pick({ categories: true }).parse({ categories }).categories;
    const names = new Set(
      store
        .query(cardTagsQuery)
        .filter((tag) => tag.deckId === deckId)
        .map((tag) => tagNameKey(tag.name)),
    );
    const additions = parsed.filter((tag) => !names.has(tagNameKey(tag.name)));
    if (additions.length)
      store.commit(
        ...additions.map((tag) =>
          events.cardTagCreated({ ...tag, id: crypto.randomUUID(), deckId }),
        ),
      );
    return additions.length;
  }
  return {
    create,
    applyCategories,
    update(id: string, change: Partial<TagStyle>) {
      const tag = requireTag(id);
      const parsed = TagStyleSchema.partial().parse(change);
      assertUnique(parsed.name ?? tag.name, tag.deckId, id);
      store.commit(events.cardTagChanged({ ...parsed, id }));
    },
    remove(id: string) {
      requireTag(id);
      store.commit(events.cardTagDeleted({ id }));
    },
    assign(tagId: string, cardIds: readonly string[], assigned: boolean) {
      requireTag(tagId);
      const ids = [...new Set(cardIds)];
      if (!ids.length) return;
      if (ids.length > 10_000) throw new Error("Tag at most 10,000 cards at once.");
      for (const cardId of ids) TagAssignmentSchema.parse({ tagId, cardId });
      store.commit(events.cardsTagged({ tagId, cardIds: ids, assigned }));
    },
    saveTemplate(name: string, categories: readonly TagStyle[], id: string = crypto.randomUUID()) {
      const template = TagTemplateSchema.parse({ id, name, categories });
      if (
        store
          .query(tagTemplatesQuery)
          .some((row) => row.id !== id && tagNameKey(row.name) === tagNameKey(template.name))
      )
        throw new Error("A template with this name already exists.");
      store.commit(events.tagTemplateSaved(template));
      return id;
    },
    applyTemplate(deckId: string, templateId: string) {
      const template = materializeTagTemplates(store.query(tagTemplatesQuery)).find(
        ({ id }) => id === templateId,
      );
      if (!template) throw new Error("This template has been deleted.");
      return applyCategories(deckId, template.categories);
    },
    removeTemplate(id: string) {
      store.commit(events.tagTemplateDeleted({ id }));
    },
  };
}

export function duplicateDeckTags(
  store: Store<typeof workspaceSchema>,
  sourceId: string,
  targetId: string,
) {
  const assignments = store.query(tagAssignmentsQuery);
  const changes: (
    | ReturnType<typeof events.cardTagCreated>
    | ReturnType<typeof events.cardsTagged>
  )[] = [];
  for (const { deleted: _deleted, ...tag } of store
    .query(cardTagsQuery)
    .filter((tag) => tag.deckId === sourceId)) {
    const id = crypto.randomUUID();
    changes.push(events.cardTagCreated({ ...tag, id, deckId: targetId }));
    const cardIds = assignments.filter(({ tagId }) => tagId === tag.id).map(({ cardId }) => cardId);
    for (let offset = 0; offset < cardIds.length; offset += 10_000)
      changes.push(
        events.cardsTagged({
          tagId: id,
          cardIds: cardIds.slice(offset, offset + 10_000),
          assigned: true,
        }),
      );
  }
  if (changes.length) store.commit(...changes);
}
