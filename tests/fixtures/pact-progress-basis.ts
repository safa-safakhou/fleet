import { type Data, object } from "../../src/domain.js";

/** Current native HTTP fixtures use the reference actually delivered in the expanded generation schema. */
export function fixtureSchemaBasis(schema: Data, kind: "wait" | "action"): Data {
  const branches = object(object(schema.properties).decision).oneOf as Data[];
  const branch = branches.find((branch) => object(object(branch.properties).kind).const === kind);
  const properties = object(branch?.properties);
  if (kind === "action") {
    const basis = object(object(object(properties.expectedOutcome).properties).basis).const;
    if (typeof object(basis).observationRef !== "string") throw Error("FIXTURE_REFERENCE_REQUIRED");
    return object(basis);
  }
  const basis = object(properties.basis),
    ref = object(object(basis.properties).observationRef).const;
  if (typeof ref !== "string") throw Error("FIXTURE_REFERENCE_REQUIRED");
  return {
    observationRef: ref,
    ...(Array.isArray(basis.required) && basis.required.includes("deferral")
      ? {
          deferral: {
            reason: "deliberate_pacing",
            explanation: "Measure this synthetic input without prescribing a game action.",
            reconsiderWhen: "Next synthetic review.",
          },
        }
      : {}),
  };
}

/** Synthetic providers copy only facts actually delivered to them; never use a database oracle. */
export function fixtureGoalBasis(packet: Data): Data | undefined {
  const state = object(object(packet.specialist).currentState ?? object(packet.goal).currentState);
  if (!state.completedLevels || !state.queuedPhases) return;
  return {
    completedLevels: state.completedLevels,
    queuedPhases: state.queuedPhases,
    ...(typeof state.opportunityRevision === "string" ? { opportunityRevision: state.opportunityRevision } : {}),
  };
}
export function fixtureWaitBasis(packet: Data): Data {
  const basis = fixtureGoalBasis(packet);
  return basis
    ? {
        basis: {
          ...basis,
          ...(basis.opportunityRevision
            ? {
                deferral: {
                  reason: "different_owner_priority",
                  explanation:
                    "This synthetic role observes its assigned concern and leaves other available work to its responsible role.",
                  reconsiderWhen: "The next relevant observation or owner task.",
                },
              }
            : {}),
        },
      }
    : {};
}
