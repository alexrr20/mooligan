import { TagTemplateSchema, type CardTag, type TagAssignment } from "@mooligan/domain/tags";
import type { DeckEntry } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import type { tables } from "../schema.ts";

export function materializeTagTemplates(rows: readonly (typeof tables.tagTemplates.Type)[]) {
  return rows.map(({ deleted: _deleted, categories, ...template }) =>
    TagTemplateSchema.parse({ ...template, categories: JSON.parse(categories) }),
  );
}

export function tagsForDeck(tags: readonly CardTag[], deckId: string, includeGlobal = true) {
  return tags
    .filter((tag) => tag.deckId === deckId || (includeGlobal && tag.deckId === null))
    .toSorted(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        Number(a.deckId === null) - Number(b.deckId === null) ||
        a.id.localeCompare(b.id),
    );
}

/** Protected and unavailable printings never expose their identity through tags. */
export function cardIdentity(result: CatalogPrintingResult | null | undefined) {
  return result?.status === "visible" ? result.detail.card.id : null;
}

export function indexCardTags(tags: readonly CardTag[], assignments: readonly TagAssignment[]) {
  const definitions = new Map(tags.map((tag) => [tag.id, tag]));
  const byCard = new Map<string, CardTag[]>();
  for (const { tagId, cardId } of assignments) {
    const tag = definitions.get(tagId);
    if (!tag) continue;
    const current = byCard.get(cardId) ?? [];
    current.push(tag);
    byCard.set(cardId, current);
  }
  return byCard;
}

export function groupEntriesByTag(
  entries: readonly DeckEntry[],
  printings: ReadonlyMap<string, CatalogPrintingResult | null>,
  tags: readonly CardTag[],
  assignments: readonly TagAssignment[],
) {
  const byCard = indexCardTags(tags, assignments);
  const groups = new Map<string, { id: string; tag: CardTag; entries: DeckEntry[] }>(
    tags.map((tag) => [tag.id, { id: tag.id, tag, entries: [] }]),
  );
  const untagged: DeckEntry[] = [];
  for (const entry of entries) {
    const identity = cardIdentity(printings.get(entry.printingId));
    const assigned = identity ? (byCard.get(identity) ?? []) : [];
    if (!assigned.length) untagged.push(entry);
    for (const tag of assigned) groups.get(tag.id)?.entries.push(entry);
  }
  return [...groups.values(), { id: "untagged", tag: null, entries: untagged }].map((group) => ({
    ...group,
    quantity: group.entries.reduce((sum, entry) => sum + entry.quantity, 0),
  }));
}
