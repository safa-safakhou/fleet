import { expect, it } from "vitest";
import type { OwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import { runNativeOwnedCell } from "../../scripts/lib/negotiation-native-run.js";
import { FleetError } from "../../src/domain.js";
import type { NegotiationCell } from "../../src/negotiation-plan.js";
import type { PlatformHost } from "../../src/platform/supervisor.js";
import type { TaskStore } from "../../src/platform/tasks.js";
import { protocolFixture } from "../fixtures/negotiation/protocol.js";

it("retains the original native clock failure when its stop aborts a scheduler wait", async () => {
  const f = protocolFixture("E4"),
    stop = new AbortController();
  let pauses = 0,
    modelTurns = 0;
  const world = {
    startNativeClock: async () => {},
    pauseClock: async () => {
      pauses++;
    },
    tickNativeClock: async () => {
      throw new FleetError("OWNED_CLOCK_LOST", true);
    },
  } as unknown as OwnedNegotiationWorld;
  await expect(
    runNativeOwnedCell({
      cell: f.protocol.cells[0] as NegotiationCell,
      binding: f.grant.bindings[0],
      world,
      control: world,
      signal: stop.signal,
      cutoff: Date.now() + 10000,
      check: async () => {},
      setClaim: () => {},
      abortBatch: () => stop.abort(),
      persist: async () => {},
      tasks: { claim: async () => null } as unknown as TaskStore,
      host: {
        run: async () => {
          modelTurns++;
        },
      } as unknown as PlatformHost,
      allocations: async () => [],
      reviewOutcome: async () => ({ claims: [], reviews: [] }),
      evidenceLevel: "fake-provider",
    }),
  ).rejects.toThrow("OWNED_CLOCK_LOST");
  expect(stop.signal.aborted).toBe(true);
  expect(pauses).toBe(2);
  expect(modelTurns).toBe(0);
});
