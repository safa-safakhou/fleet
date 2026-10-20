import { type DecisionContext, decisionContext } from "../../modules/decision-step/v1/context.js";
import { BoundedDecisionStep } from "../../modules/decision-step/v1/engine.js";
import type { ScopedServices } from "../../platform/engine-context.js";
import { manifest } from "./manifest.js";

export { ReactiveDecision, RejectedDecision } from "../../modules/decision-step/v1/engine.js";
export class ReactiveEngine {
  readonly manifest = manifest;
  readonly ref = manifest.ref;
  readonly requiredCapabilities = manifest.requirements.capabilities;
  create(services: ScopedServices) {
    return {
      route: () => [],
      run: (operation: Parameters<typeof decisionContext>[0]) => this.run(decisionContext(operation, services)),
    };
  }
  run(ctx: DecisionContext) {
    return new BoundedDecisionStep().runContext(ctx);
  }
}
