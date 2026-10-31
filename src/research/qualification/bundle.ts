import { digest } from "../contracts.js";
import {
  type QualificationEvidence,
  type QualificationGateBinding,
  QualificationPolicy,
  requiredGates,
} from "./policy.js";
export interface QualificationGateResult extends QualificationGateBinding {
  name: string;
  status: "pass" | "fail" | "skipped";
  exitCode: number | null;
  evidenceDigest: string;
}
/** Records actual results; a green process or a label never substitutes for a missing gate. */
export function assembleQualification(
  input: QualificationEvidence,
  results: QualificationGateResult[],
  now: () => Date = () => new Date(),
) {
  const evidence = structuredClone(input);
  evidence.gates = {};
  for (const name of requiredGates) {
    const matches = results.filter((x) => x.name === name),
      item = matches[0];
    evidence.gates[name] = {
      scope: item?.scope ?? evidence.scope,
      target: item?.target ?? evidence.attestation.target,
      manifestDigest: item?.manifestDigest ?? evidence.testedManifestDigest,
      capabilityDigest: item?.capabilityDigest ?? evidence.testedCapabilityDigest,
      dependenciesDigest: item?.dependenciesDigest ?? evidence.testedDependenciesDigest,
      status: matches.length === 1 && item.status === "pass" && item.exitCode === 0 ? "pass" : "fail",
      evidenceDigest:
        matches.length === 1 ? item.evidenceDigest : digest({ gate: name, reason: "MISSING_OR_DUPLICATE_GATE" }),
    };
  }
  return new QualificationPolicy(now).assess(evidence.testedManifestDigest, evidence);
}
