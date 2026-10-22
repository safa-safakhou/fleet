import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareRC11Protocol as pactProtocol } from "../../../pact/tests/evaluation/post-e3-rc2-plan.js";
import { summarizePostE3Negotiation } from "../../src/negotiation-evaluation.js";
import * as plans from "../../src/post-e3-rc2-plan.js";
import * as grants from "../../src/post-e3-run.js";

const input = {
  stage: "R11-D",
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("separates RC11 identities, read-contract configuration and seeds without expanding any RC10 ceiling", () => {
  expect(plans.prepareRC11Protocol).toBeTypeOf("function");
  const p = plans.prepareRC11Protocol(input),
    old = plans.prepareRC10Protocol({ ...input, stage: "R10-D" });
  expect(p).toEqual(pactProtocol(input));
  expect(p.study).toBe("negotiation-r11");
  expect(p.schemaVersion).toBe("fleet.rc11-protocol.v1");
  expect(p.configuration).toEqual({ ...old.configuration, decisionContract: "read-final.v1" });
  expect(p.modelProfile).toEqual({ route: "ollama", model: "qwen3.5:9b", thinking: false });
  expect(() =>
    plans.validateRC11Cell({ ...p, modelProfile: { ...p.modelProfile, thinking: true } } as never, p.cells[0]),
  ).toThrow();
  expect(p.native).toEqual(old.native);
  expect(p.maxima).toEqual(old.maxima);
  expect(p.cells).toHaveLength(4);
  for (const [i, c] of p.cells.entries()) {
    expect(c.study).toBe("negotiation-r11");
    expect(c.id).toContain("negotiation-r11:R11-D:");
    expect(c.configuration).toEqual(p.configuration);
    expect(c.worldSeed).not.toBe(old.cells[i].worldSeed);
    expect(c.limits).toEqual(old.cells[i].limits);
    expect(c.workLimits).toEqual(old.cells[i].workLimits);
    expect(() => plans.validatePostE3Cell(p, c)).not.toThrow();
    expect(() =>
      plans.validatePostE3Cell(p, {
        ...c,
        configuration: { ...old.configuration, temporalEvidenceContract: "unknown" },
      } as never),
    ).toThrow();
  }
  expect(() => plans.prepareRC10Protocol(input)).toThrow();
  expect(() => plans.validateRC10Cell(old, p.cells[0] as never)).toThrow();
  expect(plans.prepareRC11Protocol({ ...input, stage: "R11-H" }).cells).toHaveLength(35);
  expect(plans.prepareRC11Protocol({ ...input, stage: "R11-N" }).maxima.calls).toBe(144);
  expect(summarizePostE3Negotiation(p, [])).toMatchObject({
    schemaVersion: "fleet.rc11-summary.v1",
    assigned: 4,
    gate: "incomplete",
    productionQualified: false,
  });
});
it("requires a separately typed exact R11 grant and rejects R10 grants, replay, changed input and cutoff", () => {
  expect(grants.validateRC11Grant).toBeTypeOf("function");
  const p = plans.prepareRC11Protocol(input),
    now = Date.parse("2026-10-22T15:00:00Z");
  const grant = {
    schemaVersion: "fleet.rc11-grant.v1",
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
  expect(grants.validateRC11Grant(p, g, now).valid).toBe(true);
  expect(grants.validateRC11Grant(p, { ...g, schemaVersion: "fleet.rc10-grant.v1" }, now).valid).toBe(false);
  expect(grants.validateRC11Grant(p, g, now, [g.batchNonce]).valid).toBe(false);
  expect(grants.validateRC11Grant(p, g, now + p.maxima.wallDeadlineMs).valid).toBe(false);
  expect(grants.validateRC11Grant({ ...p, native: { ...p.native, inputBytes: 40000 } }, g, now).valid).toBe(false);
});
it.each([
  { route: "ollama", model: "qwen3.5:9b", thinking: true },
  { route: "ollama", model: "qwen3.5:9b" },
  { route: "ollama", model: "nemotron-3-nano:4b", thinking: false },
  { route: "openai-compatible", model: "qwen3.5:9b", thinking: false },
])("refuses the wrong R11 profile before preparation or execution effects: %j", async (model) => {
  const p = plans.prepareRC11Protocol(input);
  const owned = await import("../../scripts/lib/post-e3-owned-run.js");
  await expect(
    owned.prepareOwnedRC1Cohort(
      {} as never,
      {} as never,
      {} as never,
      p.cells[0],
      model as never,
      "fixture",
      "evidence",
      "key",
    ),
  ).rejects.toThrow("RC11_MODEL_PROFILE_REQUIRED");
  await expect(owned.executeOwnedRC11Protocol(p, {} as never, { prepared: [{ model }] } as never)).rejects.toThrow(
    "RC11_MODEL_PROFILE_REQUIRED",
  );
});
