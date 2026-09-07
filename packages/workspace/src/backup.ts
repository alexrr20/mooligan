import { Schema } from "effect";

import { deckEntrySchema, deckMetadataSchema } from "./deck-contract.ts";
import { profileSettingsSchema } from "./profile-contract.ts";

export const workspaceBackupFormat = "mooligan-workspace";
export const workspaceBackupVersion = 5;
export const workspaceBackupMaxBytes = 50 * 1024 * 1024;
export const workspaceBackupMaxCollectionLots = 100_000;
export const workspaceBackupMaxSpoilerDecisions = 100_000;

const Identifier = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(128),
  Schema.filter((value) => value.trim() === value, {
    message: () => "Identifiers cannot start or end with whitespace.",
  }),
);
const Quantity = Schema.Int.pipe(
  Schema.positive(),
  Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const Finish = Schema.Literal("nonfoil", "foil", "etched", "glossy");
const CardLanguage = Schema.Literal(
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ja",
  "ko",
  "ru",
  "zhs",
  "zht",
  "he",
  "la",
  "grc",
  "ar",
  "sa",
  "ph",
);
const CardCondition = Schema.Literal(
  "near-mint",
  "lightly-played",
  "moderately-played",
  "heavily-played",
  "damaged",
);
const Money = Schema.Struct({
  amountMinor: Schema.Int.pipe(
    Schema.nonNegative(),
    Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
  currency: Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/u)),
});
const AcquiredAt = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.filter(isValidDateTime, { message: () => "Acquisition time must use ISO 8601." }),
);

const CollectionLot = Schema.Struct({
  acquiredAt: Schema.optional(AcquiredAt),
  condition: CardCondition,
  finish: Finish,
  id: Identifier,
  language: CardLanguage,
  locationId: Schema.optional(Identifier),
  notes: Schema.optional(Schema.String),
  printingId: Identifier,
  quantity: Quantity,
  unitCost: Schema.optional(Money),
});

const SpoilerDecision = Schema.Struct({
  scope: Schema.Literal("printing", "release"),
  state: Schema.Literal("protect", "reveal"),
  targetId: Identifier,
});

const CollectionLots = Schema.Array(CollectionLot).pipe(
  Schema.maxItems(workspaceBackupMaxCollectionLots),
  Schema.filter(hasUniqueCollectionLotIds, {
    message: () => "Collection lot IDs must be unique.",
  }),
  Schema.filter(hasUniqueUnattributedHoldingKeys, {
    message: () => "Unattributed collection Holdings must be unique.",
  }),
);

const SpoilerDecisions = Schema.Array(SpoilerDecision).pipe(
  Schema.maxItems(workspaceBackupMaxSpoilerDecisions),
  Schema.filter(hasUniqueSpoilerTargets, {
    message: () => "Spoiler decision targets must be unique.",
  }),
);

const Deck = Schema.Struct({
  ...deckMetadataSchema.fields,
  entries: Schema.Array(deckEntrySchema).pipe(
    Schema.maxItems(10_000),
    Schema.filter(
      (entries) =>
        new Set(entries.map(({ id }) => id)).size === entries.length &&
        new Set(
          entries.map(({ printingId, finish, section }) =>
            [printingId, finish, section].join("\0"),
          ),
        ).size === entries.length,
      { message: () => "Deck entry IDs and slots must be unique." },
    ),
  ),
});

export const workspaceBackupSchema = Schema.Struct({
  profile: profileSettingsSchema,
  decks: Schema.Array(Deck).pipe(
    Schema.maxItems(10_000),
    Schema.filter(
      (decks) => {
        const entries = decks.flatMap(({ entries }) => entries);
        return (
          new Set(decks.map(({ id }) => id)).size === decks.length &&
          new Set(entries.map(({ id }) => id)).size === entries.length
        );
      },
      { message: () => "Deck IDs and entry IDs must be unique across the workspace." },
    ),
  ),
  collectionLots: CollectionLots,
  format: Schema.Literal(workspaceBackupFormat),
  spoilers: Schema.Struct({
    decisions: SpoilerDecisions,
    policy: Schema.Literal("protect", "show"),
    resetGeneration: Schema.Int.pipe(
      Schema.nonNegative(),
      Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
    ),
  }),
  version: Schema.Literal(workspaceBackupVersion),
});

export type WorkspaceBackup = typeof workspaceBackupSchema.Type;
export type WorkspaceBackupCollectionLot = typeof CollectionLot.Type;
export type WorkspaceBackupSpoilerDecision = typeof SpoilerDecision.Type;

function isValidDateTime(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function hasUniqueCollectionLotIds(lots: readonly WorkspaceBackupCollectionLot[]) {
  return new Set(lots.map(({ id }) => id)).size === lots.length;
}

function hasUniqueSpoilerTargets(decisions: readonly WorkspaceBackupSpoilerDecision[]) {
  return (
    new Set(decisions.map(({ scope, targetId }) => `${scope}\0${targetId}`)).size ===
    decisions.length
  );
}

function hasUniqueUnattributedHoldingKeys(lots: readonly WorkspaceBackupCollectionLot[]) {
  const keys = lots
    .filter(
      ({ acquiredAt, locationId, notes, unitCost }) =>
        acquiredAt === undefined &&
        locationId === undefined &&
        notes === undefined &&
        unitCost === undefined,
    )
    .map(({ condition, finish, language, printingId }) =>
      [printingId, finish, language, condition].join("\0"),
    );

  return new Set(keys).size === keys.length;
}
