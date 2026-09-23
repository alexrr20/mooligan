import { Schema } from "effect";

import {
  CollectionLotSchema,
  collectionHoldingKey,
  isUnattributedLot,
} from "./collection-contract.ts";
import { DeckSchema } from "./deck-contract.ts";
import { EnabledPriceProvidersSchema, PriceCurrencySchema } from "./price-preference-contract.ts";
import { ProfileSettingsSchema } from "./profile-contract.ts";
import {
  SpoilerDecisionSchema,
  SpoilerGenerationSchema,
  SpoilerPolicySchema,
} from "./spoiler-contract.ts";
import { CardTagSchema, TagAssignmentSchema, TagTemplateSchema } from "./tag-contract.ts";

export const workspaceBackupFormat = "mooligan-workspace";
export const workspaceBackupVersion = 9;
export const workspaceBackupMaxBytes = 50 * 1024 * 1024;
export const workspaceBackupMaxCollectionLots = 100_000;
export const workspaceBackupMaxSpoilerDecisions = 100_000;

const BackupSpoilerDecisionSchema = SpoilerDecisionSchema.pick("scope", "state", "targetId");

export const workspaceBackupSchema = Schema.Struct({
  cardTags: Schema.Array(CardTagSchema).pipe(
    Schema.maxItems(100_000),
    Schema.filter((tags) => isUnique(tags.map(({ id }) => id))),
  ),
  tagAssignments: Schema.Array(TagAssignmentSchema).pipe(
    Schema.maxItems(500_000),
    Schema.filter((assignments) =>
      isUnique(assignments.map(({ tagId, cardId }) => JSON.stringify([tagId, cardId]))),
    ),
  ),
  tagTemplates: Schema.Array(TagTemplateSchema).pipe(
    Schema.maxItems(10_000),
    Schema.filter((templates) => isUnique(templates.map(({ id }) => id))),
  ),
  priceProviders: EnabledPriceProvidersSchema,
  priceCurrency: PriceCurrencySchema,
  profile: ProfileSettingsSchema,
  decks: Schema.Array(DeckSchema).pipe(
    Schema.maxItems(10_000),
    Schema.filter(
      (decks) =>
        isUnique(decks.map(({ id }) => id)) &&
        isUnique(decks.flatMap(({ entries }) => entries.map(({ id }) => id))),
      { message: () => "Deck IDs and entry IDs must be unique across the workspace." },
    ),
  ),
  collectionLots: Schema.Array(CollectionLotSchema).pipe(
    Schema.maxItems(workspaceBackupMaxCollectionLots),
    Schema.filter((lots) => isUnique(lots.map(({ id }) => id)), {
      message: () => "Collection lot IDs must be unique.",
    }),
    Schema.filter((lots) => isUnique(lots.filter(isUnattributedLot).map(collectionHoldingKey)), {
      message: () => "Unattributed collection Holdings must be unique.",
    }),
  ),
  format: Schema.Literal(workspaceBackupFormat),
  spoilers: Schema.Struct({
    decisions: Schema.Array(BackupSpoilerDecisionSchema).pipe(
      Schema.maxItems(workspaceBackupMaxSpoilerDecisions),
      Schema.filter(
        (decisions) => isUnique(decisions.map(({ scope, targetId }) => `${scope}\0${targetId}`)),
        { message: () => "Spoiler decision targets must be unique." },
      ),
    ),
    policy: SpoilerPolicySchema,
    resetGeneration: SpoilerGenerationSchema,
  }),
  version: Schema.Literal(workspaceBackupVersion),
}).pipe(
  Schema.filter(
    (backup) => {
      const deckIds = new Set(backup.decks.map(({ id }) => id));
      const tagIds = new Set(backup.cardTags.map(({ id }) => id));
      return (
        backup.cardTags.every(({ deckId }) => deckId === null || deckIds.has(deckId)) &&
        backup.tagAssignments.every(({ tagId }) => tagIds.has(tagId))
      );
    },
    {
      message: () =>
        "Tags must reference existing decks, and assignments must reference existing tags.",
    },
  ),
);

export type WorkspaceBackup = typeof workspaceBackupSchema.Type;

function isUnique(values: readonly string[]) {
  return new Set(values).size === values.length;
}
