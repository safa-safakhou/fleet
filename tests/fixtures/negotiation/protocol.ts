import { randomUUID } from "node:crypto";
import { assessNegotiation } from "../../../src/negotiation-evaluation.js";
import { designDigest } from "../../../src/negotiation-plan.js";
import {
  type NativeAccounting,
  type NegotiationExecutionPorts,
  type NegotiationGrant,
  type NegotiationGuardInput,
  prepareNegotiationProtocol,
} from "../../../src/negotiation-run.js";
import { evidenceFixture, selections } from "./evidence.js";
/** Native-port simulation only. No provider, game or real qualification record. */
export function protocolFixture(stage: "E1" | "E2" | "E3" | "E4" = "E1") {
  const protocol = prepareNegotiationProtocol({ ...selections, settingsDigest: "e".repeat(64), stage });
  let time = Date.parse("2026-10-21T10:00:01Z"),
    starts = Date.parse("2026-10-21T10:00:00Z"),
    runs = 0,
    nonceClaims = 0,
    finished = 0;
  const grant: NegotiationGrant = {
    schemaVersion: "fleet.negotiation-grant.v1",
    approved: true,
    authorizationRef: "synthetic-test-authorization",
    protocolDigest: protocol.digest,
    batchNonce: protocol.batchNonce,
    sources: selections.sources,
    modelDigest: selections.modelDigest,
    policyDigest: selections.policyDigest,
    settingsDigest: "e".repeat(64),
    startsAt: new Date(starts).toISOString(),
    cutoffAt: new Date(starts + protocol.maxima.wallDeadlineMs).toISOString(),
    scope: "new_owned_synthetic_worlds",
    bindings: protocol.cells.map((cell) => ({
      cellId: cell.id,
      worldId: randomUUID(),
      controlWorldId: randomUUID(),
      cohortId: randomUUID(),
      actorIds: [randomUUID(), randomUUID()],
      bindingIds: [randomUUID(), randomUUID()],
      fixtureNonce: "f".repeat(64),
      evidenceRef: "encrypted-fixture-evidence",
      keyRef: "private-key-reference",
    })),
  };
  const records = new Map<string, NativeAccounting>(),
    consumed = new Set<string>(),
    closed: string[] = [];
  for (const cell of protocol.cells) {
    const binding = grant.bindings.find((b) => b.cellId === cell.id)!;
    records.set(cell.id, {
      allocations: [],
      turns: [],
      inFlight: 0,
      uncertainCommands: [],
      ownershipValid: true,
      privacyValid: true,
      authorityValid: true,
      duplicateEffects: 0,
      limitsDigest: designDigest(cell.limits),
      profile: cell.profile,
      deadlineAt: new Date(Math.min(Date.parse(grant.cutoffAt), time + cell.limits.wallDeadlineMs)).toISOString(),
      gameTimeMs: "0",
      startGameTimeMs: "0",
      nextScheduledGameTimeMs: "60000",
    });
    void binding;
  }
  const f = evidenceFixture(),
    sample = assessNegotiation(f.cell, f.evidence, f.solo, f.reviews);
  let simulate: ((cellId: string, guard: (input: NegotiationGuardInput) => Promise<void>) => Promise<void>) | undefined;
  const ports: NegotiationExecutionPorts = {
    now: () => time,
    preflight: async () => ({
      sources: grant.sources,
      modelDigest: grant.modelDigest,
      policyDigest: grant.policyDigest,
      settingsDigest: grant.settingsDigest,
      owned: true,
      fresh: true,
      evidenceReady: true,
    }),
    claimNonce: async (nonce) => {
      nonceClaims++;
      if (consumed.has(nonce)) return false;
      consumed.add(nonce);
      return true;
    },
    accounting: async (b) => structuredClone(records.get(b.cellId)!),
    runCell: async (cell, binding, control) => {
      runs++;
      if (simulate) await simulate(cell.id, control.guard);
      return { ...structuredClone(sample), cell, worldId: binding.worldId, evidenceLevel: "real-provider" };
    },
    closeAdmission: async (b, reason) => {
      closed.push(`${b.cellId}:${reason}`);
    },
    finishNonce: async () => {
      finished++;
    },
  };
  return {
    protocol,
    grant,
    ports,
    records,
    closed,
    consumed,
    advance: (ms: number) => {
      time += ms;
    },
    simulate: (fn: typeof simulate) => {
      simulate = fn;
    },
    counts: () => ({ runs, nonceClaims, finished }),
  };
}
