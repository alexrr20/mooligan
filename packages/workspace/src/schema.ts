import { Events, makeSchema, queryDb, Schema, State } from "@livestore/livestore";

export const initialSpoilerResetId = "initial";

const TargetId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const DecisionId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));
const Generation = Schema.Int.pipe(Schema.nonNegative());
const SpoilerPolicy = Schema.Literal("protect", "show");
const SpoilerScope = Schema.Literal("printing", "release");
const SpoilerDecisionState = Schema.Literal("protect", "reveal");

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

export const tables = {
  spoilerDecisions: State.SQLite.table({ name: "spoiler_decisions", schema: SpoilerDecision }),
  spoilerSettings: State.SQLite.table({ name: "spoiler_settings", schema: SpoilerSettings }),
};

export const events = {
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
