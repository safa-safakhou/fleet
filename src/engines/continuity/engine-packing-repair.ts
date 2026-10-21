import type { Data } from "../../domain.js";
import { FleetError } from "../../domain.js";
import { ContinuityDecisionStep } from "../../modules/continuity/v1/decision.js";
import { ContinuityV1 } from "../../modules/continuity/v1/state.js";
import type { DecisionContext } from "../../modules/decision-step/v1/context.js";
import { decisionContext } from "../../modules/decision-step/v1/context.js";
import { shareGenerationSchema } from "../../modules/generation-schema/v1.js";
import type { ArchitectureDefinition } from "../../platform/architecture.js";
import { manifest as original, validate } from "./manifest.js";
/** Explicit approved baseline amendment; original @1 remains unchanged. */
export class PackingRepairDecisionStep extends ContinuityDecisionStep {
  async runContext(ctx: DecisionContext) {
    const project = ctx.projectObservation;
    if (!project) throw new FleetError("PACKING_REPAIR_POLICY_REQUIRED", true);
    const full = ctx.observation.continuity ? ctx.observation : await ctx.observe({ continuity: true });
    return super.runContext({
      ...ctx,
      observation: project(full, { id: "negotiation", version: "1" }),
      observe: async (query) =>
        project(await ctx.observe({ ...query, continuity: true }), { id: "negotiation", version: "1" }),
    });
  }
  protected generationSchema(payload: Data, base: Data): Data {
    return shareGenerationSchema(super.generationSchema(payload, base));
  }
}
export const definition: ArchitectureDefinition = {
  manifest: {
    ...original,
    ref: { id: "reactive-cognition", version: "1.1" },
    name: "Reactive cognition packing repair",
    description:
      "Approved separate baseline: v1 continuity with shared schema and explicit negotiation observation view.",
    requirements: {
      ...original.requirements,
      schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
    },
    modules: [
      ...original.modules,
      { id: "generation-schema-sharing", version: "1" },
      { id: "pact-negotiation-view", version: "1" },
    ],
  },
  validate,
  create: (services) => ({
    route: () => [],
    run: (op) =>
      new PackingRepairDecisionStep(new ContinuityV1(services.continuity)).runContext(decisionContext(op, services)),
  }),
};
