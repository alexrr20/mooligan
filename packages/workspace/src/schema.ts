import { Events, makeSchema, queryDb, Schema, State } from "@livestore/livestore";

export const initialSpoilerResetId = "initial";

const TargetId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const DecisionId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const Generation = Schema.Int.pipe(Schema.nonNegative());
const SpoilerPolicy = Schema.Literal("protect", "show");
const SpoilerScope = Schema.Literal("printing", "release");
const SpoilerDecisionState = Schema.Literal("protect", "reveal");
const CollectionFinish = Schema.Literal("nonfoil", "foil", "etched", "glossy");
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
const CollectionQuantity = Schema.Int.pipe(
  Schema.positive(),
  Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const CollectionMoney = Schema.Struct({
  amountMinor: Schema.Int.pipe(
    Schema.nonNegative(),
    Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
  currency: Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/u)),
});
const CollectionLotEvent = Schema.Struct({
  acquiredAt: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64))),
  condition: CardCondition,
  finish: CollectionFinish,
  id: DecisionId,
  language: CardLanguage,
  locationId: Schema.NullOr(DecisionId),
  notes: Schema.NullOr(Schema.String),
  printingId: TargetId,
  quantity: CollectionQuantity,
  unitCost: Schema.NullOr(CollectionMoney),
});

export const workspaceSyncPayloadSchema = Schema.Struct({
  credential: Schema.String.pipe(Schema.minLength(1)),
  workspaceId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
});

const SpoilerSettings = Schema.Struct({
  id: Schema.Literal("spoilers").pipe(State.SQLite.withPrimaryKey),
  policy: SpoilerPolicy,
  resetGeneration: Generation,
  resetId: DecisionId,
});

const SpoilerDecision = Schema.Struct({
  decisionId: DecisionId,
  generation: Generation,
  id: Schema.String.pipe(State.SQLite.withPrimaryKey),
  observedDecisionId: Schema.NullOr(DecisionId),
  resetId: DecisionId,
  scope: SpoilerScope,
  state: SpoilerDecisionState,
  targetId: TargetId,
});

const CollectionLot = Schema.Struct({
  acquiredAt: Schema.NullOr(Schema.String),
  condition: CardCondition,
  finish: CollectionFinish,
  id: Schema.String.pipe(State.SQLite.withPrimaryKey),
  language: CardLanguage,
  locationId: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  printingId: TargetId,
  quantity: CollectionQuantity,
  unitCostAmountMinor: Schema.NullOr(Schema.Int.pipe(Schema.nonNegative())),
  unitCostCurrency: Schema.NullOr(Schema.String),
});

export const tables = {
  collectionLots: State.SQLite.table({ name: "collection_lots", schema: CollectionLot }),
  spoilerDecisions: State.SQLite.table({ name: "spoiler_decisions", schema: SpoilerDecision }),
  spoilerSettings: State.SQLite.table({ name: "spoiler_settings", schema: SpoilerSettings }),
};

export const events = {
  collectionCopiesAdded: Events.synced({
    name: "v1.CollectionCopiesAdded",
    schema: Schema.Struct({
      additionId: DecisionId,
      lot: CollectionLotEvent,
    }),
  }),
  collectionLotChanged: Events.synced({
    name: "v1.CollectionLotChanged",
    schema: Schema.Struct({
      changeId: DecisionId,
      condition: CardCondition,
      finish: CollectionFinish,
      language: CardLanguage,
      lotId: DecisionId,
      quantity: CollectionQuantity,
    }),
  }),
  collectionLotRemoved: Events.synced({
    name: "v1.CollectionLotRemoved",
    schema: Schema.Struct({ lotId: DecisionId, removalId: DecisionId }),
  }),
  spoilerDecisionChanged: Events.synced({
    name: "v1.SpoilerDecisionChanged",
    schema: Schema.Struct({
      decisionId: DecisionId,
      generation: Generation,
      observedDecisionId: Schema.NullOr(DecisionId),
      resetId: DecisionId,
      scope: SpoilerScope,
      state: SpoilerDecisionState,
      targetId: TargetId,
    }),
  }),
  spoilerPolicyChanged: Events.synced({
    name: "v1.SpoilerPolicyChanged",
    schema: Schema.Struct({ policy: SpoilerPolicy }),
  }),
  spoilerProtectionReset: Events.synced({
    name: "v1.SpoilerProtectionReset",
    schema: Schema.Struct({
      generation: Schema.Int.pipe(Schema.positive()),
      resetId: DecisionId,
    }),
  }),
} as const;

const defaultSpoilerSettings = {
  id: "spoilers",
  policy: "protect",
  resetGeneration: 0,
  resetId: initialSpoilerResetId,
} as const;

const materializers = State.SQLite.materializers(events, {
  "v1.CollectionCopiesAdded": ({ lot }, { query }) => {
    const row = toCollectionLotRow(lot);
    if (!isUnattributedLot(row)) {
      return tables.collectionLots.insert(row).onConflict("id", "ignore");
    }

    const target = query(
      tables.collectionLots.where({
        condition: row.condition,
        finish: row.finish,
        language: row.language,
        printingId: row.printingId,
      }),
    ).find(isUnattributedLot);

    if (!target) {
      return tables.collectionLots.insert(row).onConflict("id", "ignore");
    }

    const quantity = target.quantity + row.quantity;
    return Number.isSafeInteger(quantity)
      ? tables.collectionLots.update({ quantity }).where({ id: target.id })
      : [];
  },
  "v1.CollectionLotChanged": (change, { query }) => {
    const source = query(tables.collectionLots.where({ id: change.lotId }).first());
    if (!source || !isUnattributedLot(source)) {
      return [];
    }

    const target = query(
      tables.collectionLots.where({
        condition: change.condition,
        finish: change.finish,
        language: change.language,
        printingId: source.printingId,
      }),
    ).find((lot) => lot.id !== source.id && isUnattributedLot(lot));

    if (!target) {
      return tables.collectionLots
        .update({
          condition: change.condition,
          finish: change.finish,
          language: change.language,
          quantity: change.quantity,
        })
        .where({ id: source.id });
    }

    const quantity = target.quantity + change.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return [];
    }
    return [
      tables.collectionLots.update({ quantity }).where({ id: target.id }),
      tables.collectionLots.delete().where({ id: source.id }),
    ];
  },
  "v1.CollectionLotRemoved": ({ lotId }, { query }) => {
    const source = query(tables.collectionLots.where({ id: lotId }).first());
    return source && isUnattributedLot(source)
      ? tables.collectionLots.delete().where({ id: lotId })
      : [];
  },
  "v1.SpoilerDecisionChanged": (decision, { query }) => {
    const settings = query(
      tables.spoilerSettings.select().first({
        behaviour: "fallback",
        fallback: () => defaultSpoilerSettings,
      }),
    );

    if (decision.generation !== settings.resetGeneration || decision.resetId !== settings.resetId) {
      return [];
    }

    const id = `${decision.scope}:${decision.targetId}`;
    const current = query(tables.spoilerDecisions.where({ id }).first());

    if (!shouldReplaceDecision(current, decision)) {
      return [];
    }

    return tables.spoilerDecisions.insert({ ...decision, id }).onConflict("id", "replace");
  },
  "v1.SpoilerPolicyChanged": ({ policy }) =>
    tables.spoilerSettings
      .insert({ ...defaultSpoilerSettings, policy })
      .onConflict("id", "update", { policy }),
  "v1.SpoilerProtectionReset": ({ generation, resetId }, { query }) => {
    const current = query(
      tables.spoilerSettings.select().first({
        behaviour: "fallback",
        fallback: () => defaultSpoilerSettings,
      }),
    );

    if (
      generation < current.resetGeneration ||
      (generation === current.resetGeneration && resetId <= current.resetId)
    ) {
      return [];
    }

    return [
      tables.spoilerSettings
        .insert({ ...current, resetGeneration: generation, resetId })
        .onConflict("id", "update", { resetGeneration: generation, resetId }),
      tables.spoilerDecisions.delete(),
    ];
  },
});

function shouldReplaceDecision(
  current: typeof tables.spoilerDecisions.Type | undefined,
  incoming: Omit<typeof tables.spoilerDecisions.Type, "id">,
) {
  if (!current || current.decisionId === incoming.observedDecisionId) {
    return true;
  }
  if (
    current.decisionId === incoming.decisionId ||
    current.observedDecisionId === incoming.decisionId
  ) {
    return false;
  }
  if (current.state !== incoming.state) {
    return incoming.state === "protect";
  }
  return incoming.decisionId > current.decisionId;
}

const state = State.SQLite.makeState({ tables, materializers });

export const workspaceSchema = makeSchema({ events, state });

export const spoilerSettingsQuery = queryDb(
  tables.spoilerSettings.select().first({
    behaviour: "fallback",
    fallback: () => defaultSpoilerSettings,
  }),
  { label: "spoiler-settings" },
);

export const spoilerDecisionsQuery = queryDb(
  tables.spoilerDecisions.orderBy([
    { col: "scope", direction: "asc" },
    { col: "targetId", direction: "asc" },
  ]),
  { label: "spoiler-decisions" },
);

export const collectionLotsQuery = queryDb(tables.collectionLots.orderBy("id", "asc"), {
  label: "collection-lots",
});

type CollectionLotRow = typeof tables.collectionLots.Type;

function toCollectionLotRow(lot: typeof CollectionLotEvent.Type): CollectionLotRow {
  return {
    acquiredAt: lot.acquiredAt,
    condition: lot.condition,
    finish: lot.finish,
    id: lot.id,
    language: lot.language,
    locationId: lot.locationId,
    notes: lot.notes,
    printingId: lot.printingId,
    quantity: lot.quantity,
    unitCostAmountMinor: lot.unitCost?.amountMinor ?? null,
    unitCostCurrency: lot.unitCost?.currency ?? null,
  };
}

function isUnattributedLot(lot: CollectionLotRow) {
  return (
    lot.acquiredAt === null &&
    lot.locationId === null &&
    lot.notes === null &&
    lot.unitCostAmountMinor === null &&
    lot.unitCostCurrency === null
  );
}
