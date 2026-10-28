import { FleetError, type ModelPort } from "./domain.js";
import { modelAdmissionDeadline, modelCallBound } from "./model-bounds.js";

export function assertModelAdmission(model: Parameters<ModelPort["decide"]>[0]["model"], deadline: Date, now: Date) {
  if (now.getTime() >= modelAdmissionDeadline(model, deadline)) throw new FleetError("MODEL_ADMISSION_DEFERRED", true);
}

/** Preserve explicit host cancellation causes without exposing arbitrary provider text. */
export function modelAbortCode(reason: unknown): string {
  return reason instanceof FleetError &&
    [
      "MODEL_ADMISSION_DEFERRED",
      "MODEL_DEADLINE_EXCEEDED",
      "TURN_DEADLINE_EXCEEDED",
      "DEADLINE_MISSED",
      "TASK_FENCED",
      "CLAIM_FENCED",
      "HOST_STOPPED",
    ].includes(reason.code)
    ? reason.code
    : "CLAIM_FENCED";
}

/** Leave accounting time inside the turn lease. Cancellation does not prove non-dispatch,
 * and the caller must retain its capacity lease until the provider actually settles. */
export function modelDeadline(
  request: Parameters<ModelPort["decide"]>[0],
  deadline: Date,
  now: () => Date,
  tracksDispatch = false,
) {
  assertModelAdmission(request.model, deadline, now());
  let started = !tracksDispatch;
  let endsAt = started
    ? now().getTime() + modelCallBound(request.model)
    : modelAdmissionDeadline(request.model, deadline);
  const controller = new AbortController();
  let dispatched = false,
    dispatchRequested = false;
  const arm = () =>
    setTimeout(
      () => controller.abort(new FleetError(started ? "MODEL_DEADLINE_EXCEEDED" : "MODEL_ADMISSION_DEFERRED")),
      Math.max(1, endsAt - now().getTime()),
    );
  let timer = arm();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const check = (beforeDispatch = false) => {
    if (signal.aborted) throw new FleetError(modelAbortCode(signal.reason), beforeDispatch && !dispatched);
    if (now().getTime() >= endsAt)
      throw new FleetError(
        started ? "MODEL_DEADLINE_EXCEEDED" : "MODEL_ADMISSION_DEFERRED",
        beforeDispatch && !dispatched,
      );
  };
  return {
    signal,
    check,
    async onDispatch() {
      if (dispatchRequested) throw new FleetError("MODEL_DISPATCH_REPEATED");
      dispatchRequested = true;
      check(true);
      assertModelAdmission(request.model, deadline, now());
      await request.onDispatch?.();
      check(true);
      assertModelAdmission(request.model, deadline, now());
      if (!started) {
        started = true;
        endsAt = now().getTime() + modelCallBound(request.model);
        clearTimeout(timer);
        timer = arm();
      }
      dispatched = true;
    },
    close() {
      clearTimeout(timer);
    },
  };
}
