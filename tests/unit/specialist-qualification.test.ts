import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessSpecialistCell,
  prepareSpecialistQualification,
  validateSpecialistGrant,
} from "../../src/specialist-qualification.js";

const selection = {
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  batchNonce: randomUUID(),
};
function fixture() {
  const protocol = prepareSpecialistQualification(selection),
    now = Date.parse("2026-10-21T15:00:00Z"),
    grant = {
      schemaVersion: "fleet.specialist-qualification-grant.v1",
      approved: true,
      authorizationRef: "synthetic-test-only",
      protocolDigest: protocol.digest,
      batchNonce: protocol.batchNonce,
      startsAt: new Date(now).toISOString(),
      cutoffAt: new Date(now + protocol.maxima.wallDeadlineMs).toISOString(),
      scope: "new_owned_synthetic_worlds",
      bindings: protocol.cells.map((c) => ({
        cellId: c.id,
        worldId: randomUUID(),
        cohortId: randomUUID(),
        actorId: randomUUID(),
        peerId: randomUUID(),
        bindingId: randomUUID(),
        fixtureNonce: "1".repeat(64),
        evidenceRef: "encrypted-owned-evidence",
        keyRef: "private-separate-key",
      })),
    };
  return { protocol, grant, now };
}
describe("separate KQ1 diagnostic", () => {
  it("fixes eight cells, 96 role turns and all parent caps without negotiation arms", () => {
    const p = prepareSpecialistQualification(selection);
    expect(p.cells).toHaveLength(8);
    expect(p.maxima).toEqual({ turns: 96, calls: 288, reservedTokens: 11520000, wallDeadlineMs: 21600000 });
    expect(new Set(p.cells.map((c) => `${c.preset}/${c.skillMode}/${c.scenario}`)).size).toBe(8);
    for (const c of p.cells) {
      expect(c.profile).toEqual({ id: "autonomous-specialists", version: "1" });
      expect(c.limits).toMatchObject({ turnsPerRole: 4, callsPerTurn: 3, inputBytes: 24000, outputTokens: 2000 });
      expect(c.workLimits.reads).toBe(c.roles.length === 2 ? 256 : 512);
    }
    expect(prepareSpecialistQualification(selection)).toEqual(p);
    expect(() =>
      prepareSpecialistQualification({ ...selection, selectedProfile: { id: "reactive-cognition", version: "2" } }),
    ).toThrow();
  });
  it("rejects changed protocols, missing cells, duplicate identities, expired or replayed grants", () => {
    const { protocol, grant, now } = fixture();
    expect(validateSpecialistGrant(protocol, grant, now)).toEqual({ valid: true, reasons: [] });
    expect(validateSpecialistGrant({ ...protocol, cells: protocol.cells.slice(1) }, grant, now).valid).toBe(false);
    expect(validateSpecialistGrant(protocol, { ...grant, bindings: grant.bindings.slice(1) }, now).valid).toBe(false);
    const duplicate = structuredClone(grant);
    duplicate.bindings[1].peerId = duplicate.bindings[0].actorId;
    expect(validateSpecialistGrant(protocol, duplicate, now).reasons).toContain("KQ1_DUPLICATE_IDENTITY");
    expect(validateSpecialistGrant(protocol, grant, Date.parse(grant.cutoffAt)).valid).toBe(false);
    expect(validateSpecialistGrant(protocol, grant, now, [grant.batchNonce]).valid).toBe(false);
    expect(validateSpecialistGrant(protocol, { ...grant, sources: { fleet: "0".repeat(40) } }, now).valid).toBe(false);
  });
  it("never calls a signature or unknown cost a guarded diagnostic pass", () => {
    const { protocol } = fixture(),
      cell = protocol.cells.find((c) => c.skillMode === "guarded" && c.scenario === "existing-goal");
    if (!cell) throw Error("MISSING_TEST_CELL");
    const evidence = {
      complete: true,
      evidenceLevel: "real-provider" as const,
      sourceRefs: ["native:fixture"],
      allocations: [
        { id: randomUUID(), reservedTokens: 40000, inputTokens: 100, outputTokens: 20, status: "reported" as const },
      ],
      roleTurns: Object.fromEntries(cell.roles.map((r) => [r, 4])),
      criticalFailures: [],
      actualFullDelivery: false,
      exactExistingGoal: true,
      zeroCallReuseOpportunities: 1,
      prohibitedEffects: 0,
      learningObserved: false,
      work: { reads: 10, actions: 1, messages: 0, steps: 20, wallTimeMs: 1000 },
    };
    expect(assessSpecialistCell(cell, evidence)).toMatchObject({
      status: "fail",
      productionQualified: false,
      measuredTokens: 120,
    });
    expect(assessSpecialistCell(cell, { ...evidence, actualFullDelivery: true }).status).toBe("pass");
    expect(
      assessSpecialistCell(cell, { ...evidence, actualFullDelivery: true, zeroCallReuseOpportunities: 0 }).status,
    ).toBe("fail");
    expect(
      assessSpecialistCell(cell, {
        ...evidence,
        allocations: [{ ...evidence.allocations[0], status: "unknown", inputTokens: null, outputTokens: null }],
      }),
    ).toMatchObject({ status: "fail", unknownReservedTokens: 40000, measuredTokens: null });
    expect(
      assessSpecialistCell(cell, {
        ...evidence,
        actualFullDelivery: true,
        roleTurns: { ...evidence.roleTurns, diplomacy: 5 },
      }).criticalFailures,
    ).toContain("KQ1_ROLE_TURN_CAP");
    expect(
      assessSpecialistCell(cell, {
        ...evidence,
        actualFullDelivery: true,
        work: { ...evidence.work, reads: cell.workLimits.reads + 1 },
      }).criticalFailures,
    ).toContain("KQ1_PARENT_WORK_CAP");
  });
});
