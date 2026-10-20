import type { Data } from "../src/domain.js";
import type { ContinuityV1Ports } from "../src/modules/continuity/v1/ports.js";
import type { DecisionContext } from "../src/modules/decision-step/v1/context.js";
import type { EngineContext } from "../src/platform/engine-registry.js";
/** Adapter for old unit-only fake contexts; production never receives this unchecked fixture. */
export function decisionProbe(ctx: EngineContext): DecisionContext {
  const model = ctx.claim.turn.cohort.model;
  if (!model) throw Error("UNIT_MODEL_REQUIRED");
  return {
    ...ctx,
    id: ctx.claim.turn.id,
    instanceId: "unit-only",
    profile: ctx.claim.profile,
    configuration: {
      model: ctx.claim.turn.cohort.model,
      budget: ctx.claim.turn.cohort.budget,
      architectureConfig: {},
      goal: ctx.goal,
      instructions: ctx.instructions,
      parentBudgetId: ctx.claim.turn.cohortId,
    },
    model: {
      decide: (request: Parameters<DecisionContext["model"]["decide"]>[0]) =>
        ctx.model.decide(ctx.claim, { ...request, model: model, signal: request.signal ?? ctx.signal }, request.stage),
      remainingCalls: () => ctx.model.remainingCalls(ctx.claim),
    },
    actions: {
      submit: (intent: Parameters<DecisionContext["actions"]["submit"]>[0]) => ctx.commands.submit(ctx.claim, intent),
    },
  } as unknown as DecisionContext;
}
export function continuityProbe(value: unknown): ContinuityV1Ports {
  const p = value as {
    context(...args: unknown[]): Promise<Data>;
    restrict(...args: unknown[]): void;
    apply(...args: unknown[]): ReturnType<ContinuityV1Ports["apply"]>;
    recordCommand(...args: unknown[]): Promise<void>;
  };
  return {
    context: (o) => p.context(undefined, undefined, o),
    restrict: (c) => p.restrict(undefined, c),
    apply: (v, raw) => p.apply(undefined, undefined, v, raw),
    recordCommand: (r) => p.recordCommand(undefined, undefined, r),
  };
}
