import * as z from "zod";

import { CatalogCardDetailSchema } from "./catalog-detail.ts";

export const SpoilerTargetIdSchema = z.string().trim().min(1).max(128);
const idSchema = SpoilerTargetIdSchema;
const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

export const SpoilerPolicySchema = z.enum(["protect", "show"]);
export type SpoilerPolicy = z.infer<typeof SpoilerPolicySchema>;

export const SpoilerRevealScopeSchema = z.enum(["printing", "release"]);
export type SpoilerRevealScope = z.infer<typeof SpoilerRevealScopeSchema>;

export const SpoilerDecisionStateSchema = z.enum(["protect", "reveal"]);
export type SpoilerDecisionState = z.infer<typeof SpoilerDecisionStateSchema>;

export const SpoilerProjectionDecisionSchema = z.strictObject({
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: idSchema,
});
export type SpoilerProjectionDecision = z.infer<typeof SpoilerProjectionDecisionSchema>;

const MAX_SPOILER_PROJECTION_DECISIONS = 100_000;
const SpoilerProjectionDecisionsSchema = z
  .array(SpoilerProjectionDecisionSchema)
  .max(MAX_SPOILER_PROJECTION_DECISIONS)
  .refine(
    (decisions) =>
      new Set(decisions.map(({ scope, targetId }) => `${scope}\0${targetId}`)).size ===
      decisions.length,
    { message: "Spoiler projection targets must be unique." },
  );

const SpoilerProjectionIdentitySchema = z.strictObject({
  revision: z.number().int().positive(),
  sessionId: z.uuidv4(),
  workspaceId: z.uuidv4(),
});

export const SpoilerProjectionSnapshotSchema = SpoilerProjectionIdentitySchema.extend({
  decisions: SpoilerProjectionDecisionsSchema,
  policy: SpoilerPolicySchema,
});
export type SpoilerProjectionSnapshot = z.infer<typeof SpoilerProjectionSnapshotSchema>;

export const SpoilerProjectionDeltaSchema = SpoilerProjectionIdentitySchema.extend({
  decisions: SpoilerProjectionDecisionsSchema,
  policy: SpoilerPolicySchema.optional(),
});
export type SpoilerProjectionDelta = z.infer<typeof SpoilerProjectionDeltaSchema>;

export const SpoilerProjectionConnectionSchema = z.strictObject({
  sessionId: z.uuidv4(),
  workspaceId: z.uuidv4(),
});
export type SpoilerProjectionConnection = z.infer<typeof SpoilerProjectionConnectionSchema>;

export const SpoilerProjectionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ revision: z.number().int().positive(), status: z.literal("applied") }),
  z.strictObject({ status: z.literal("resync-required") }),
]);
export type SpoilerProjectionResult = z.infer<typeof SpoilerProjectionResultSchema>;

export const CatalogSetSymbolDescriptorSchema = z.strictObject({ setId: idSchema });
export type CatalogSetSymbolDescriptor = z.infer<typeof CatalogSetSymbolDescriptorSchema>;

export const CatalogReleaseSummarySchema = z.strictObject({
  code: z.string().min(1),
  name: z.string().min(1),
  nextReleaseOn: z.iso.date(),
  rootSetId: idSchema,
  symbol: CatalogSetSymbolDescriptorSchema,
});
export type CatalogReleaseSummary = z.infer<typeof CatalogReleaseSummarySchema>;

export const SpoilerVisibilitySnapshotSchema = z
  .strictObject({
    currentDate: z.iso.date(),
    policy: SpoilerPolicySchema,
    revealedPrintingIds: z.array(idSchema),
    revealedRootSetIds: z.array(idSchema),
    revision: z.number().int().nonnegative(),
  })
  .refine(({ revealedPrintingIds }) => uniqueIds(revealedPrintingIds), {
    message: "Revealed printing IDs must be unique.",
    path: ["revealedPrintingIds"],
  })
  .refine(({ revealedRootSetIds }) => uniqueIds(revealedRootSetIds), {
    message: "Revealed release IDs must be unique.",
    path: ["revealedRootSetIds"],
  });
export type SpoilerVisibilitySnapshot = z.infer<typeof SpoilerVisibilitySnapshotSchema>;

export const SpoilerStateSchema = z
  .strictObject({
    activePrintingIds: z.array(idSchema),
    activeRootSetIds: z.array(idSchema),
    policy: SpoilerPolicySchema,
    revision: z.number().int().nonnegative(),
  })
  .refine(({ activePrintingIds }) => uniqueIds(activePrintingIds), {
    message: "Active printing IDs must be unique.",
    path: ["activePrintingIds"],
  })
  .refine(({ activeRootSetIds }) => uniqueIds(activeRootSetIds), {
    message: "Active release IDs must be unique.",
    path: ["activeRootSetIds"],
  });
export type SpoilerState = z.infer<typeof SpoilerStateSchema>;

export const CatalogPrintingVisibilitySchema = z.discriminatedUnion("reason", [
  z.strictObject({ reason: z.literal("released") }),
  z.strictObject({
    reason: z.enum(["global", "printing", "release"]),
    release: CatalogReleaseSummarySchema,
  }),
]);
export type CatalogPrintingVisibility = z.infer<typeof CatalogPrintingVisibilitySchema>;

const VisibleCatalogPrintingSchema = z.strictObject({
  detail: CatalogCardDetailSchema,
  status: z.literal("visible"),
  visibility: CatalogPrintingVisibilitySchema,
});

const ProtectedCatalogPrintingSchema = z.strictObject({
  printingId: idSchema,
  release: CatalogReleaseSummarySchema,
  releasedOn: z.iso.date(),
  status: z.literal("protected"),
});

export const CatalogPrintingResultSchema = z.discriminatedUnion("status", [
  VisibleCatalogPrintingSchema,
  ProtectedCatalogPrintingSchema,
]);
export type CatalogPrintingResult = z.infer<typeof CatalogPrintingResultSchema>;

export const SpoilerRevealSummarySchema = z.strictObject({
  detail: z.string().min(1).optional(),
  label: z.string().min(1),
  rootSetId: idSchema.optional(),
  scope: SpoilerRevealScopeSchema,
  targetId: idSchema,
});
export type SpoilerRevealSummary = z.infer<typeof SpoilerRevealSummarySchema>;

export const SpoilerRevealSummariesSchema = z.strictObject({
  printings: z.array(SpoilerRevealSummarySchema),
  releases: z.array(SpoilerRevealSummarySchema),
});
export type SpoilerRevealSummaries = z.infer<typeof SpoilerRevealSummariesSchema>;
