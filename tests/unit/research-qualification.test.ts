import { expect, test } from "vitest";
import { QualificationPolicy } from "../../src/research/qualification/policy.js";
import { qualificationEvidence, qualificationNow } from "../fixtures/research/qualification.js";

const policy = new QualificationPolicy(() => qualificationNow);
test("exact complete fixture qualifies without conferring activation", () => {
  const e = qualificationEvidence(),
    decision = policy.assess(e.testedManifestDigest, e);
  expect(decision.status).toBe("qualified");
  expect(decision.scope).toBe("fixture");
  expect(decision.activationAuthorized).toBe(false);
});
test.each(["component", "provider", "schema", "index", "retention", "capability", "dependency"])(
  "qualification_invalidates_on_change: %s",
  (change) => {
    const e = qualificationEvidence();
    if (change === "component") e.manifest.components.worker = "fixture@2";
    if (change === "provider") e.manifest.model.model = "other";
    if (change === "schema") e.manifest.environment.effectsVersion = "2";
    if (change === "index") e.manifest.memory.indexPolicy = "consented";
    if (change === "retention") (e.manifest.evidence as any).retentionDays = 31;
    if (change === "capability") e.capability.model.tools = false;
    if (change === "dependency") e.dependencies.node = "26.14.0";
    expect(policy.assess(e.testedManifestDigest, e).status).toBe("blocked");
  },
);
test("omitted gates, unknown completeness, label edits and experimental protections never qualify", () => {
  for (const mutate of [
    (e: any) => delete e.gates.privacy,
    (e: any) => (e.gates.faults.status = "skipped"),
    (e: any) => (e.data.status = "partial"),
    (e: any) => (e.data.recorded = "9"),
    (e: any) => (e.scope = "provider"),
    (e: any) => (e.manifest.protections.budget = false),
    (e: any) => (e.dependencies.node = "latest"),
    (e: any) => (e.expiresAt = "2026-10-31T10:00:00.000Z"),
    (e: any) => (e.issuedAt = "2026-11-01T00:00:00.000Z"),
  ]) {
    const e = qualificationEvidence();
    mutate(e);
    expect(policy.assess(e.testedManifestDigest, e).status).toBe("blocked");
  }
});
test("malformed untrusted evidence is blocked rather than throwing or trusting a supplied status", () => {
  for (const e of [null, {}, { status: "qualified" }, { ...qualificationEvidence(), gates: null }])
    expect(policy.assess("a".repeat(64), e as any).status).toBe("blocked");
});

test("retagging attestation scope or recompiling inputs cannot reuse old passing gates", () => {
  const installation = qualificationEvidence();
  installation.scope = "installation";
  installation.attestation.scope = "installation";
  expect(policy.assess(installation.testedManifestDigest, installation).status).toBe("blocked");
  const changed = qualificationEvidence();
  changed.manifest.seed = "new-design";
  const { status: _, capabilityDigest: __, ...input } = changed.manifest;
  // Honest new compilation is still insufficient without new evidence for that manifest.
  return import("../../src/research/manifests/compiler.js").then(({ compileManifest }) => {
    const compiled = compileManifest(input, changed.capability);
    changed.manifest = compiled.manifest;
    changed.testedManifestDigest = compiled.digest;
    expect(policy.assess(compiled.digest, changed).status).toBe("blocked");
  });
});
