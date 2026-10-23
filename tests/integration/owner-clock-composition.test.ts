import { afterEach, expect, it, vi } from "vitest";
import { type ClockMode, composeOwnerClock } from "../fixtures/owner-clock-composition.js";
import { fixture } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await close?.();
  close = undefined;
});
async function run(mode: ClockMode = "success") {
  vi.stubGlobal("fetch", () => {
    throw Error("OFFLINE_NETWORK_FORBIDDEN");
  });
  const f = await fixture();
  close = () => f.pool.end();
  return composeOwnerClock(f, mode);
}
it("composes native authenticated read through v3 final with no writes or scheduled work", async () => {
  const r = await run();
  expect(r.code).toBe("COMPLETED");
  expect(r.summary).toBe('Observed requested facts: [{"id":"world.time","value":1792419240000}]');
  expect(r.fakeDecisions).toBe(3);
  expect(r.nativeReads).toBe(9);
  expect(r.catalogCalls).toBeLessThanOrEqual(16);
  expect(r.targetedReads).toBe(1);
  expect(r.observations).toBe(2);
  expect(r.maximumInputBytes).toBeLessThanOrEqual(13000);
  expect(r.maximumInputBytes).toBeGreaterThan(0);
  expect(r.routedRoles).toEqual(["resources"]);
  expect(r.nativeRoles).toEqual(["resources", "diplomacy"]);
  expect(r.nativeResourceActions).toEqual([]);
  expect(r.accepted).toBe(1);
  expect(r.offeredActions).toEqual([]);
  expect(r.gameCommands).toBe(0);
  expect(r.scheduledTasks).toBe(0);
  expect(r.persistentStateUnchanged).toBe(true);
  console.info("OWNER_CLOCK_COMPOSITION", JSON.stringify(r));
});
it("rejects a provider action bypass before acceptance or dispatch", async () => {
  const r = await run("forged-action");
  expect(r.code).toBe("UNSUPPORTED_SCHEMA");
  expect(r.accepted).toBe(0);
  expect(r.gameCommands).toBe(0);
  expect(r.persistentStateUnchanged).toBe(true);
});
it("keeps an unavailable requested native read honestly unresolved", async () => {
  const r = await run("unavailable");
  expect(r.code).toBe("INCOMPLETE");
  expect(r.summary).toBe("Requested facts remain unresolved; no result is asserted.");
  expect(r.fakeDecisions).toBe(1);
  expect(r.targetedReads).toBe(0);
  expect(r.gameCommands).toBe(0);
  expect(r.persistentStateUnchanged).toBe(true);
});
it("refuses a foreign request scope before any fake decision", async () => {
  const r = await run("foreign-request");
  expect(r.code).toBe("OWNER_REQUEST_NOT_BOUND");
  expect(r.fakeDecisions).toBe(0);
  expect(r.accepted).toBe(0);
  expect(r.gameCommands).toBe(0);
});
it("refuses mismatched native account identity before observing", async () => {
  const r = await run("wrong-account");
  expect(r.code).toBe("IDENTITY_MISMATCH");
  expect(r.fakeDecisions).toBe(0);
  expect(r.nativeReads).toBe(0);
});
it("does not turn the native periodic subscriptions into scheduled work", async () => {
  const r = await run("periodic");
  expect(r.code).toBe("ONE_SHOT_SCOPE_REQUIRED");
  expect(r.fakeDecisions).toBe(0);
  expect(r.nativeReads).toBe(0);
  expect(r.scheduledTasks).toBe(0);
});
