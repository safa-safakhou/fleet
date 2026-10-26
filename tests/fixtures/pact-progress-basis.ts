import { type Data, object } from "../../src/domain.js";

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
