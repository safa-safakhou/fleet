import { type BudgetConfig, FleetError, type ModelSettings } from "./domain.js";
/** Thinking uses the same accounting and outer deadlines, with bounded generation time. */
export const modelCallBound = (model: ModelSettings) =>
  model.callTimeoutMs ?? (model.thinking === true ? 180000 : 90000);
export const modelTurnBound = (model: ModelSettings) => (model.thinking === true ? 360000 : 120000);
/** Latest admission leaves the full generation bound and the existing accounting margin. */
export const modelAdmissionDeadline = (model: ModelSettings, turnDeadline: Date) =>
  turnDeadline.getTime() - modelCallBound(model) - 1000;

/** Opt-in call envelopes must fit without enlarging either historical ceiling. */
export function assertModelCallEnvelope(model: ModelSettings, budget: Pick<BudgetConfig, "maxCallsPerTurn">) {
  if (
    model.callTimeoutMs !== undefined &&
    (modelCallBound(model) + 1000) * budget.maxCallsPerTurn > modelTurnBound(model)
  )
    throw new FleetError("MODEL_WORKFLOW_TIME_INFEASIBLE", true);
}
