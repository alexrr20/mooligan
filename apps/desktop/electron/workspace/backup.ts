import { CollectionLotSchema, type CollectionLot } from "@mooligan/domain/collection";
import { DeckSchema, type Deck } from "@mooligan/domain/decks";
import { CardListSchema, type CardList } from "@mooligan/domain/lists";

import { type Preferences, validatePreferences } from "./preferences.ts";

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

export function parseWorkspaceBackup(serialized: string): WorkspaceBackup {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) {
    throw new TypeError("The workspace backup is invalid or too large.");
  }

  let value: unknown;

  try {
    value = JSON.parse(serialized);
  } catch {
    throw new TypeError("The workspace backup is not valid JSON.");
  }

  assertExactObject(
    value,
    ["cardLists", "collectionLots", "decks", "format", "preferences", "version"],
    "workspace backup",
  );

  if (value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new TypeError("The workspace backup format or version is unsupported.");
  }

  let preferences: Preferences;

  try {
    preferences = validatePreferences(value.preferences);
  } catch {
    throw new TypeError("The workspace backup preferences are invalid.");
  }

  return {
    cardLists: parseEntities(value.cardLists, "card list", MAX_CARD_LISTS, validateCardList),
    collectionLots: parseEntities(
      value.collectionLots,
      "collection lot",
      MAX_COLLECTION_LOTS,
      validateCollectionLot,
    ),
    decks: parseEntities(value.decks, "deck", MAX_DECKS, validateDeck),
    format: BACKUP_FORMAT,
    preferences,
    version: BACKUP_VERSION,
  };
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

export function validateCollectionLot(value: unknown): CollectionLot {
  assertExactObject(
    value,
    [
      "acquiredAt",
      "condition",
      "finish",
      "id",
      "language",
      "locationId",
      "notes",
      "printingId",
      "quantity",
      "unitCost",
    ],
    "collection lot",
  );

  if (value.unitCost !== undefined) {
    assertExactObject(value.unitCost, ["amountMinor", "currency"], "collection lot unit cost");
  }

  const result = CollectionLotSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("The collection lot is invalid.");
  }

  return result.data;
}

export function validateDeck(value: unknown): Deck {
  assertExactObject(
    value,
    ["createdAt", "entries", "formatId", "id", "name", "notes", "tags", "updatedAt"],
    "deck",
  );

  if (Array.isArray(value.entries)) {
    if (value.entries.length > MAX_ENTRIES) {
      throw new TypeError("The deck has too many entries.");
    }

    for (const entry of value.entries) {
      assertExactObject(entry, ["finish", "id", "printingId", "quantity", "section"], "deck entry");
    }

    assertUniqueIds(value.entries, "deck entry");
  }

  const result = DeckSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("The deck is invalid.");
  }

  return result.data;
}

export function validateCardList(value: unknown): CardList {
  assertExactObject(
    value,
    ["createdAt", "entries", "id", "name", "notes", "updatedAt"],
    "card list",
  );

  if (Array.isArray(value.entries)) {
    if (value.entries.length > MAX_ENTRIES) {
      throw new TypeError("The card list has too many entries.");
    }

    for (const entry of value.entries) {
      assertExactObject(
        entry,
        ["cardId", "desiredPrinting", "id", "notes", "quantity"],
        "card list entry",
      );

      if (entry.desiredPrinting !== undefined) {
        assertExactObject(entry.desiredPrinting, ["finish", "printingId"], "desired printing");
      }
    }

    assertUniqueIds(value.entries, "card list entry");
  }

  const result = CardListSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("The card list is invalid.");
  }

  return result.data;
}

function parseEntities<Entity extends { id: string }>(
  value: unknown,
  name: string,
  limit: number,
  validate: (value: unknown) => Entity,
): BackupEntity<Entity>[] {
  if (!Array.isArray(value) || value.length > limit) {
    throw new TypeError(`The workspace backup ${name}s are invalid or exceed the limit.`);
  }

  const ids = new Set<string>();

  return value.map((entry) => {
    assertExactObject(entry, ["id", "value"], `workspace backup ${name}`);

    const entity = validate(entry.value);

    if (entry.id !== entity.id || ids.has(entity.id)) {
      throw new TypeError(`The workspace backup ${name} IDs are invalid.`);
    }

    ids.add(entity.id);
    return { id: entity.id, value: entity };
  });
}

function assertUniqueIds(value: unknown[], name: string) {
  const ids = new Set<string>();

  for (const entry of value) {
    if (!isPlainObject(entry) || typeof entry.id !== "string" || ids.has(entry.id)) {
      throw new TypeError(`The ${name} IDs are invalid.`);
    }

    ids.add(entry.id);
  }
}

function assertExactObject(
  value: unknown,
  allowedKeys: readonly string[],
  name: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new TypeError(`The ${name} contains invalid fields.`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
