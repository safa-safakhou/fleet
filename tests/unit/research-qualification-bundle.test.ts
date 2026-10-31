import { expect, test } from "vitest";
import { assembleQualification } from "../../src/research/qualification/bundle.js";
import { requiredGates } from "../../src/research/qualification/policy.js";
import { qualificationEvidence, qualificationNow } from "../fixtures/research/qualification.js";

test("a failed performance gate, missing gate, stale input or duplicate evidence cannot qualify a bundle", () => {
  const e = qualificationEvidence(),
    gates = requiredGates.map((name) => ({
      ...e.gates[name],
      name,
      status: "pass" as const,
      exitCode: 0,
      evidenceDigest: "b".repeat(64),
    }));
  expect(assembleQualification(e, gates, () => qualificationNow).status).toBe("qualified");
  for (const input of [
    gates.slice(1),
    gates.map((x) => (x.name === "performance" ? { ...x, status: "fail" as const, exitCode: 1 } : x)),
    [...gates, gates[0]],
    gates.map((x) => ({ ...x, exitCode: 1 })),
  ])
    expect(assembleQualification(e, input, () => qualificationNow).status).toBe("blocked");
  e.manifest.build.source = "d".repeat(64);
  expect(assembleQualification(e, gates, () => qualificationNow).status).toBe("blocked");
});
