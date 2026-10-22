import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareRC6Protocol as pactProtocol } from "../../../pact/tests/evaluation/post-e3-rc2-plan.js";
import { summarizePostE3Negotiation } from "../../src/negotiation-evaluation.js";
import * as plans from "../../src/post-e3-rc2-plan.js";
import * as grants from "../../src/post-e3-run.js";

const input = {
  stage: "R6-D",
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("separates RC6 identities, read-contract configuration and seeds without expanding any RC5 ceiling", () => {
  expect(plans.prepareRC6Protocol).toBeTypeOf("function");
  const p = plans.prepareRC6Protocol(input),
    old = plans.prepareRC5Protocol({ ...input, stage: "R5-D" });
  expect(p).toEqual(pactProtocol(input));
  expect(p.study).toBe("negotiation-r6");
  expect(p.schemaVersion).toBe("fleet.rc6-protocol.v1");
  expect(p.configuration).toEqual({ ...old.configuration, participantContract: "scoped.v1" });
  expect(p.native).toEqual(old.native);
  expect(p.maxima).toEqual(old.maxima);
  expect(p.cells).toHaveLength(4);
  for (const [i, c] of p.cells.entries()) {
    expect(c.study).toBe("negotiation-r6");
    expect(c.id).toContain("negotiation-r6:R6-D:");
    expect(c.configuration).toEqual(p.configuration);
    expect(c.worldSeed).not.toBe(old.cells[i].worldSeed);
    expect(c.limits).toEqual(old.cells[i].limits);
    expect(c.workLimits).toEqual(old.cells[i].workLimits);
    expect(() => plans.validatePostE3Cell(p, c)).not.toThrow();
    expect(() =>
      plans.validatePostE3Cell(p, {
        ...c,
        configuration: old.configuration,
      } as never),
    ).toThrow();
  }
  expect(() => plans.prepareRC5Protocol(input)).toThrow();
  expect(() => plans.validateRC5Cell(old, p.cells[0] as never)).toThrow();
  expect(plans.prepareRC6Protocol({ ...input, stage: "R6-H" }).cells).toHaveLength(35);
  expect(plans.prepareRC6Protocol({ ...input, stage: "R6-N" }).maxima.calls).toBe(144);
  expect(summarizePostE3Negotiation(p, [])).toMatchObject({
    schemaVersion: "fleet.rc6-summary.v1",
    assigned: 4,
    gate: "incomplete",
    productionQualified: false,
  });
});
it("requires a separately typed exact R5 grant and rejects R4 grants, replay, changed input and cutoff", () => {
  expect(grants.validateRC6Grant).toBeTypeOf("function");
  const p = plans.prepareRC6Protocol(input),
    now = Date.parse("2026-10-22T15:00:00Z");
  const grant = {
    schemaVersion: "fleet.rc6-grant.v1",
    approved: true,
    authorizationRef: "authored-fake-only",
    protocolDigest: p.digest,
    ...p.selection,
    seedCommitment: p.seedCommitment,
    startsAt: new Date(now).toISOString(),
    cutoffAt: new Date(now + p.maxima.wallDeadlineMs).toISOString(),
    scope: "new_owned_synthetic_worlds",
    bindings: p.cells.map((c) => ({
      cellId: c.id,
      worldId: randomUUID(),
      controlWorldId: randomUUID(),
      cohortId: randomUUID(),
      actorIds: [randomUUID(), randomUUID()],
      bindingIds: [randomUUID(), randomUUID()],
      fixtureNonce: "2".repeat(64),
      evidenceRef: "synthetic",
      keyRef: "synthetic",
    })),
  };
  const { stage: _stage, seedNonce: _seed, ...g } = grant;
  expect(grants.validateRC6Grant(p, g, now).valid).toBe(true);
  expect(grants.validateRC6Grant(p, { ...g, schemaVersion: "fleet.rc5-grant.v1" }, now).valid).toBe(false);
  expect(grants.validateRC6Grant(p, g, now, [g.batchNonce]).valid).toBe(false);
  expect(grants.validateRC6Grant(p, g, now + p.maxima.wallDeadlineMs).valid).toBe(false);
  expect(grants.validateRC6Grant({ ...p, native: { ...p.native, inputBytes: 40000 } }, g, now).valid).toBe(false);
});
