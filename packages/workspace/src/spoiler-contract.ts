import {
  spoilerDecisionStates,
  spoilerPolicies,
  spoilerRevealScopes,
} from "@mooligan/domain/spoilers";
import { Schema } from "effect";

import { IdentifierSchema } from "./primitives.ts";

export const SpoilerPolicySchema = Schema.Literal(...spoilerPolicies);
export const SpoilerRevealScopeSchema = Schema.Literal(...spoilerRevealScopes);
export const SpoilerDecisionStateSchema = Schema.Literal(...spoilerDecisionStates);
export const SpoilerGenerationSchema = Schema.Int.pipe(Schema.nonNegative());

/** A Reveal or protection of one printing or Release family within one reset generation. */
export const SpoilerDecisionSchema = Schema.Struct({
  decisionId: IdentifierSchema,
  generation: SpoilerGenerationSchema,
  observedDecisionId: Schema.NullOr(IdentifierSchema),
  resetId: IdentifierSchema,
  scope: SpoilerRevealScopeSchema,
  state: SpoilerDecisionStateSchema,
  targetId: IdentifierSchema,
});
