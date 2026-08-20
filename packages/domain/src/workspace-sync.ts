import * as z from "zod";

import {
  SpoilerDecisionStateSchema,
  SpoilerPolicySchema,
  SpoilerRevealScopeSchema,
  SpoilerTargetIdSchema,
} from "./spoilers.ts";

export const SPOILER_SYNC_BATCH_SIZE = 25;

export const MotionPreferenceSchema = z.enum(["full", "reduced", "system"]);
export type MotionPreference = z.infer<typeof MotionPreferenceSchema>;

export const RemoteMotionPreferenceSchema = z.strictObject({
  updatedAt: z.iso.datetime({ offset: true }),
  value: MotionPreferenceSchema,
  version: z.number().int().positive(),
});
export type RemoteMotionPreference = z.infer<typeof RemoteMotionPreferenceSchema>;

export const RemoteSpoilerStateSchema = z.strictObject({
  policy: SpoilerPolicySchema,
  resetGeneration: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type RemoteSpoilerState = z.infer<typeof RemoteSpoilerStateSchema>;

export const RemoteSpoilerDecisionSchema = z.strictObject({
  generation: z.number().int().nonnegative(),
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: SpoilerTargetIdSchema,
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type RemoteSpoilerDecision = z.infer<typeof RemoteSpoilerDecisionSchema>;

const RemotePreferencesSchema = z.strictObject({
  motion: RemoteMotionPreferenceSchema.optional(),
});
const RemoteSpoilerDecisionBatchSchema = z
  .array(RemoteSpoilerDecisionSchema)
  .max(SPOILER_SYNC_BATCH_SIZE)
  .refine(hasUniqueSpoilerDecisionTargets, {
    message: "Spoiler decision targets must be unique.",
  });

export const PreferencesResponseSchema = z.strictObject({ preferences: RemotePreferencesSchema });
export type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>;

export const BindResponseSchema = PreferencesResponseSchema.extend({
  spoilerState: RemoteSpoilerStateSchema,
  spoilerStateAccepted: z.boolean(),
  workspaceId: z.uuid(),
});
export type BindResponse = z.infer<typeof BindResponseSchema>;

export const SpoilerPageResponseSchema = z
  .strictObject({
    decisions: RemoteSpoilerDecisionBatchSchema,
    nextCursor: z.string().min(1).max(512).nullable(),
    snapshotVersion: z.number().int().positive(),
    state: RemoteSpoilerStateSchema,
  })
  .refine(hasKnownSpoilerDecisionGenerations, {
    message: "Spoiler decision generations must not exceed the global reset generation.",
  });
export type SpoilerPageResponse = z.infer<typeof SpoilerPageResponseSchema>;

export const SpoilerUpdateResponseSchema = z
  .strictObject({
    decisions: RemoteSpoilerDecisionBatchSchema,
    operationId: z.uuid(),
    snapshotVersion: z.number().int().positive(),
    state: RemoteSpoilerStateSchema,
  })
  .refine(hasKnownSpoilerDecisionGenerations, {
    message: "Spoiler decision generations must not exceed the global reset generation.",
  });
export type SpoilerUpdateResponse = z.infer<typeof SpoilerUpdateResponseSchema>;

function hasUniqueSpoilerDecisionTargets(
  decisions: Array<{ scope: RemoteSpoilerDecision["scope"]; targetId: string }>,
) {
  return (
    new Set(decisions.map(({ scope, targetId }) => `${scope}\0${targetId}`)).size ===
    decisions.length
  );
}

function hasKnownSpoilerDecisionGenerations(response: {
  decisions: RemoteSpoilerDecision[];
  state: RemoteSpoilerState;
}) {
  return response.decisions.every(({ generation }) => generation <= response.state.resetGeneration);
}
