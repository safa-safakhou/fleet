import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { AwakeGuard } from "../../src/awake.js";
import { recoveryPlan } from "../../src/recovery.js";

describe("process-scoped awake guard", () => {
  it("asserts only while enabled and running; releases and recovers after child exit", () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const launch = vi.fn(() => child as unknown as ChildProcess);
    const guard = new AwakeGuard(true, "darwin", launch as unknown as typeof spawn);
    guard.update(false);
    expect(launch).not.toHaveBeenCalled();
    guard.update(true);
    guard.update(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0]).toEqual([
      "/usr/bin/caffeinate",
      ["-i", "-s", "-w", String(process.pid)],
      { stdio: "ignore" },
    ]);
    child.emit("exit");
    guard.update(true);
    expect(launch).toHaveBeenCalledTimes(2);
    guard.update(false);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    guard.close();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
  it("never changes power behavior on other platforms or when disabled", () => {
    const launch = vi.fn();
    new AwakeGuard(true, "linux", launch as unknown as typeof spawn).update(true);
    new AwakeGuard(false, "darwin", launch as unknown as typeof spawn).update(true);
    expect(launch).not.toHaveBeenCalled();
  });
});
describe("truthful recovery paths", () => {
  it("preserves uncertainty and distinguishes receipts, reconnects and terminal history", () => {
    const plan = recoveryPlan("paused", "needs_reconnect", "needs_owner", [
      { id: "pending", state: "pending", pending_command: "exact" },
      { id: "unknown", state: "needs_owner" },
    ]);
    expect(plan.resumable).toBe(false);
    expect(plan.steps.map((s) => s.kind)).toEqual(["reconnect", "reconcile", "review_execution"]);
    expect(plan.steps[1].instruction).toContain("never replay");
    expect(recoveryPlan("finished", "ready", "needs_owner", []).status).toBe("terminal");
    expect(recoveryPlan("paused", "ready", "ready", []).resumable).toBe(true);
  });
});
