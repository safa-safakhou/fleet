import { z } from "zod";
import { canonical, digest } from "../contracts.js";
import type { RunSnapshot } from "../evidence/inspection.js";
import { inWindow, type Measurement, type MetricEvidencePort, WindowSchema } from "../metrics/types.js";
import { pointer } from "./grounding.js";

const Rule = z
  .object({ id: z.string().min(1).max(200), pointer: z.string().startsWith("/"), equals: z.unknown() })
  .strict();
export const EvaluatorSpecSchema = z
  .object({
    version: z.literal("pact-rules@1"),
    window: WindowSchema,
    objectives: z.array(Rule).max(500),
    facts: z
      .array(z.object({ id: z.string(), pointer: z.string().startsWith("/"), claimed: z.unknown() }).strict())
      .max(500),
    receipts: z.array(z.object({ commandId: z.string(), meaning: z.literal("admission") }).strict()).max(500),
  })
  .strict();
export type EvaluatorSpec = z.input<typeof EvaluatorSpecSchema>;
export type EvaluationResult = {
  version: "fleet.evaluation/v1";
  snapshotId: string;
  evaluatorDigest: string;
  objectives: { id: string; status: "completed" | "failed" | "ungraded"; sourceRefs: string[] }[];
  facts: { id: string; correct: boolean | null; sourceRefs: string[] }[];
  receipts: { commandId: string; admitted: boolean; completedObjective: false }[];
  measurements: Measurement[];
  oracleIsolation: "evaluation-only";
  digest: string;
};
export class PactEvaluator {
  constructor(readonly evidence: MetricEvidencePort) {}
  async grade(snapshot: RunSnapshot, raw: EvaluatorSpec): Promise<EvaluationResult> {
    const spec = EvaluatorSpecSchema.parse(raw),
      data = await this.evidence.load(snapshot);
    if (data.snapshotId !== snapshot.id) throw Error("EVALUATOR_SNAPSHOT_MISMATCH");
    const observations = (data.observations ?? [])
      .filter((o) => inWindow(o.observedAt, spec.window))
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || (a.eventId < b.eventId ? -1 : 1));
    const find = (path: string) => {
      for (const o of observations.slice().reverse()) {
        const v = pointer(o.payload, path);
        if (v.found) return { value: v.value, refs: [o.eventId, o.artifactId, ...o.sourceRefs] };
      }
      return null;
    };
    const objectives = spec.objectives.map((rule) => {
      const value = find(rule.pointer);
      return {
        id: rule.id,
        status: !value
          ? ("ungraded" as const)
          : canonical(value.value) === canonical(rule.equals)
            ? ("completed" as const)
            : ("failed" as const),
        sourceRefs: value?.refs ?? [],
      };
    });
    const facts = spec.facts.map((rule) => {
      const value = find(rule.pointer);
      return {
        id: rule.id,
        correct: value ? canonical(value.value) === canonical(rule.claimed) : null,
        sourceRefs: value?.refs ?? [],
      };
    });
    const receipts = spec.receipts.map((r) => ({
      commandId: r.commandId,
      admitted: snapshot.native.commands.some((c) => c.id === r.commandId && c.status === "confirmed"),
      completedObjective: false as const,
    }));
    const evaluatorDigest = digest(spec),
      at = new Date(Date.parse(spec.window.end) - 1).toISOString(),
      sourceRefs = [...new Set([...objectives.flatMap((o) => o.sourceRefs), ...facts.flatMap((o) => o.sourceRefs)])];
    const measurements: Measurement[] = [
      {
        id: "objective_success_rate.v1",
        at,
        value: null,
        numerator: objectives.filter((o) => o.status === "completed").length,
        denominator: objectives.filter((o) => o.status !== "ungraded").length,
        status: "complete",
        ungraded: objectives.filter((o) => o.status === "ungraded").length,
        sourceRefs,
      },
      {
        id: "factual_accuracy.v1",
        at,
        value: null,
        numerator: facts.filter((f) => f.correct === true).length,
        denominator: facts.filter((f) => f.correct !== null).length,
        status: "complete",
        ungraded: facts.filter((f) => f.correct === null).length,
        sourceRefs,
      },
      {
        id: "objectives_completed.v1",
        at,
        value: objectives.filter((o) => o.status === "completed").length,
        status: "complete",
        sourceRefs,
      },
    ];
    const body = {
      version: "fleet.evaluation/v1" as const,
      snapshotId: snapshot.id,
      evaluatorDigest,
      objectives,
      facts,
      receipts,
      measurements,
      oracleIsolation: "evaluation-only" as const,
    };
    return { ...body, digest: digest(body) };
  }
}
