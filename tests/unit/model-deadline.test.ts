import { afterEach, expect, it, vi } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { modelAbortCode, modelDeadline } from "../../src/model-deadline.js";

afterEach(() => vi.useRealTimers());
const request = () =>
  ({
    model: { route: "ollama", model: "nemotron-4b", thinking: true },
    signal: new AbortController().signal,
  }) as Parameters<ModelPort["decide"]>[0];
it("refuses a new call with seconds left instead of truncating its generation allowance", () => {
  let deadline: ReturnType<typeof modelDeadline> | undefined;
  try {
    expect(() => {
      deadline = modelDeadline(request(), new Date(Date.now() + 5000), () => new Date());
    }).toThrow("MODEL_ADMISSION_DEFERRED");
  } finally {
    deadline?.close();
  }
});
it("starts the full generation allowance after tracked queueing, not before it", async () => {
  vi.useFakeTimers();
  const d = modelDeadline(
    { ...request(), onDispatch: async () => {} },
    new Date(Date.now() + 400000),
    () => new Date(),
    true,
  );
  try {
    await vi.advanceTimersByTimeAsync(150000);
    await d.onDispatch();
    await vi.advanceTimersByTimeAsync(40000);
    expect(d.signal.aborted).toBe(false);
    expect(() => d.check()).not.toThrow();
    await vi.advanceTimersByTimeAsync(140000);
    expect(d.signal.aborted).toBe(true);
    expect(() => d.check()).toThrow("MODEL_DEADLINE_EXCEEDED");
  } finally {
    d.close();
  }
});
it("refuses dispatch after slow preparation consumes the full-call headroom", async () => {
  vi.useFakeTimers();
  const dispatch = vi.fn();
  const d = modelDeadline(
    { ...request(), onDispatch: dispatch },
    new Date(Date.now() + 200000),
    () => new Date(),
    true,
  );
  try {
    await vi.advanceTimersByTimeAsync(20000);
    await expect(d.onDispatch()).rejects.toMatchObject({ code: "MODEL_ADMISSION_DEFERRED", notDispatched: true });
    expect(dispatch).not.toHaveBeenCalled();
  } finally {
    d.close();
  }
});
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
  const d = modelDeadline(r, new Date(Date.now() + 400000), () => new Date(), true);
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
  expect(() => modelDeadline(r, new Date(Date.now() + 1000), () => new Date())).toThrow("MODEL_ADMISSION_DEFERRED");
  expect(r.onDispatch).not.toHaveBeenCalled();
});
it("cancels generation before turn expiry and fences a late provider result", async () => {
  vi.useFakeTimers();
  const r = { ...request(), onDispatch: vi.fn() },
    d = modelDeadline(r, new Date(Date.now() + 400000), () => new Date(), true);
  await d.onDispatch();
  await vi.advanceTimersByTimeAsync(180000);
  expect(d.signal.aborted).toBe(true);
  expect(() => d.check()).toThrow("MODEL_DEADLINE_EXCEEDED");
  expect(r.onDispatch).toHaveBeenCalledTimes(1);
  d.close();
});
it("checks dispatch after delayed preparation and forwards owner cancellation", async () => {
  vi.useFakeTimers();
  const parent = new AbortController(),
    r = { ...request(), signal: parent.signal, onDispatch: vi.fn() };
  const d = modelDeadline(r, new Date(Date.now() + 400000), () => new Date(), true);
  parent.abort();
  await expect(d.onDispatch()).rejects.toThrow();
  expect(r.onDispatch).not.toHaveBeenCalled();
  d.close();
});
it("does not classify an invoked untracked provider as undispatched after expiry", async () => {
  vi.useFakeTimers();
  const d = modelDeadline(request(), new Date(Date.now() + 400000), () => new Date(), false);
  await vi.advanceTimersByTimeAsync(180000);
  try {
    d.check();
    throw Error("EXPECTED_EXPIRY");
  } catch (error) {
    expect(error).toMatchObject({ code: "MODEL_DEADLINE_EXCEEDED", notDispatched: false });
  }
  d.close();
});
it("preserves the first cancellation cause when the generation timer later expires", async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  const d = modelDeadline(
    { ...request(), signal: parent.signal },
    new Date(Date.now() + 400000),
    () => new Date(),
    true,
  );
  try {
    await d.onDispatch();
    parent.abort(new FleetError("HOST_STOPPED"));
    await vi.advanceTimersByTimeAsync(180000);
    expect(() => d.check()).toThrow("HOST_STOPPED");
  } finally {
    d.close();
  }
});
it("refuses overlapping dispatch hooks before the first hook finishes", async () => {
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const callback = vi.fn(() => pending);
  const d = modelDeadline(
    { ...request(), onDispatch: callback },
    new Date(Date.now() + 400000),
    () => new Date(),
    true,
  );
  const first = d.onDispatch();
  try {
    await expect(Promise.race([d.onDispatch(), Promise.resolve("hook still pending")])).rejects.toThrow(
      "MODEL_DISPATCH_REPEATED",
    );
    expect(callback).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await first;
    d.close();
  }
});
it("rechecks headroom after a delayed dispatch authorization hook", async () => {
  vi.useFakeTimers();
  const d = modelDeadline(
    {
      ...request(),
      onDispatch: async () => {
        await vi.advanceTimersByTimeAsync(20000);
      },
    },
    new Date(Date.now() + 200000),
    () => new Date(),
    true,
  );
  try {
    await expect(d.onDispatch()).rejects.toMatchObject({ code: "MODEL_ADMISSION_DEFERRED", notDispatched: true });
  } finally {
    d.close();
  }
});
