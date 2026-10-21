import { z } from "zod";

const n = z.number().nonnegative().refine(Number.isSafeInteger),
  duration = z.number().finite().nonnegative();
export const SkillCostSchema = z
  .object({
    phase: z.enum(["acquisition", "validation", "retrieval", "execution", "monitoring", "fallback"]),
    modelCalls: n,
    reservedTokens: n,
    actualTokens: n.nullable(),
    reads: n,
    actions: n,
    messages: n,
    steps: n,
    cpuMs: duration.nullable(),
    wallMs: duration.nullable(),
  })
  .strict();
export type SkillCost = z.infer<typeof SkillCostSchema>;
const Outcome = z
  .object({
    kind: z.enum(["admitted", "fulfilled", "failed", "unknown"]),
    sourceRefs: z.array(z.string().min(1).max(1000)).max(100),
  })
  .strict()
  .refine((v) => v.kind === "unknown" || v.sourceRefs.length > 0, "Observed outcomes require sources");
const Trace = z
  .object({
    evidence: z.enum(["synthetic", "measured"]),
    timing: z.enum(["simulated", "measured", "unknown"]),
    costs: z.array(SkillCostSchema).max(1000),
    outcome: Outcome,
  })
  .strict();
const Cases = z
  .array(
    z
      .object({
        id: z.string().min(1).max(200),
        applicability: z.enum(["match", "miss", "unknown"]),
        baseline: Trace.nullable(),
        reuse: Trace,
      })
      .strict(),
  )
  .min(1)
  .max(1000)
  .refine((v) => new Set(v.map((c) => c.id)).size === v.length, "Duplicate paired case");
export type SkillEfficiencyCase = z.infer<typeof Cases>[number];
type Total = Omit<SkillCost, "phase">;
const zero = (): Total => ({
  modelCalls: 0,
  reservedTokens: 0,
  actualTokens: 0,
  reads: 0,
  actions: 0,
  messages: 0,
  steps: 0,
  cpuMs: 0,
  wallMs: 0,
});
function add(a: Total, b: Total): Total {
  const out = zero();
  for (const k of Object.keys(out) as (keyof Total)[]) {
    const x = a[k],
      y = b[k];
    if (x === null || y === null) out[k] = null as never;
    else {
      const value = x + y;
      if (!Number.isFinite(value) || (!["cpuMs", "wallMs"].includes(k) && !Number.isSafeInteger(value)))
        throw Error("COST_TOTAL_OVERFLOW");
      out[k] = value;
    }
  }
  return out;
}
function sum(costs: SkillCost[]) {
  return costs.reduce((total, c) => add(total, c), zero());
}
/** Describes supplied paired observations; never invents an unobserved baseline or erases learning overhead. */
export function evaluateSkillReuse(raw: SkillEfficiencyCase[]) {
  const cases = Cases.parse(raw),
    reuse = sum(cases.flatMap((c) => c.reuse.costs)),
    completeBaseline = cases.every((c) => c.baseline !== null),
    baseline = completeBaseline ? sum(cases.flatMap((c) => c.baseline!.costs)) : null;
  const phases = Object.fromEntries(
    SkillCostSchema.shape.phase.options.map((phase) => [
      phase,
      sum(cases.flatMap((c) => c.reuse.costs.filter((v) => v.phase === phase))),
    ]),
  );
  let runningReuse = zero(),
    runningBaseline = zero(),
    amortizationHorizon: number | null = null,
    comparable = true;
  const rows = cases.map((c, index) => {
    const cost = sum(c.reuse.costs),
      base = c.baseline ? sum(c.baseline.costs) : null;
    runningReuse = add(runningReuse, cost);
    if (base) runningBaseline = add(runningBaseline, base);
    else comparable = false;
    if (c.reuse.outcome.kind !== "fulfilled" || c.baseline?.outcome.kind !== "fulfilled") comparable = false;
    if (
      amortizationHorizon === null &&
      comparable &&
      runningReuse.actualTokens !== null &&
      runningBaseline.actualTokens !== null &&
      runningReuse.actualTokens < runningBaseline.actualTokens
    )
      amortizationHorizon = index + 1;
    return {
      id: c.id,
      applicability: c.applicability,
      reuse: cost,
      baseline: base,
      outcome: c.reuse.outcome,
      qualityRegression: c.baseline?.outcome.kind === "fulfilled" && c.reuse.outcome.kind !== "fulfilled",
      actualTokenSavings:
        base?.actualTokens !== null && base?.actualTokens !== undefined && cost.actualTokens !== null
          ? base.actualTokens - cost.actualTokens
          : null,
    };
  });
  return {
    schemaVersion: "fleet.skill-efficiency.v1",
    evidenceLevel: cases.every(
      (c) => c.reuse.evidence === "synthetic" && (!c.baseline || c.baseline.evidence === "synthetic"),
    )
      ? "synthetic"
      : "mixed-or-measured",
    timingEvidence: [...new Set(cases.flatMap((c) => [c.reuse.timing, ...(c.baseline ? [c.baseline.timing] : [])]))],
    cases: rows,
    phases,
    totals: {
      reuse,
      baseline,
      actualTokenSavings:
        baseline?.actualTokens !== null && baseline?.actualTokens !== undefined && reuse.actualTokens !== null
          ? baseline.actualTokens - reuse.actualTokens
          : null,
    },
    coverage: {
      pairedCases: cases.filter((c) => c.baseline).length,
      totalCases: cases.length,
      fulfilled: cases.filter((c) => c.reuse.outcome.kind === "fulfilled").length,
      admittedOnly: cases.filter((c) => c.reuse.outcome.kind === "admitted").length,
      unknown: cases.filter((c) => c.reuse.outcome.kind === "unknown").length,
      applicabilityMisses: cases.filter((c) => c.applicability === "miss").length,
      qualityRegressions: rows.filter((r) => r.qualityRegression).length,
    },
    observedAmortizationHorizon: amortizationHorizon,
    meaning:
      "All supplied acquisition, validation, retrieval, execution, monitoring and fallback costs are included. Reservations are not actual usage. Null means unobserved. Amortization is observed only across comparable fulfilled pairs; it is not a prediction or real-provider qualification.",
  };
}
