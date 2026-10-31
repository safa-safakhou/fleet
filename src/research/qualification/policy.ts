import { z } from "zod";
import { canonical, Decimal, digest } from "../contracts.js";
import { type CapabilityFingerprint, compileManifest, type ResolvedRunManifest } from "../manifests/compiler.js";
export const requiredGates = [
  "contracts",
  "invariants",
  "privacy",
  "accounting",
  "ownership",
  "faults",
  "preservation",
  "wire",
  "metrics",
  "visualization",
  "performance",
  "package",
] as const;
export type QualificationScope = "fixture" | "installation" | "provider" | "behavior";
export interface QualificationEvidence {
  scope: QualificationScope;
  manifest: ResolvedRunManifest;
  capability: CapabilityFingerprint;
  testedManifestDigest: string;
  testedCapabilityDigest: string;
  dependencies: Record<string, string>;
  testedDependenciesDigest: string;
  issuedAt: string;
  expiresAt: string;
  data: { status: "complete" | "partial" | "unavailable" | "withheld" | "expired"; expected: string; recorded: string };
  gates: Record<string, { status: string; evidenceDigest: string }>;
  attestation: {
    scope: QualificationScope;
    target: string;
    provider: "fake" | "real" | "none";
    dataset: string;
    independentUnits: number;
  };
}
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.enum(["fixture", "installation", "provider", "behavior"]);
const schema = z
  .object({
    scope,
    manifest: z.unknown(),
    capability: z.unknown(),
    testedManifestDigest: sha,
    testedCapabilityDigest: sha,
    dependencies: z
      .record(z.string().min(1).max(200), z.string().min(1).max(200))
      .refine(
        (x) =>
          Object.keys(x).length > 0 &&
          Object.values(x).every((v) => !/[\s*^~<>]|latest|alpha|beta|next|[xX]/.test(v) && /\d/.test(v)),
      ),
    testedDependenciesDigest: sha,
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    data: z
      .object({
        status: z.enum(["complete", "partial", "unavailable", "withheld", "expired"]),
        expected: Decimal,
        recorded: Decimal,
      })
      .strict()
      .refine((x) => BigInt(x.recorded) <= BigInt(x.expected)),
    gates: z.record(
      z.string(),
      z.object({ status: z.enum(["pass", "fail", "skipped", "unavailable"]), evidenceDigest: sha }).strict(),
    ),
    attestation: z
      .object({
        scope,
        target: z.string().min(1).max(200),
        provider: z.enum(["fake", "real", "none"]),
        dataset: z.string().min(1).max(200),
        independentUnits: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export interface QualificationDecision {
  schemaVersion: "fleet.qualification/v1";
  manifestDigest: string;
  capabilityDigest: string;
  dependenciesDigest: string;
  evidenceDigest: string;
  scope: QualificationScope;
  status: "qualified" | "blocked";
  reasons: string[];
  issuedAt: string;
  expiresAt: string;
  activationAuthorized: false;
}
const assessed = new WeakMap<QualificationDecision, string>();
export function assertAssessedDecision(value: QualificationDecision) {
  if (assessed.get(value) !== digest(value)) throw Error("UNASSESSED_QUALIFICATION");
}
/** Trusted evidence ingestion, never a capability or an execution grant. Reassess against current inputs on every use. */
export class QualificationPolicy {
  constructor(private now: () => Date = () => new Date()) {}
  assess(manifestDigest: string, evidence: QualificationEvidence): QualificationDecision {
    const reasons: string[] = [];
    const fail = (code: string) => reasons.push(code);
    let capabilityDigest = "",
      dependenciesDigest = "",
      evidenceDigest = "";
    const parsed = schema.safeParse(evidence);
    if (!parsed.success || !/^[a-f0-9]{64}$/.test(manifestDigest)) fail("INVALID_QUALIFICATION_EVIDENCE");
    else {
      try {
        canonical(evidence);
        capabilityDigest = digest(evidence.capability);
        dependenciesDigest = digest(evidence.dependencies);
        evidenceDigest = digest(evidence);
        const { status: _, capabilityDigest: sealedCapability, ...input } = evidence.manifest;
        const compiled = compileManifest(input, evidence.capability);
        if (
          compiled.digest !== manifestDigest ||
          evidence.testedManifestDigest !== manifestDigest ||
          digest(evidence.manifest) !== manifestDigest
        )
          fail("MANIFEST_CHANGED");
        if (capabilityDigest !== evidence.testedCapabilityDigest || sealedCapability !== capabilityDigest)
          fail("CAPABILITY_CHANGED");
        if (dependenciesDigest !== evidence.testedDependenciesDigest) fail("DEPENDENCIES_CHANGED");
        if (evidence.manifest.status !== "experimental") fail("MANIFEST_STATUS_INVALID");
        for (const gate of requiredGates) if (evidence.gates[gate]?.status !== "pass") fail(`GATE_REQUIRED:${gate}`);
        if (evidence.data.status !== "complete" || BigInt(evidence.data.expected) !== BigInt(evidence.data.recorded))
          fail("INCOMPLETE_DATA");
        const issued = Date.parse(evidence.issuedAt),
          expires = Date.parse(evidence.expiresAt),
          now = this.now().getTime();
        if (
          !Number.isFinite(now) ||
          issued > now ||
          expires <= now ||
          expires <= issued ||
          expires - issued > 30 * 86400000
        )
          fail("EVIDENCE_EXPIRED_OR_INVALID");
        if (evidence.scope !== evidence.attestation.scope) fail("SCOPE_CHANGED");
        if (evidence.scope === "fixture" && evidence.attestation.provider !== "fake") fail("FIXTURE_PROVIDER_REQUIRED");
        if (["provider", "behavior"].includes(evidence.scope) && evidence.attestation.provider !== "real")
          fail("REAL_PROVIDER_EVIDENCE_REQUIRED");
        if (evidence.scope === "behavior" && evidence.attestation.independentUnits < 2)
          fail("INDEPENDENT_UNITS_REQUIRED");
      } catch {
        fail("INCOMPATIBLE_OR_MALFORMED_INPUTS");
      }
    }
    const decision: QualificationDecision = {
      schemaVersion: "fleet.qualification/v1",
      manifestDigest,
      capabilityDigest,
      dependenciesDigest,
      evidenceDigest,
      scope: parsed.success ? parsed.data.scope : "fixture",
      status: reasons.length ? "blocked" : "qualified",
      reasons: [...new Set(reasons)].sort(),
      issuedAt: parsed.success ? parsed.data.issuedAt : this.now().toISOString(),
      expiresAt: parsed.success ? parsed.data.expiresAt : this.now().toISOString(),
      activationAuthorized: false,
    };
    assessed.set(decision, digest(decision));
    return decision;
  }
}
