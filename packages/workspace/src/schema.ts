import { Events, makeSchema, queryDb, Schema, State } from "@livestore/livestore";

export const initialSpoilerResetId = "initial";
export const workspaceEventSchemaVersion = 1;

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
  collectionLots: State.SQLite.table({
    indexes: [
      {
        columns: ["printingId", "finish", "language", "condition"],
        name: "collection_lots_holding",
      },
    ],
    name: "collection_lots",
    schema: CollectionLot,
  }),
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

export const workspaceSyncedEventSchema = Schema.Union(
  Schema.Struct({
    args: events.collectionCopiesAdded.schema,
    name: Schema.Literal(events.collectionCopiesAdded.name),
  }),
  Schema.Struct({
    args: events.collectionLotChanged.schema,
    name: Schema.Literal(events.collectionLotChanged.name),
  }),
  Schema.Struct({
    args: events.collectionLotRemoved.schema,
    name: Schema.Literal(events.collectionLotRemoved.name),
  }),
  Schema.Struct({
    args: events.spoilerDecisionChanged.schema,
    name: Schema.Literal(events.spoilerDecisionChanged.name),
  }),
  Schema.Struct({
    args: events.spoilerPolicyChanged.schema,
    name: Schema.Literal(events.spoilerPolicyChanged.name),
  }),
  Schema.Struct({
    args: events.spoilerProtectionReset.schema,
    name: Schema.Literal(events.spoilerProtectionReset.name),
  }),
);

const defaultSpoilerSettings = {
  id: "spoilers",
  policy: "protect",
  resetGeneration: 0,
  resetId: initialSpoilerResetId,
} as const;

const collectionLotsWriteTables = new Set([tables.collectionLots.sqliteDef.name]);
const spoilerDecisionsWriteTables = new Set([tables.spoilerDecisions.sqliteDef.name]);
const spoilerSettingsWriteTables = new Set([tables.spoilerSettings.sqliteDef.name]);

const unattributedCollectionLotSql = (alias: string) => `
  ${alias}."acquiredAt" IS NULL
  AND ${alias}."locationId" IS NULL
  AND ${alias}."notes" IS NULL
  AND ${alias}."unitCostAmountMinor" IS NULL
  AND ${alias}."unitCostCurrency" IS NULL
`;

const matchingCollectionLotSql = (alias: string) => `
  ${alias}."condition" = $condition
  AND ${alias}."finish" = $finish
  AND ${alias}."language" = $language
`;

const materializers = State.SQLite.materializers(events, {
  "v1.CollectionCopiesAdded": ({ lot }) => {
    const row = toCollectionLotRow(lot);
    if (!isUnattributedLot(row)) {
      return tables.collectionLots.insert(row).onConflict("id", "ignore");
    }

    const bindValues = {
      condition: row.condition,
      finish: row.finish,
      language: row.language,
      lotId: row.id,
      maxQuantity: Number.MAX_SAFE_INTEGER,
      printingId: row.printingId,
      quantity: row.quantity,
    };

    return [
      {
        sql: `
          INSERT INTO "collection_lots" (
            "acquiredAt", "condition", "finish", "id", "language", "locationId", "notes",
            "printingId", "quantity", "unitCostAmountMinor", "unitCostCurrency"
          )
          SELECT
            NULL, $condition, $finish, $lotId, $language, NULL, NULL,
            $printingId, $quantity, NULL, NULL
          WHERE NOT EXISTS (
            SELECT 1
            FROM "collection_lots" AS existing
            WHERE ${unattributedCollectionLotSql("existing")}
              AND ${matchingCollectionLotSql("existing")}
              AND existing."printingId" = $printingId
          )
          ON CONFLICT("id") DO NOTHING
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
      {
        sql: `
          UPDATE "collection_lots"
          SET "quantity" = "quantity" + $quantity
          WHERE "id" = (
            SELECT existing."id"
            FROM "collection_lots" AS existing
            WHERE ${unattributedCollectionLotSql("existing")}
              AND ${matchingCollectionLotSql("existing")}
              AND existing."printingId" = $printingId
            ORDER BY existing."id" ASC
            LIMIT 1
          )
            AND "id" <> $lotId
            AND "quantity" <= $maxQuantity - $quantity
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
    ];
  },
  "v1.CollectionLotChanged": (change) => {
    const bindValues = {
      condition: change.condition,
      finish: change.finish,
      language: change.language,
      lotId: change.lotId,
      maxQuantity: Number.MAX_SAFE_INTEGER,
      quantity: change.quantity,
    };

    return [
      {
        sql: `
          WITH merge_target AS MATERIALIZED (
            SELECT candidate."id"
            FROM (
              SELECT target."id", target."quantity"
              FROM "collection_lots" AS target
              JOIN "collection_lots" AS source ON source."id" = $lotId
              WHERE target."id" <> source."id"
                AND ${unattributedCollectionLotSql("source")}
                AND ${unattributedCollectionLotSql("target")}
                AND ${matchingCollectionLotSql("target")}
                AND target."printingId" = source."printingId"
              ORDER BY target."id" ASC
              LIMIT 1
            ) AS candidate
            WHERE candidate."quantity" <= $maxQuantity - $quantity
          )
          UPDATE "collection_lots"
          SET "quantity" = CASE
            WHEN "id" = $lotId THEN 0
            ELSE "quantity" + $quantity
          END
          WHERE EXISTS (SELECT 1 FROM merge_target)
            AND (
              "id" = $lotId
              OR "id" = (SELECT "id" FROM merge_target)
            )
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
      {
        sql: `
          DELETE FROM "collection_lots"
          WHERE "id" = $lotId AND "quantity" = 0
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
      {
        sql: `
          UPDATE "collection_lots" AS source
          SET
            "condition" = $condition,
            "finish" = $finish,
            "language" = $language,
            "quantity" = $quantity
          WHERE source."id" = $lotId
            AND ${unattributedCollectionLotSql("source")}
            AND NOT EXISTS (
              SELECT 1
              FROM "collection_lots" AS target
              WHERE target."id" <> source."id"
                AND ${unattributedCollectionLotSql("target")}
                AND ${matchingCollectionLotSql("target")}
                AND target."printingId" = source."printingId"
            )
        `,
        bindValues,
        writeTables: collectionLotsWriteTables,
      },
    ];
  },
  "v1.CollectionLotRemoved": ({ lotId }) => ({
    sql: `
      DELETE FROM "collection_lots" AS source
      WHERE source."id" = $lotId
        AND ${unattributedCollectionLotSql("source")}
    `,
    bindValues: { lotId },
    writeTables: collectionLotsWriteTables,
  }),
  "v1.SpoilerDecisionChanged": (decision) => {
    const id = `${decision.scope}:${decision.targetId}`;
    return {
      sql: `
        INSERT INTO "spoiler_decisions" (
          "decisionId", "generation", "id", "observedDecisionId", "resetId", "scope", "state",
          "targetId"
        )
        SELECT
          $decisionId, $generation, $id, $observedDecisionId, $resetId, $scope, $state, $targetId
        WHERE $generation = COALESCE(
          (SELECT "resetGeneration" FROM "spoiler_settings" WHERE "id" = 'spoilers'),
          0
        )
          AND $resetId = COALESCE(
            (SELECT "resetId" FROM "spoiler_settings" WHERE "id" = 'spoilers'),
            '${initialSpoilerResetId}'
          )
        ON CONFLICT("id") DO UPDATE SET
          "decisionId" = excluded."decisionId",
          "generation" = excluded."generation",
          "observedDecisionId" = excluded."observedDecisionId",
          "resetId" = excluded."resetId",
          "scope" = excluded."scope",
          "state" = excluded."state",
          "targetId" = excluded."targetId"
        WHERE "spoiler_decisions"."generation" <> excluded."generation"
          OR "spoiler_decisions"."resetId" <> excluded."resetId"
          OR "spoiler_decisions"."decisionId" = excluded."observedDecisionId"
          OR (
            "spoiler_decisions"."decisionId" <> excluded."decisionId"
            AND (
              "spoiler_decisions"."observedDecisionId" IS NULL
              OR "spoiler_decisions"."observedDecisionId" <> excluded."decisionId"
            )
            AND (
              (
                "spoiler_decisions"."state" <> excluded."state"
                AND excluded."state" = 'protect'
              )
              OR (
                "spoiler_decisions"."state" = excluded."state"
                AND excluded."decisionId" > "spoiler_decisions"."decisionId"
              )
            )
          )
      `,
      bindValues: { ...decision, id },
      writeTables: spoilerDecisionsWriteTables,
    };
  },
  "v1.SpoilerPolicyChanged": ({ policy }) =>
    tables.spoilerSettings
      .insert({ ...defaultSpoilerSettings, policy })
      .onConflict("id", "update", { policy }),
  "v1.SpoilerProtectionReset": ({ generation, resetId }) => {
    const bindValues = { generation, resetId };
    return [
      {
        sql: `
          INSERT INTO "spoiler_settings" ("id", "policy", "resetGeneration", "resetId")
          VALUES ('spoilers', 'protect', $generation, $resetId)
          ON CONFLICT("id") DO UPDATE SET
            "resetGeneration" = excluded."resetGeneration",
            "resetId" = excluded."resetId"
          WHERE excluded."resetGeneration" > "spoiler_settings"."resetGeneration"
            OR (
              excluded."resetGeneration" = "spoiler_settings"."resetGeneration"
              AND excluded."resetId" > "spoiler_settings"."resetId"
            )
        `,
        bindValues,
        writeTables: spoilerSettingsWriteTables,
      },
      {
        sql: `
          DELETE FROM "spoiler_decisions"
          WHERE EXISTS (
            SELECT 1
            FROM "spoiler_settings"
            WHERE "id" = 'spoilers'
              AND "resetGeneration" = $generation
              AND "resetId" = $resetId
          )
            AND (
              "generation" < $generation
              OR ("generation" = $generation AND "resetId" <> $resetId)
            )
        `,
        bindValues,
        writeTables: spoilerDecisionsWriteTables,
      },
    ];
  },
});

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
