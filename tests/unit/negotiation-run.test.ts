import { expect, it } from "vitest";
import { negotiationCLI } from "../../src/negotiation-cli.js";
import type { NegotiationExecutionPorts } from "../../src/negotiation-run.js";
import {
  executeNegotiationProtocol,
  prepareNegotiationProtocol,
  validateNegotiationAuthorization,
} from "../../src/negotiation-run.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { protocolFixture } from "../fixtures/negotiation/protocol.js";

const selection = { ...selections, settingsDigest: "e".repeat(64), stage: "E1" };
it("preview is disarmed, exposes missing selections, and computes caps without execution capability", () => {
  const preview = prepareNegotiationProtocol({ stage: "E1" });
  expect(preview).toMatchObject({
    ready: false,
    realProviderAuthorized: false,
    maxima: { calls: 144, reservedTokens: 5760000, wallDeadlineMs: 21600000 },
  });
  expect(preview.missingReadiness).toEqual(
    expect.arrayContaining(["model_digest", "settings_digest", "private_approved_grant"]),
  );
  expect(JSON.stringify(preview)).not.toContain("http");
});
it("no grant or changed protocol can authorize dispatch", async () => {
  const protocol = prepareNegotiationProtocol(selection);
  expect(validateNegotiationAuthorization(protocol, null).valid).toBe(false);
  let calls = 0;
  await expect(
    executeNegotiationProtocol(protocol, null, {
      now: () => Date.now(),
      runCell: async () => {
        calls++;
      },
    } as unknown as NegotiationExecutionPorts),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
it("unsupported versions cannot silently resolve to another profile", () => {
  expect(() =>
    prepareNegotiationProtocol({ ...selection, selectedProfile: { id: "specialist-coordinator", version: "1" } }),
  ).toThrow();
});

it.each(["missing", "source", "model", "nonce", "expired", "extra_cell", "duplicate_world", "settings"])(
  "%s grant failure makes zero native execution calls",
  async (kind) => {
    const f = protocolFixture();
    let grant: unknown = structuredClone(f.grant);
    if (kind === "missing") grant = null;
    else {
      const g = grant as typeof f.grant;
      if (kind === "source") g.sources.fleet = "0".repeat(40);
      if (kind === "model") g.modelDigest = "0".repeat(64);
      if (kind === "settings") g.settingsDigest = "0".repeat(64);
      if (kind === "expired") g.cutoffAt = "2026-10-20T00:00:00Z";
      if (kind === "extra_cell") g.bindings.push({ ...g.bindings[0], cellId: "replacement" });
      if (kind === "duplicate_world") g.bindings[1].worldId = g.bindings[0].worldId;
      if (kind === "nonce") g.batchNonce = "00000000-0000-4000-8000-000000000000";
    }
    await expect(executeNegotiationProtocol(f.protocol, grant, f.ports)).rejects.toThrow();
    expect(f.counts()).toMatchObject({ runs: 0, nonceClaims: 0 });
  },
);
it("nonce replay stays terminal and preview/validation never call native ports", async () => {
  const f = protocolFixture();
  expect(
    validateNegotiationAuthorization(f.protocol, f.grant, { now: f.ports.now(), usedNonces: [f.protocol.batchNonce] })
      .valid,
  ).toBe(false);
  await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  expect(f.counts().runs).toBe(2);
  await expect(executeNegotiationProtocol(f.protocol, f.grant, f.ports)).rejects.toThrow("NONCE_ALREADY_CONSUMED");
  expect(f.counts().runs).toBe(2);
  const preview = await negotiationCLI([], {
    readJSON: async () => {
      throw Error("unexpected read");
    },
    executionPorts: f.ports,
  });
  expect(preview).toMatchObject({ ready: false });
  expect(f.counts().runs).toBe(2);
});
it.each([
  "world_calls",
  "turn_calls",
  "turns",
  "unknown",
  "uncertain_command",
  "privacy",
  "ownership",
  "authority",
  "duplicate_effect",
  "source_drift",
  "cutoff",
  "game_horizon",
  "clock_inflight",
  "clock_unscheduled",
])("%s stops before another native effect and retains original ledger rows", async (kind) => {
  const f = protocolFixture(),
    first = f.protocol.cells[0],
    binding = f.grant.bindings[0],
    state = f.records.get(first.id)!;
  if (kind === "world_calls")
    for (let i = 0; i < 72; i++)
      state.allocations.push({
        id: `allocation:${i}`,
        actorId: binding.actorIds[i % 2],
        turnId: `turn:${Math.floor(i / 6)}`,
        reservedTokens: 40000,
        inputTokens: 1,
        outputTokens: 1,
        status: "reported",
      });
  if (kind === "turn_calls")
    for (let i = 0; i < 3; i++)
      state.allocations.push({
        id: `allocation:${i}`,
        actorId: binding.actorIds[0],
        turnId: "turn",
        reservedTokens: 40000,
        inputTokens: 1,
        outputTokens: 1,
        status: "reported",
      });
  if (kind === "turns")
    state.turns = Array.from({ length: 12 }, (_, i) => ({ actorId: binding.actorIds[0], turnId: `turn${i}` }));
  if (kind === "unknown")
    state.allocations.push({
      id: "unknown-original",
      actorId: binding.actorIds[0],
      turnId: "turn",
      reservedTokens: 40000,
      inputTokens: null,
      outputTokens: null,
      status: "unknown",
    });
  if (kind === "uncertain_command") state.uncertainCommands = ["original-command"];
  if (kind === "privacy") state.privacyValid = false;
  if (kind === "ownership") state.ownershipValid = false;
  if (kind === "authority") state.authorityValid = false;
  if (kind === "duplicate_effect") state.duplicateEffects = 1;
  if (kind === "game_horizon") state.gameTimeMs = String(181 * 60000);
  if (kind === "clock_inflight") state.inFlight = 1;
  let effects = 0;
  f.simulate(async (_cell, guard) => {
    if (kind === "cutoff") f.advance(first.limits.wallDeadlineMs + 1);
    if (kind === "source_drift")
      f.ports.preflight = async () => ({
        sources: { ...f.grant.sources, fleet: "0".repeat(40) },
        modelDigest: f.grant.modelDigest,
        policyDigest: f.grant.policyDigest,
        settingsDigest: f.grant.settingsDigest,
        owned: true,
        fresh: false,
        evidenceReady: true,
      });
    await guard({
      phase: kind.startsWith("clock_") ? "clock" : kind === "turns" ? "turn" : "call",
      actorId: binding.actorIds[0],
      turnId: "turn",
      targetGameTimeMs: kind === "clock_unscheduled" ? "120000" : "60000",
    });
    effects++;
  });
  const before = JSON.stringify(state.allocations),
    result = await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  expect(effects).toBe(0);
  expect(result.status).toBe("stopped");
  expect(result.cells[1].status).toBe("not_started");
  expect(JSON.stringify(state.allocations)).toBe(before);
  expect(f.counts().finished).toBe(1);
});
it("semantic critical failure ends an E1 cell but stops an E3 batch; no replacement cells", async () => {
  for (const stage of ["E1", "E3"] as const) {
    const f = protocolFixture(stage),
      run = f.ports.runCell;
    f.ports.runCell = async (...args) => ({
      ...(await run(...args)),
      status: "fail",
      criticalFailures: ["FALSE_CONSENT"],
    });
    const result = await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
    expect(f.counts().runs).toBe(stage === "E1" ? 2 : 1);
    expect(result.cells).toHaveLength(f.protocol.cells.length);
    expect(result.status).toBe(stage === "E1" ? "complete" : "stopped");
  }
});
it("native timing rejects controlled jumps and extra cells never receive permission", async () => {
  const f = protocolFixture("E4"),
    binding = f.grant.bindings[0];
  f.simulate(async (_id, guard) => guard({ phase: "clock", targetGameTimeMs: "60000" }));
  const result = await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  expect(result.status).toBe("stopped");
  expect(result.cells[0].reason).toBe("NEGOTIATION_CLOCK_ADVANCE_FORBIDDEN");
  expect(binding.worldId).not.toBe(binding.controlWorldId);
});

it("source/config drift after a response stops admission and preserves the original result", async () => {
  const f = protocolFixture(),
    run = f.ports.runCell;
  f.ports.runCell = async (...args) => {
    const result = await run(...args);
    f.ports.preflight = async () => ({
      sources: f.grant.sources,
      modelDigest: "0".repeat(64),
      policyDigest: f.grant.policyDigest,
      settingsDigest: f.grant.settingsDigest,
      owned: true,
      fresh: false,
      evidenceReady: true,
    });
    return result;
  };
  const result = await executeNegotiationProtocol(f.protocol, f.grant, f.ports);
  expect(result.status).toBe("stopped");
  expect(result.cells[0].assessment).toBeDefined();
  expect(result.cells[1].status).toBe("not_started");
});
it("malformed clocks and forged same-ID cell limits fail closed", async () => {
  const f = protocolFixture();
  expect(validateNegotiationAuthorization(f.protocol, f.grant, { now: Number.NaN }).valid).toBe(false);
  f.simulate(async (_id, guard) => {
    f.ports.now = () => Number.NaN;
    await guard({ phase: "action", actorId: f.grant.bindings[0].actorIds[0] });
  });
  expect((await executeNegotiationProtocol(f.protocol, f.grant, f.ports)).cells[0].reason).toBe(
    "NEGOTIATION_CLOCK_UNAVAILABLE",
  );
  const g = protocolFixture(),
    run = g.ports.runCell;
  g.ports.runCell = async (...args) => {
    const result = await run(...args);
    return { ...result, cell: { ...result.cell, limits: { ...result.cell.limits, callsPerWorld: 999 } } };
  };
  expect((await executeNegotiationProtocol(g.protocol, g.grant, g.ports)).cells[0].reason).toBe(
    "NEGOTIATION_RESULT_SCOPE",
  );
});
it("CLI execution requires both a saved exact protocol and an injected owned native composition", async () => {
  const f = protocolFixture();
  const readJSON = async (path: string) => (path === "protocol" ? f.protocol : f.grant);
  await expect(negotiationCLI(["--execute-approved", "grant"], { readJSON, executionPorts: f.ports })).rejects.toThrow(
    "EXACT_NEGOTIATION_PROTOCOL_REQUIRED",
  );
  // Clock is supplied only for validation; no runnable native path is installed by preview.
  const value = await negotiationCLI(["--protocol", "protocol", "--execute-approved", "grant"], {
    readJSON,
    executionPorts: f.ports,
  });
  expect(value).toMatchObject({ status: "complete" });
  expect(f.counts().runs).toBe(2);
});
