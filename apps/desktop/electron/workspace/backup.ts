import { CollectionLotSchema, type CollectionLot } from "@mooligan/domain/collection";
import { DeckEntrySchema, DeckSchema, type Deck } from "@mooligan/domain/decks";
import {
  CardListEntrySchema,
  CardListSchema,
  DesiredPrintingSchema,
  type CardList,
} from "@mooligan/domain/lists";
import { MoneySchema } from "@mooligan/domain/market";
import * as z from "zod";
import type { JSONType } from "zod";

import { PreferencesSchema, type Preferences } from "./preferences.ts";

const BACKUP_FORMAT = "mooligan-workspace";
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_COLLECTION_LOTS = 100_000;
const MAX_DECKS = 10_000;
const MAX_CARD_LISTS = 10_000;
const MAX_ENTRIES = 10_000;

type BackupEntity<Entity> = {
  id: string;
  value: Entity;
};

export type WorkspaceBackup = {
  cardLists: BackupEntity<CardList>[];
  collectionLots: BackupEntity<CollectionLot>[];
  decks: BackupEntity<Deck>[];
  format: typeof BACKUP_FORMAT;
  preferences: Preferences;
  version: typeof BACKUP_VERSION;
};

const StrictCollectionLotSchema = CollectionLotSchema.extend({
  unitCost: MoneySchema.strict().optional(),
}).strict();
const StrictDeckEntrySchema = DeckEntrySchema.strict();
const StrictDeckSchema = DeckSchema.extend({
  entries: z.array(StrictDeckEntrySchema).max(MAX_ENTRIES),
})
  .strict()
  .refine(({ entries }) => hasUniqueEntityIds(entries), {
    message: "Deck entry IDs must be unique.",
  });
const StrictDesiredPrintingSchema = DesiredPrintingSchema.strict();
const StrictCardListEntrySchema = CardListEntrySchema.extend({
  desiredPrinting: StrictDesiredPrintingSchema.optional(),
}).strict();
const StrictCardListSchema = CardListSchema.extend({
  entries: z.array(StrictCardListEntrySchema).max(MAX_ENTRIES),
})
  .strict()
  .refine(({ entries }) => hasUniqueEntityIds(entries), {
    message: "Card list entry IDs must be unique.",
  });

const BackupCollectionLotSchema = z
  .strictObject({ id: z.string(), value: StrictCollectionLotSchema })
  .refine(({ id, value }) => id === value.id, { message: "Collection lot ID mismatch." });
const BackupDeckSchema = z
  .strictObject({ id: z.string(), value: StrictDeckSchema })
  .refine(({ id, value }) => id === value.id, { message: "Deck ID mismatch." });
const BackupCardListSchema = z
  .strictObject({ id: z.string(), value: StrictCardListSchema })
  .refine(({ id, value }) => id === value.id, { message: "Card list ID mismatch." });

const WorkspaceBackupSchema = z.strictObject({
  cardLists: z
    .array(BackupCardListSchema)
    .max(MAX_CARD_LISTS)
    .refine(hasUniqueEntityIds, { message: "Card list IDs must be unique." }),
  collectionLots: z
    .array(BackupCollectionLotSchema)
    .max(MAX_COLLECTION_LOTS)
    .refine(hasUniqueEntityIds, { message: "Collection lot IDs must be unique." }),
  decks: z
    .array(BackupDeckSchema)
    .max(MAX_DECKS)
    .refine(hasUniqueEntityIds, { message: "Deck IDs must be unique." }),
  format: z.literal(BACKUP_FORMAT),
  preferences: PreferencesSchema,
  version: z.literal(BACKUP_VERSION),
});

export function parseWorkspaceBackup(serialized: string): WorkspaceBackup {
  if (Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) {
    throw new TypeError("The workspace backup is invalid or too large.");
  }

  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new TypeError("The workspace backup is not valid JSON.");
  }

  const backup = WorkspaceBackupSchema.safeParse(value);
  if (!backup.success) {
    if (backup.error.issues.some(({ code }) => code === "unrecognized_keys")) {
      throw new TypeError("The workspace backup contains invalid fields.");
    }
    if (backup.error.issues.some(({ message }) => message === "Deck ID mismatch.")) {
      throw new TypeError("The workspace backup deck IDs are invalid.");
    }
    if (backup.error.issues.some(({ path }) => path[0] === "decks")) {
      throw new TypeError("The workspace backup deck is invalid.");
    }
    throw new TypeError("The workspace backup is invalid or exceeds a limit.");
  }

  return backup.data;
}

export function serializeWorkspaceBackup(
  value: Omit<WorkspaceBackup, "format" | "version">,
): string {
  const serialized = `${JSON.stringify(
    {
      ...value,
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
    } satisfies WorkspaceBackup,
    null,
    2,
  )}\n`;

  return JSON.stringify(parseWorkspaceBackup(serialized), null, 2) + "\n";
}

export function validateCollectionLot(value: CollectionLot | JSONType): CollectionLot {
  const result = StrictCollectionLotSchema.safeParse(value);
  if (!result.success) throw new TypeError("The collection lot is invalid.");
  return result.data;
}

export function validateDeck(value: Deck | JSONType): Deck {
  const result = StrictDeckSchema.safeParse(value);
  if (!result.success) throw new TypeError("The deck is invalid.");
  return result.data;
}

export function validateCardList(value: CardList | JSONType): CardList {
  const result = StrictCardListSchema.safeParse(value);
  if (!result.success) throw new TypeError("The card list is invalid.");
  return result.data;
}

function hasUniqueEntityIds(entities: readonly { id: string }[]) {
  return new Set(entities.map(({ id }) => id)).size === entities.length;
}
