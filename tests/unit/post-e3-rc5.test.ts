import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareRC5Protocol as pactProtocol } from "../../../pact/tests/evaluation/post-e3-rc2-plan.js";
import { summarizePostE3Negotiation } from "../../src/negotiation-evaluation.js";
import * as plans from "../../src/post-e3-rc2-plan.js";
import * as grants from "../../src/post-e3-run.js";

const input = {
  stage: "R5-D",
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("separates RC5 identities, read-contract configuration and seeds without expanding any RC4 ceiling", () => {
  expect(plans.prepareRC5Protocol).toBeTypeOf("function");
  const p = plans.prepareRC5Protocol(input),
    old = plans.prepareRC4Protocol({ ...input, stage: "R4-D" });
  expect(p).toEqual(pactProtocol(input));
  expect(p.study).toBe("negotiation-r5");
  expect(p.schemaVersion).toBe("fleet.rc5-protocol.v1");
  expect(p.configuration).toEqual({ ...old.configuration, intentAuthorityContract: "separate.v1" });
  expect(p.native).toEqual(old.native);
  expect(p.maxima).toEqual(old.maxima);
  expect(p.cells).toHaveLength(4);
  for (const [i, c] of p.cells.entries()) {
    expect(c.study).toBe("negotiation-r5");
    expect(c.id).toContain("negotiation-r5:R5-D:");
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
  expect(() => plans.prepareRC4Protocol(input)).toThrow();
  expect(() => plans.validateRC4Cell(old, p.cells[0] as never)).toThrow();
  expect(plans.prepareRC5Protocol({ ...input, stage: "R5-H" }).cells).toHaveLength(35);
  expect(plans.prepareRC5Protocol({ ...input, stage: "R5-N" }).maxima.calls).toBe(144);
  expect(summarizePostE3Negotiation(p, [])).toMatchObject({
    schemaVersion: "fleet.rc5-summary.v1",
    assigned: 4,
    gate: "incomplete",
    productionQualified: false,
  });
});
it("requires a separately typed exact R5 grant and rejects R4 grants, replay, changed input and cutoff", () => {
  expect(grants.validateRC5Grant).toBeTypeOf("function");
  const p = plans.prepareRC5Protocol(input),
    now = Date.parse("2026-10-22T15:00:00Z");
  const grant = {
    schemaVersion: "fleet.rc5-grant.v1",
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
  expect(grants.validateRC5Grant(p, g, now).valid).toBe(true);
  expect(grants.validateRC5Grant(p, { ...g, schemaVersion: "fleet.rc4-grant.v1" }, now).valid).toBe(false);
  expect(grants.validateRC5Grant(p, g, now, [g.batchNonce]).valid).toBe(false);
  expect(grants.validateRC5Grant(p, g, now + p.maxima.wallDeadlineMs).valid).toBe(false);
  expect(grants.validateRC5Grant({ ...p, native: { ...p.native, inputBytes: 40000 } }, g, now).valid).toBe(false);
});
