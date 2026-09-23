import { Events, queryDb, Schema, State } from "@livestore/livestore";

import { IdentifierSchema } from "./primitives.ts";
import {
  SpoilerDecisionSchema,
  SpoilerGenerationSchema,
  SpoilerPolicySchema,
} from "./spoiler-contract.ts";

export const initialSpoilerResetId = "initial";

export const spoilerTables = {
  spoilerDecisions: State.SQLite.table({
    name: "spoiler_decisions",
    schema: Schema.Struct({
      ...SpoilerDecisionSchema.fields,
      id: Schema.String.pipe(State.SQLite.withPrimaryKey),
    }),
  }),
  spoilerSettings: State.SQLite.table({
    name: "spoiler_settings",
    schema: Schema.Struct({
      id: Schema.Literal("spoilers").pipe(State.SQLite.withPrimaryKey),
      policy: SpoilerPolicySchema,
      resetGeneration: SpoilerGenerationSchema,
      resetId: IdentifierSchema,
    }),
  }),
};

export const spoilerEvents = {
  spoilerDecisionChanged: Events.synced({
    name: "v1.SpoilerDecisionChanged",
    schema: SpoilerDecisionSchema,
  }),
  spoilerPolicyChanged: Events.synced({
    name: "v1.SpoilerPolicyChanged",
    schema: Schema.Struct({ policy: SpoilerPolicySchema }),
  }),
  spoilerProtectionReset: Events.synced({
    name: "v1.SpoilerProtectionReset",
    schema: Schema.Struct({
      generation: SpoilerGenerationSchema.pipe(Schema.positive()),
      resetId: IdentifierSchema,
    }),
  }),
} as const;

const defaultSpoilerSettings = {
  id: "spoilers",
  policy: "protect",
  resetGeneration: 0,
  resetId: initialSpoilerResetId,
} as const;

const spoilerDecisionsWriteTables = new Set([spoilerTables.spoilerDecisions.sqliteDef.name]);
const spoilerSettingsWriteTables = new Set([spoilerTables.spoilerSettings.sqliteDef.name]);

export const spoilerMaterializers = {
  "v1.SpoilerDecisionChanged": (
    decision: typeof spoilerEvents.spoilerDecisionChanged.schema.Type,
  ) => {
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
  "v1.SpoilerPolicyChanged": ({ policy }: typeof spoilerEvents.spoilerPolicyChanged.schema.Type) =>
    spoilerTables.spoilerSettings
      .insert({ ...defaultSpoilerSettings, policy })
      .onConflict("id", "update", { policy }),
  "v1.SpoilerProtectionReset": ({
    generation,
    resetId,
  }: typeof spoilerEvents.spoilerProtectionReset.schema.Type) => {
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
};

export const spoilerSettingsQuery = queryDb(
  spoilerTables.spoilerSettings.select().first({
    behaviour: "fallback",
    fallback: () => defaultSpoilerSettings,
  }),
  { label: "spoiler-settings" },
);

export const spoilerDecisionsQuery = queryDb(
  spoilerTables.spoilerDecisions.orderBy([
    { col: "scope", direction: "asc" },
    { col: "targetId", direction: "asc" },
  ]),
  { label: "spoiler-decisions" },
);
