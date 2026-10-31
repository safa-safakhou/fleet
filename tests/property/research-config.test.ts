import fc from "fast-check";
import { expect, test } from "vitest";
import { ConfigurationMatrix, highRiskTriples, matrixDimensions } from "../../src/research/qualification/matrix.js";
import { QualificationPolicy } from "../../src/research/qualification/policy.js";
import { qualificationEvidence, qualificationNow } from "../fixtures/research/qualification.js";
import { propertyOptions } from "./options.js";

test("matrix covers every supported pair and explicit high-risk triples with excluded reasons", () => {
  const m = new ConfigurationMatrix();
  const report = m.generate({ runtimes: ["ts", "python"], owners: ["platform", "temporal"] });
  const cases = report.filter((x) => x.status === "covered");
  const entries = Object.entries(matrixDimensions);
  for (let a = 0; a < entries.length; a++)
    for (let b = a + 1; b < entries.length; b++)
      for (const av of entries[a][1])
        for (const bv of entries[b][1])
          expect(cases.some((x) => x.values[entries[a][0]] === av && x.values[entries[b][0]] === bv)).toBe(true);
  for (const triple of highRiskTriples) expect(cases.some((x) => x.risks?.join("|") === triple.join("|"))).toBe(true);
  const limited = m.generate({ runtimes: ["ts"], owners: ["platform"] });
  expect(limited.some((x) => x.status === "excluded" && x.reason === "RUNTIME_UNSUPPORTED")).toBe(true);
  expect(
    limited
      .filter((x) => x.status === "covered")
      .every((x) => x.values.runtime === "ts" && x.values.owner === "platform"),
  ).toBe(true);
});
test("all non-disableable gates resist configuration and label edits", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("identity", "permission", "lease", "privacy", "budget", "fencing", "journal"),
      fc.boolean(),
      (gate, value) => {
        const e = qualificationEvidence();
        (e.manifest.protections as any)[gate] = value;
        const d = new QualificationPolicy(() => qualificationNow).assess(e.testedManifestDigest, e);
        expect(d.status).toBe(value ? "qualified" : "blocked");
      },
    ),
    propertyOptions("configuration"),
  );
});

test("generated combinations reach semantic admission with honest negative cases", async () => {
  const { manifestInput, capability } = await import("../fixtures/research/manifest.js");
  const { compileManifest } = await import("../../src/research/manifests/compiler.js");
  for (const item of new ConfigurationMatrix().generate({
    runtimes: ["ts", "python"],
    owners: ["platform", "temporal"],
  })) {
    const input = manifestInput(),
      cap = structuredClone(capability),
      v = item.values;
    input.roles = [{ id: v.recipe, authority: v.recipe === "advisory" ? "advisory" : "actor" }];
    input.components.worker = `${v.runtime}@1`;
    cap.components.worker = [input.components.worker];
    input.retrieval.strategy = v.retrieval as typeof input.retrieval.strategy;
    if (v.consent === "consented") {
      input.memory.indexPolicy = "consented";
      input.memory.indexConsentRef = "matrix-index";
      cap.indexGrants = [
        {
          ref: "matrix-index",
          bindingId: input.environment.bindingId,
          namespace: input.memory.namespace,
          embeddingRevision: "fake@1",
          dimension: 2,
        },
      ];
    }
    if (["vector-exact-v1", "rrf-v1"].includes(v.retrieval))
      input.memory.embedding = { revision: "fake@1", digest: "d".repeat(64), dimension: 2, normalization: "l2" };
    cap.model.tools = v.tools === "supported";
    const rejected = v.tools === "unsupported" || (v.retrieval !== "baseline-v1" && v.consent === "disabled");
    if (rejected) expect(() => compileManifest(input, cap)).toThrow();
    else expect(compileManifest(input, cap).manifest.status).toBe("experimental");
  }
});
