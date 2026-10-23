import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareRC28Protocol as pactProtocol } from "../../../pact/tests/evaluation/post-e3-rc2-plan.js";
import { summarizePostE3Negotiation } from "../../src/negotiation-evaluation.js";
import * as plans from "../../src/post-e3-rc2-plan.js";
import * as grants from "../../src/post-e3-run.js";

const input = {
  stage: "R28-D",
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("separates RC28 identities and installed model and seeds without expanding any RC19 ceiling", () => {
  expect(plans.prepareRC28Protocol).toBeTypeOf("function");
  const p = plans.prepareRC28Protocol(input),
    old = plans.prepareRC19Protocol({ ...input, stage: "R19-D" });
  expect(p).toEqual(pactProtocol(input));
  expect(p.study).toBe("negotiation-r28");
  expect(p.schemaVersion).toBe("fleet.rc28-protocol.v1");
  expect(p.configuration).toEqual({
    ...old.configuration,
    decisionContract: "read-final.v2",
    contextPackingContract: "required-first.v1",
    readQueryContract: "environment.v4",
    observationPolicyVersion: "4",
  });
  expect(p.modelProfile).toEqual({ route: "ollama", model: "qwen3.5:9b", thinking: true });
  expect(plans.prepareRC27Protocol({ ...input, stage: "R27-D" }).modelProfile).toEqual({
    route: "ollama",
    model: "qwen3.5:9b",
    thinking: false,
  });
  expect(() =>
    plans.validateRC28Cell({ ...p, modelProfile: { ...p.modelProfile, thinking: false } } as never, p.cells[0]),
  ).toThrow();
  expect(p.native).toEqual(old.native);
  expect(p.maxima).toEqual(old.maxima);
  expect(p.cells).toHaveLength(4);
  for (const [i, c] of p.cells.entries()) {
    expect(c.study).toBe("negotiation-r28");
    expect(c.id).toContain("negotiation-r28:R28-D:");
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
  expect(() => plans.prepareRC19Protocol(input)).toThrow();
  expect(() => plans.validateRC19Cell(old, p.cells[0] as never)).toThrow();
  expect(plans.prepareRC28Protocol({ ...input, stage: "R28-H" }).cells).toHaveLength(35);
  expect(plans.prepareRC28Protocol({ ...input, stage: "R28-N" }).maxima.calls).toBe(144);
  expect(summarizePostE3Negotiation(p, [])).toMatchObject({
    schemaVersion: "fleet.rc28-summary.v1",
    assigned: 4,
    gate: "incomplete",
    productionQualified: false,
  });
});
it("requires a separately typed exact R28 grant and rejects R19 grants, replay, changed input and cutoff", () => {
  expect(grants.validateRC28Grant).toBeTypeOf("function");
  const p = plans.prepareRC28Protocol(input),
    now = Date.parse("2026-10-22T15:00:00Z");
  const grant = {
    schemaVersion: "fleet.rc28-grant.v1",
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
  expect(grants.validateRC28Grant(p, g, now).valid).toBe(true);
  expect(grants.validateRC28Grant(p, { ...g, schemaVersion: "fleet.rc19-grant.v1" }, now).valid).toBe(false);
  expect(grants.validateRC28Grant(p, g, now, [g.batchNonce]).valid).toBe(false);
  expect(grants.validateRC28Grant(p, g, now + p.maxima.wallDeadlineMs).valid).toBe(false);
  expect(grants.validateRC28Grant({ ...p, native: { ...p.native, inputBytes: 40000 } }, g, now).valid).toBe(false);
});
it.each([
  { route: "ollama", model: "qwen3:14b", thinking: false },
  { route: "ollama", model: "qwen3:14b" },
  { route: "ollama", model: "nemotron-3-nano:4b", thinking: false },
  { route: "ollama", model: "qwen3.5:9b", thinking: false },
  { route: "ollama", model: "qwen3.5:9b" },
  { route: "ollama", model: "gemma4:12b", thinking: false },
  { route: "openai-compatible", model: "qwen3:14b", thinking: false },
])("refuses the wrong R28 profile before preparation or execution effects: %j", async (model) => {
  const p = plans.prepareRC28Protocol(input);
  expect(p.configuration.readQueryContract).toBe("environment.v4");
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
  ).rejects.toThrow("RC28_MODEL_PROFILE_REQUIRED");
  await expect(owned.executeOwnedRC28Protocol(p, {} as never, { prepared: [{ model }] } as never)).rejects.toThrow(
    "RC28_MODEL_PROFILE_REQUIRED",
  );
});

it("pins the installed Qwen35 descriptor and its native sampling without a wire override", async () => {
  const { readFile } = await import("node:fs/promises");
  const { model } = JSON.parse(
    await readFile(new URL("../../docs/negotiation-RC28-model-20261022.json", import.meta.url), "utf8"),
  );
  expect(model).toMatchObject({
    route: "ollama",
    model: "qwen3.5:9b",
    thinking: true,
    artifact: {
      manifestRelativePath: "manifests/registry.ollama.ai/library/qwen3.5/9b",
      manifestSha256: "56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90",
      family: "qwen35",
      parameters: "9.0B",
      quantization: "Q4_K_M",
    },
    sampling: { paramsLayer: { presence_penalty: 1.5, temperature: 1, top_k: 20, top_p: 0.95 }, wireOverrides: [] },
  });
  expect(model.artifact.layers).toHaveLength(6);
  expect(model.artifact.layers).toContainEqual({
    mediaType: "application/vnd.ollama.image.model",
    sha256: "02d45dc1cf451ba2475ac33b301c2dd8f985abe4c182ce04a1f2f5bf0260278d",
    bytes: 5629109120,
  });
});
