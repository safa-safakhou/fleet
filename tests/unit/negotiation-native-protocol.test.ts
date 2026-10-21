import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { executeNegotiationProtocol } from "../../src/negotiation-run.js";
import { protocolFixture } from "../fixtures/negotiation/protocol.js";

it("E4 refuses missing trusted native timing capability before nonce admission", async () => {
  const f = protocolFixture("E4");
  Object.assign(f.ports, { timingMode: undefined });
  await expect(executeNegotiationProtocol(f.protocol, f.grant, f.ports)).rejects.toThrow(
    "OWNED_NATIVE_SCHEDULER_ACCEPTANCE_REQUIRED",
  );
  expect(f.counts()).toMatchObject({ runs: 0, nonceClaims: 0 });
});
it("native world hosts start together only after both scoped windows open", async () => {
  const f = protocolFixture("E4"),
    run = f.ports.runCell;
  Object.assign(f.ports, { timingMode: "native" });
  let opened = 0,
    entered = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.ports.openCell = async () => {
    opened++;
  };
  f.ports.runCell = async (...args) => {
    expect(opened).toBe(2);
    entered++;
    await gate;
    return run(...args);
  };
  const pending = executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  await delay(100);
  const simultaneous = entered === 2;
  release();
  const result = await pending;
  expect(simultaneous).toBe(true);
  expect(result.status).toBe("complete");
  expect(f.counts().runs).toBe(2);
});
it("a lost UTC clock after native nonce admission still terminalizes the consumed batch", async () => {
  const f = protocolFixture("E4"),
    claim = f.ports.claimNonce;
  f.ports.claimNonce = async (...args) => {
    const admitted = await claim(...args);
    f.ports.now = () => Number.NaN;
    return admitted;
  };
  const result = await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  expect(result.status).toBe("stopped");
  expect(f.counts()).toMatchObject({ runs: 0, nonceClaims: 1, finished: 1 });
});
it("a critical native result aborts sibling admission before its next effect", async () => {
  const f = protocolFixture("E4"),
    run = f.ports.runCell;
  Object.assign(f.ports, { timingMode: "native" });
  let siblingEntered = false,
    effects = 0;
  f.ports.runCell = async (cell, binding, controls) => {
    if (cell.id === f.protocol.cells[0].id) {
      await delay(20);
      return { ...(await run(cell, binding, controls)), status: "fail", criticalFailures: ["FALSE_CONSENT"] };
    }
    siblingEntered = true;
    if (!controls.signal.aborted)
      await new Promise<void>((resolve) => controls.signal.addEventListener("abort", () => resolve(), { once: true }));
    await controls.guard({ phase: "call", actorId: binding.actorIds[0], turnId: "synthetic-not-admitted" });
    effects++;
    return run(cell, binding, controls);
  };
  const result = await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  expect(siblingEntered).toBe(true);
  expect(effects).toBe(0);
  expect(result.status).toBe("stopped");
  expect(result.cells[0].assessment?.criticalFailures).toEqual(["FALSE_CONSENT"]);
  expect(f.counts().finished).toBe(1);
});
