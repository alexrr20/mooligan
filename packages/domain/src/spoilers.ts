import { Schema } from "effect";

import { CatalogCardDetailSchema } from "./catalog-detail.ts";
import { UuidSchema, IsoDateSchema, StrictStruct, UuidV4Schema } from "./schema.ts";

export const SpoilerTargetIdSchema = Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(128));
const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;
const revisionSchema = Schema.Int.pipe(Schema.positive());

export const spoilerPolicies = ["protect", "show"] as const;
export type SpoilerPolicy = (typeof spoilerPolicies)[number];
export const SpoilerPolicySchema = Schema.Literal(...spoilerPolicies);

export const spoilerRevealScopes = ["printing", "release"] as const;
export type SpoilerRevealScope = (typeof spoilerRevealScopes)[number];
export const SpoilerRevealScopeSchema = Schema.Literal(...spoilerRevealScopes);

export const spoilerDecisionStates = ["protect", "reveal"] as const;
export type SpoilerDecisionState = (typeof spoilerDecisionStates)[number];
export const SpoilerDecisionStateSchema = Schema.Literal(...spoilerDecisionStates);

export const SpoilerProjectionDecisionSchema = StrictStruct({
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: SpoilerTargetIdSchema,
});
export type SpoilerProjectionDecision = typeof SpoilerProjectionDecisionSchema.Type;

const MAX_SPOILER_PROJECTION_DECISIONS = 100_000;
const SpoilerProjectionDecisionsSchema = Schema.Array(SpoilerProjectionDecisionSchema).pipe(
  Schema.maxItems(MAX_SPOILER_PROJECTION_DECISIONS),
  Schema.filter(
    (decisions) =>
      new Set(decisions.map(({ scope, targetId }) => `${scope}\0${targetId}`)).size ===
      decisions.length,
    { message: () => "Spoiler projection targets must be unique." },
  ),
);

const spoilerProjectionConnectionFields = {
  sessionId: UuidV4Schema,
  workspaceId: UuidSchema,
};

export const SpoilerProjectionSnapshotSchema = StrictStruct({
  ...spoilerProjectionConnectionFields,
  revision: revisionSchema,
  decisions: SpoilerProjectionDecisionsSchema,
  policy: SpoilerPolicySchema,
});
export type SpoilerProjectionSnapshot = typeof SpoilerProjectionSnapshotSchema.Type;

export const SpoilerProjectionDeltaSchema = StrictStruct({
  ...spoilerProjectionConnectionFields,
  revision: revisionSchema,
  decisions: SpoilerProjectionDecisionsSchema,
  policy: Schema.optional(SpoilerPolicySchema),
});
export type SpoilerProjectionDelta = typeof SpoilerProjectionDeltaSchema.Type;

export const SpoilerProjectionConnectionSchema = StrictStruct(spoilerProjectionConnectionFields);
export type SpoilerProjectionConnection = typeof SpoilerProjectionConnectionSchema.Type;

export const SpoilerProjectionResultSchema = Schema.Union(
  StrictStruct({ revision: revisionSchema, status: Schema.Literal("applied") }),
  StrictStruct({ status: Schema.Literal("resync-required") }),
);
export type SpoilerProjectionResult = typeof SpoilerProjectionResultSchema.Type;

export const CatalogSetSymbolDescriptorSchema = StrictStruct({ setId: SpoilerTargetIdSchema });
export type CatalogSetSymbolDescriptor = typeof CatalogSetSymbolDescriptorSchema.Type;

export const CatalogReleaseSummarySchema = StrictStruct({
  code: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  nextReleaseOn: IsoDateSchema,
  rootSetId: SpoilerTargetIdSchema,
  symbol: CatalogSetSymbolDescriptorSchema,
});
export type CatalogReleaseSummary = typeof CatalogReleaseSummarySchema.Type;

export const SpoilerVisibilitySnapshotSchema = StrictStruct({
  currentDate: IsoDateSchema,
  policy: SpoilerPolicySchema,
  revealedPrintingIds: Schema.Array(SpoilerTargetIdSchema),
  revealedRootSetIds: Schema.Array(SpoilerTargetIdSchema),
  revision: Schema.NonNegativeInt,
}).pipe(
  Schema.filter(({ revealedPrintingIds, revealedRootSetIds }) => [
    uniqueIds(revealedPrintingIds) || {
      message: "Revealed printing IDs must be unique.",
      path: ["revealedPrintingIds"],
    },
    uniqueIds(revealedRootSetIds) || {
      message: "Revealed release IDs must be unique.",
      path: ["revealedRootSetIds"],
    },
  ]),
);
export type SpoilerVisibilitySnapshot = typeof SpoilerVisibilitySnapshotSchema.Type;

export const SpoilerStateSchema = StrictStruct({
  activePrintingIds: Schema.Array(SpoilerTargetIdSchema),
  activeRootSetIds: Schema.Array(SpoilerTargetIdSchema),
  policy: SpoilerPolicySchema,
  revision: Schema.NonNegativeInt,
}).pipe(
  Schema.filter(({ activePrintingIds, activeRootSetIds }) => [
    uniqueIds(activePrintingIds) || {
      message: "Active printing IDs must be unique.",
      path: ["activePrintingIds"],
    },
    uniqueIds(activeRootSetIds) || {
      message: "Active release IDs must be unique.",
      path: ["activeRootSetIds"],
    },
  ]),
);
export type SpoilerState = typeof SpoilerStateSchema.Type;

export const CatalogPrintingVisibilitySchema = Schema.Union(
  StrictStruct({ reason: Schema.Literal("released") }),
  StrictStruct({
    reason: Schema.Literal("global", "printing", "release"),
    release: CatalogReleaseSummarySchema,
  }),
);
export type CatalogPrintingVisibility = typeof CatalogPrintingVisibilitySchema.Type;

const VisibleCatalogPrintingSchema = StrictStruct({
  detail: CatalogCardDetailSchema,
  status: Schema.Literal("visible"),
  visibility: CatalogPrintingVisibilitySchema,
});

const ProtectedCatalogPrintingSchema = StrictStruct({
  printingId: SpoilerTargetIdSchema,
  release: CatalogReleaseSummarySchema,
  releasedOn: IsoDateSchema,
  status: Schema.Literal("protected"),
});

export const CatalogPrintingResultSchema = Schema.Union(
  VisibleCatalogPrintingSchema,
  ProtectedCatalogPrintingSchema,
);
export type CatalogPrintingResult = typeof CatalogPrintingResultSchema.Type;

export const SpoilerRevealSummarySchema = StrictStruct({
  detail: Schema.optional(Schema.NonEmptyString),
  label: Schema.NonEmptyString,
  rootSetId: Schema.optional(SpoilerTargetIdSchema),
  scope: SpoilerRevealScopeSchema,
  targetId: SpoilerTargetIdSchema,
});
export type SpoilerRevealSummary = typeof SpoilerRevealSummarySchema.Type;

export const SpoilerRevealSummariesSchema = StrictStruct({
  printings: Schema.Array(SpoilerRevealSummarySchema),
  releases: Schema.Array(SpoilerRevealSummarySchema),
});
export type SpoilerRevealSummaries = typeof SpoilerRevealSummariesSchema.Type;
