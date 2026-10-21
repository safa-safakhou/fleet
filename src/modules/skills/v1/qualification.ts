import { randomUUID } from "node:crypto";
import { launchDigest } from "../../../platform/launch.js";
import { expandRecipe, type PrimitiveRegistry, recipeDependencies } from "./primitives.js";
import type { SkillVersion } from "./schema.js";
export type ProcedureClass = {
  id: string;
  matches(skill: SkillVersion, registry: PrimitiveRegistry, children: ReadonlyMap<string, SkillVersion>): boolean;
};
export class QualificationPolicy {
  private caseSets = new Map<string, TrustedCaseSet>();
  readonly version = "skills-policy.v1";
  readonly requiredCases = [
    "positive",
    "unmet_guards",
    "missing_evidence",
    "expiry",
    "stock_conflict",
    "authority_change",
    "restart",
  ] as const;
  readonly maxCaseTimeMs = 500;
  readonly classes: ProcedureClass[];
  constructor(
    classes: ProcedureClass[] = [],
    readonly environmentDigest = "",
  ) {
    this.classes = [
      {
        id: "read-only.v1",
        matches: (s, r, c) => {
          const x = expandRecipe(s, r, c);
          return (
            !x.issues.length &&
            !s.body.effects.actionKeys.length &&
            x.nodes.every(
              ({ node }) =>
                !("primitive" in node) ||
                (node.kind !== "submit" &&
                  node.kind !== "request" &&
                  !r.get(node.primitive)?.work.actions &&
                  !r.get(node.primitive)?.work.messages),
            )
          );
        },
      },
      ...classes,
    ];
  }
  procedureClass(skill: SkillVersion, registry: PrimitiveRegistry, children: ReadonlyMap<string, SkillVersion>) {
    return this.classes.find((c) => c.matches(skill, registry, children));
  }
  digest() {
    return launchDigest({
      version: this.version,
      environment: this.environmentDigest,
      requiredCases: this.requiredCases,
      classes: this.classes.map((c) => ({ id: c.id, matches: c.matches.toString() })),
      fixtures: [...this.caseSets.values()].map((c) => c.digest()).sort(),
    });
  }
  registerCases(set: TrustedCaseSet) {
    if (this.caseSets.has(set.procedureClass)) throw Error("DUPLICATE_QUALIFICATION_FIXTURES");
    this.caseSets.set(set.procedureClass, set);
    return this;
  }
  caseDigest(procedureClass: string) {
    return this.caseSets.get(procedureClass)?.digest();
  }
}
type TrustedCase = { id: string; run(signal: AbortSignal): Promise<unknown>; accept(actual: unknown): boolean };
/** Registered code supplies independent expectations; this constructor is never a model-facing port. */
export class TrustedCaseSet {
  constructor(
    readonly procedureClass: string,
    readonly cases: TrustedCase[],
    readonly version: string,
  ) {
    if (cases.length > 16 || new Set(cases.map((c) => c.id)).size !== cases.length)
      throw Error("INVALID_QUALIFICATION_CASES");
  }
  digest() {
    return launchDigest({
      procedureClass: this.procedureClass,
      version: this.version,
      cases: this.cases.map((c) => ({ id: c.id, run: c.run.toString(), accept: c.accept.toString() })),
    });
  }
}
export type QualificationEvidence = {
  id: string;
  skillRef: SkillVersion["ref"];
  policyDigest: string;
  dependenciesDigest: string;
  caseSetVersion: string;
  caseSetDigest: string;
  procedureClass: string;
  retainedSourceIds: string[];
  cases: { id: string; passed: boolean; wallTimeMs: number; error: string | null }[];
  evidenceLevel: "synthetic-host-cases";
};
const trusted = new WeakSet<object>();
export function isTrustedQualificationEvidence(v: unknown): v is QualificationEvidence {
  return !!v && typeof v === "object" && trusted.has(v);
}
export async function runTrustedCases(
  skill: SkillVersion,
  registry: PrimitiveRegistry,
  policy: QualificationPolicy,
  set: TrustedCaseSet,
  retainedSourceIds: string[],
  children: ReadonlyMap<string, SkillVersion> = new Map(),
): Promise<QualificationEvidence> {
  const evidence: QualificationEvidence = {
    id: randomUUID(),
    skillRef: structuredClone(skill.ref),
    policyDigest: policy.digest(),
    dependenciesDigest: recipeDependencies(skill, registry, children, policy.environmentDigest),
    caseSetVersion: set.version,
    caseSetDigest: set.digest(),
    procedureClass: set.procedureClass,
    retainedSourceIds: [...retainedSourceIds],
    cases: [],
    evidenceLevel: "synthetic-host-cases",
  };
  for (const c of set.cases) {
    const began = performance.now(),
      controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const actual = await Promise.race([
        c.run(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error("CASE_DEADLINE"));
          }, policy.maxCaseTimeMs);
        }),
      ]);
      evidence.cases.push({
        id: c.id,
        passed: c.accept(actual) === true,
        wallTimeMs: performance.now() - began,
        error: null,
      });
    } catch (error) {
      evidence.cases.push({
        id: c.id,
        passed: false,
        wallTimeMs: performance.now() - began,
        error: error instanceof Error && error.message === "CASE_DEADLINE" ? "CASE_DEADLINE" : "CASE_FAILED",
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const freeze = (v: unknown) => {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      for (const x of Object.values(v)) freeze(x);
      Object.freeze(v);
    }
  };
  freeze(evidence);
  trusted.add(evidence);
  return evidence;
}
export function qualifyRecipe(
  skill: SkillVersion,
  registry: PrimitiveRegistry,
  policy: QualificationPolicy,
  evidence: QualificationEvidence,
  children: ReadonlyMap<string, SkillVersion> = new Map(),
) {
  const reasons = expandRecipe(skill, registry, children).issues.map((i) => i.code),
    dependenciesDigest = recipeDependencies(skill, registry, children, policy.environmentDigest),
    procedureClass = policy.procedureClass(skill, registry, children);
  if (!isTrustedQualificationEvidence(evidence)) reasons.push("TRUSTED_SKILL_EVALUATION_REQUIRED");
  else {
    if (
      launchDigest(evidence.skillRef) !== launchDigest(skill.ref) ||
      evidence.dependenciesDigest !== dependenciesDigest ||
      evidence.policyDigest !== policy.digest()
    )
      reasons.push("SKILL_EVALUATION_MISMATCH");
    if (!procedureClass || procedureClass.id !== evidence.procedureClass) reasons.push("UNSUPPORTED_PROCEDURE_CLASS");
    if (policy.caseDigest(evidence.procedureClass) !== evidence.caseSetDigest)
      reasons.push("UNREGISTERED_QUALIFICATION_FIXTURES");
    if (skill.body.evidence.sourceIds.some((id) => !evidence.retainedSourceIds.includes(id)))
      reasons.push("MISSING_SKILL_SUPPORT");
    for (const id of policy.requiredCases)
      if (!evidence.cases.some((c) => c.id === id && c.passed && !c.error))
        reasons.push(`MISSING_OR_FAILED_CASE:${id}`);
  }
  return {
    mode: reasons.length ? ("advisory" as const) : ("guarded" as const),
    reasons: [...new Set(reasons)],
    dependenciesDigest,
    policyVersion: policy.version,
    procedureClass: procedureClass?.id ?? null,
  };
}
