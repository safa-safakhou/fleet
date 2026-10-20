import { ContinuityDecisionStep } from "../../modules/continuity/v1/decision.js";
import type { ContinuityV1Ports } from "../../modules/continuity/v1/ports.js";
import { ContinuityV1 } from "../../modules/continuity/v1/state.js";
import { type DecisionContext, decisionContext } from "../../modules/decision-step/v1/context.js";
import type { ScopedServices } from "../../platform/engine-context.js";
import { manifest, validate } from "./manifest.js";
export class ContinuityEngine {
  readonly manifest = manifest;
  readonly ref = manifest.ref;
  readonly requiredCapabilities = manifest.requirements.capabilities;
  constructor(private override?: ContinuityV1Ports) {}
  create(services: ScopedServices) {
    return {
      route: () => [],
      run: (operation: Parameters<typeof decisionContext>[0]) => this.run(decisionContext(operation, services)),
    };
  }
  run(ctx: DecisionContext) {
    return new ContinuityDecisionStep(new ContinuityV1(this.override ?? ctx.continuity)).runContext(ctx);
  }
}

export const definition: import("../../platform/architecture.js").ArchitectureDefinition = {
  manifest,
  validate,
  create: (services) => new ContinuityEngine().create(services),
};
