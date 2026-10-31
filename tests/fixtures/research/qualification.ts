import { digest } from "../../../src/research/contracts.js";
import { compileManifest } from "../../../src/research/manifests/compiler.js";
import { type QualificationEvidence, requiredGates } from "../../../src/research/qualification/policy.js";
import { capability, manifestInput } from "./manifest.js";
export const qualificationNow = new Date("2026-10-31T12:00:00Z");
export function qualificationEvidence(): QualificationEvidence {
  const compiled = compileManifest(manifestInput(), capability);
  return {
    scope: "fixture",
    manifest: compiled.manifest,
    capability: structuredClone(capability),
    testedManifestDigest: compiled.digest,
    testedCapabilityDigest: digest(capability),
    dependencies: { node: "26.13.0", fakeProvider: "1.0.0" },
    testedDependenciesDigest: digest({ node: "26.13.0", fakeProvider: "1.0.0" }),
    issuedAt: "2026-10-31T11:00:00.000Z",
    expiresAt: "2026-11-01T11:00:00.000Z",
    data: { expected: "10", recorded: "10", status: "complete" },
    gates: Object.fromEntries(
      requiredGates.map((x) => [
        x,
        {
          status: "pass",
          evidenceDigest: "a".repeat(64),
          scope: "fixture" as const,
          target: "owned-synthetic@1",
          manifestDigest: compiled.digest,
          capabilityDigest: digest(capability),
          dependenciesDigest: digest({ node: "26.13.0", fakeProvider: "1.0.0" }),
        },
      ]),
    ),
    attestation: {
      scope: "fixture",
      target: "owned-synthetic@1",
      provider: "fake",
      dataset: "synthetic@1",
      independentUnits: 4,
    },
  };
}
