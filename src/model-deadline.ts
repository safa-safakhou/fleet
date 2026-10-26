import { FleetError, type ModelPort } from "./domain.js";
import { modelCallBound } from "./model-bounds.js";

/** Leave accounting time inside the turn lease. Cancellation does not prove non-dispatch,
 * and the caller must retain its capacity lease until the provider actually settles. */
export function modelDeadline(request: Parameters<ModelPort["decide"]>[0], deadline: Date, now: () => Date) {
  const endsAt = Math.min(now().getTime() + modelCallBound(request.model), deadline.getTime() - 1000);
  if (endsAt <= now().getTime()) throw new FleetError("MODEL_DEADLINE_EXCEEDED", true);
  const controller = new AbortController();
  let dispatched = false;
  const timer = setTimeout(() => controller.abort(new FleetError("MODEL_DEADLINE_EXCEEDED")), endsAt - now().getTime());
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const check = (beforeDispatch = false) => {
    if (now().getTime() >= endsAt || controller.signal.aborted)
      throw new FleetError("MODEL_DEADLINE_EXCEEDED", beforeDispatch && !dispatched);
    if (signal.aborted) throw new FleetError("CLAIM_FENCED", beforeDispatch && !dispatched);
  };
  return {
    signal,
    check,
    async onDispatch() {
      check(true);
      await request.onDispatch?.();
      check(true);
      dispatched = true;
    },
    close() {
      clearTimeout(timer);
    },
  };
}
