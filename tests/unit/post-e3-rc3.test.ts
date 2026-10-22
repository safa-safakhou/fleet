import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareRC3Protocol as pactProtocol } from "../../../pact/tests/evaluation/post-e3-rc2-plan.js";
import { postE3PackageSettings } from "../../scripts/lib/post-e3-package.js";
import { summarizePostE3Negotiation } from "../../src/negotiation-evaluation.js";
import * as plans from "../../src/post-e3-rc2-plan.js";
import * as grants from "../../src/post-e3-run.js";

const input = {
  stage: "R3-D",
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("separates RC3 identities, read-contract configuration and seeds without expanding any RC2 ceiling", () => {
  expect(plans.prepareRC3Protocol).toBeTypeOf("function");
  const p = plans.prepareRC3Protocol(input),
    old = plans.prepareRC2Protocol({ ...input, stage: "R2-D" });
  expect(p).toEqual(pactProtocol(input));
  expect(p.study).toBe("negotiation-r3");
  expect(p.schemaVersion).toBe("fleet.rc3-protocol.v1");
  expect(p.configuration).toEqual({ ...old.configuration, readQueryContract: "environment.v1" });
  expect(p.native).toEqual(old.native);
  expect(p.maxima).toEqual(old.maxima);
  expect(p.cells).toHaveLength(4);
  for (const [i, c] of p.cells.entries()) {
    expect(c.study).toBe("negotiation-r3");
    expect(c.id).toContain("negotiation-r3:R3-D:");
    expect(c.configuration).toEqual(p.configuration);
    expect(c.worldSeed).not.toBe(old.cells[i].worldSeed);
    expect(c.limits).toEqual(old.cells[i].limits);
    expect(c.workLimits).toEqual(old.cells[i].workLimits);
    expect(() => plans.validatePostE3Cell(p, c)).not.toThrow();
    expect(() => plans.validatePostE3Cell(p, { ...c, configuration: old.configuration } as never)).toThrow();
  }
  expect(() => plans.prepareRC2Protocol(input)).toThrow();
  expect(() => plans.validateRC2Cell(old, p.cells[0] as never)).toThrow();
  expect(plans.prepareRC3Protocol({ ...input, stage: "R3-H" }).cells).toHaveLength(35);
  expect(plans.prepareRC3Protocol({ ...input, stage: "R3-N" }).maxima.calls).toBe(144);
  expect(summarizePostE3Negotiation(p, [])).toMatchObject({
    schemaVersion: "fleet.rc3-summary.v1",
    assigned: 4,
    gate: "incomplete",
    productionQualified: false,
  });
});
it("requires a separately typed exact R3 grant and rejects R2 grants, replay, changed input and cutoff", () => {
  expect(grants.validateRC3Grant).toBeTypeOf("function");
  const p = plans.prepareRC3Protocol(input),
    now = Date.parse("2026-10-22T15:00:00Z");
  const grant = {
    schemaVersion: "fleet.rc3-grant.v1",
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
  expect(grants.validateRC3Grant(p, g, now).valid).toBe(true);
  expect(grants.validateRC3Grant(p, { ...g, schemaVersion: "fleet.rc2-grant.v1" }, now).valid).toBe(false);
  expect(grants.validateRC3Grant(p, g, now, [g.batchNonce]).valid).toBe(false);
  expect(grants.validateRC3Grant(p, g, now + p.maxima.wallDeadlineMs).valid).toBe(false);
  expect(grants.validateRC3Grant({ ...p, native: { ...p.native, inputBytes: 40000 } }, g, now).valid).toBe(false);
});
it("packages RC3 as passive with its repaired actor pins and configuration while retaining RC2 metadata", () => {
  const base = { controller: {}, provider: { request: {}, childEnvironment: {} }, leases: {} };
  const s = postE3PackageSettings(base, "RC3"),
    old = postE3PackageSettings(base, "RC2");
  expect(s.schemaVersion).toBe("fleet.rc3-settings.v1");
  expect(s.study).toBe("negotiation-r3");
  expect(s.architecture.configuration).toEqual({
    ...old.architecture.configuration,
    readQueryContract: "environment.v1",
  });
  expect(s.candidateSources).toEqual({
    fleet: "0476150fa74e01cb9972b85e4c67119a2221a48d",
    pact: "737ac87f5618c4c32ca0d0faae44d78ad3c2af29",
  });
  expect(s.budget.stages.map((s) => s.stage)).toEqual(["R3-D", "R3-H", "R3-N"]);
  expect(s.scheduling).toEqual(old.scheduling);
  expect(s.realProviderAuthorized).toBe(false);
  expect(s.installation).toBe(false);
  expect(s.activation).toBe(false);
  expect(old.architecture.configuration).not.toHaveProperty("readQueryContract");
});
