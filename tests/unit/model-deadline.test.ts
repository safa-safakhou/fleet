import { afterEach, expect, it, vi } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { modelAbortCode, modelDeadline } from "../../src/model-deadline.js";

afterEach(() => vi.useRealTimers());
const request = () =>
  ({
    model: { route: "ollama", model: "nemotron-4b", thinking: true },
    signal: new AbortController().signal,
  }) as Parameters<ModelPort["decide"]>[0];
it.each([
  "MODEL_DEADLINE_EXCEEDED",
  "TURN_DEADLINE_EXCEEDED",
  "DEADLINE_MISSED",
  "TASK_FENCED",
  "CLAIM_FENCED",
  "HOST_STOPPED",
])("preserves the actual %s cancellation before dispatch", async (code) => {
  const controller = new AbortController(),
    r = { ...request(), signal: controller.signal, onDispatch: vi.fn() };
  const d = modelDeadline(r, new Date(Date.now() + 5000), () => new Date());
  controller.abort(new FleetError(code));
  try {
    expect(modelAbortCode(controller.signal.reason)).toBe(code);
    await expect(d.onDispatch()).rejects.toMatchObject({ code, notDispatched: true });
    expect(r.onDispatch).not.toHaveBeenCalled();
  } finally {
    d.close();
  }
});
it("does not dispatch when queue time consumed the settlement reserve", async () => {
  vi.useFakeTimers();
  const r = { ...request(), onDispatch: vi.fn() };
  expect(() => modelDeadline(r, new Date(Date.now() + 1000), () => new Date())).toThrow("MODEL_DEADLINE_EXCEEDED");
  expect(r.onDispatch).not.toHaveBeenCalled();
});
it("cancels generation before turn expiry and fences a late provider result", async () => {
  vi.useFakeTimers();
  const r = { ...request(), onDispatch: vi.fn() },
    d = modelDeadline(r, new Date(Date.now() + 5000), () => new Date());
  await d.onDispatch();
  await vi.advanceTimersByTimeAsync(4000);
  expect(d.signal.aborted).toBe(true);
  expect(() => d.check()).toThrow("MODEL_DEADLINE_EXCEEDED");
  expect(r.onDispatch).toHaveBeenCalledTimes(1);
  d.close();
});
it("checks dispatch after delayed preparation and forwards owner cancellation", async () => {
  vi.useFakeTimers();
  const parent = new AbortController(),
    r = { ...request(), signal: parent.signal, onDispatch: vi.fn() };
  const d = modelDeadline(r, new Date(Date.now() + 10000), () => new Date());
  parent.abort();
  await expect(d.onDispatch()).rejects.toThrow();
  expect(r.onDispatch).not.toHaveBeenCalled();
  d.close();
});
it("does not classify an invoked untracked provider as undispatched after expiry", async () => {
  vi.useFakeTimers();
  const d = modelDeadline(request(), new Date(Date.now() + 1100), () => new Date());
  await vi.advanceTimersByTimeAsync(100);
  try {
    d.check();
    throw Error("EXPECTED_EXPIRY");
  } catch (error) {
    expect(error).toMatchObject({ code: "MODEL_DEADLINE_EXCEEDED", notDispatched: false });
  }
  d.close();
});
