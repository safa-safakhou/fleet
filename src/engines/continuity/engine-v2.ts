import { NegotiationDecisionStep } from "../../modules/continuity/v2/decision.js";
import { decisionContext } from "../../modules/decision-step/v1/context.js";
import type { ArchitectureDefinition } from "../../platform/architecture.js";
import { manifest } from "./manifest-v2.js";
export const definition: ArchitectureDefinition = {
  manifest,
  validate: (_config, launch) => {
    const model = launch.model as import("../../domain.js").Data | undefined;
    return model && (model.cognition || model.recallAssist || model.decisionPolicy)
      ? [
          {
            path: "/model",
            code: "PROFILE_CONFIGURATION_MISMATCH",
            detail: "This version owns its evidence policy; legacy flags are unsupported.",
          },
        ]
      : [];
  },
  create: (services) => ({
    route: () => [],
    run: (op) => new NegotiationDecisionStep().runContext(decisionContext(op, services)),
  }),
};
