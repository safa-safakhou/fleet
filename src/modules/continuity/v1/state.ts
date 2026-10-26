import { z } from "zod";
import { ContinuationUpdate } from "../../../continuation.js";
import type { DomainTime } from "../../../platform/contracts.js";
export const continuityMeaning =
  "Owner values and current facts are separate from subjective hypotheses, plans and predictions. Peer statements are not delivery or motive. Missing evidence remains unresolved; no update is required. Predictions test the next later observed fact of the named subject/predicate within their stated horizon, not all possible world events. Historical commitments/outcomes require authoritative occurrence time.";

export type EvidenceLink = { sourceRef: string; observedAt: string; taskId: string };
export const text = z.string().min(1).max(400),
  id = z.string().min(1).max(80),
  refs = z.array(z.uuid()).min(1).max(4);
export const time = z.object({ clockId: z.string().min(1).max(100), value: z.string().min(1).max(100) }).strict();
export const factSchema = z
  .object({
    sourceRef: z.string().min(1).max(8000),
    kind: z.enum(["state", "statement", "commitment", "outcome"]),
    subject: text,
    predicate: text,
    value: text,
    occurredAt: time.optional(),
  })
  .strict();
export const ContinuityObservationSchema = z
  .object({
    schemaVersion: z.literal("fleet.continuity-observation.v1"),
    self: z
      .object({
        capabilities: z.array(text).max(40),
        needs: z.record(z.string(), z.unknown()),
        dependencies: z.record(z.string(), z.unknown()),
        ownerValues: z.record(z.string(), z.unknown()),
      })
      .strict(),
    facts: z.array(factSchema).max(40),
  })
  .strict();
export const belief = z
  .object({
    id,
    subject: text,
    hypothesis: text,
    alternative: text,
    confidence: z.enum(["low", "medium"]),
    evidenceRefs: refs,
  })
  .strict();
export const prediction = z
  .object({
    id,
    subject: text,
    predicate: text,
    expected: text,
    dueBy: time.describe(
      "Latest time for testing the next observed fact of this subject/predicate; missing evidence stays unresolved.",
    ),
    evidenceRefs: refs,
  })
  .strict();
const note = z.object({ text, evidenceRefs: refs }).strict();
const plan = note
  .extend({
    steps: ContinuationUpdate.shape.steps.optional(),
    nextStepId: z.string().max(64).nullable().optional(),
    wait: ContinuationUpdate.shape.wait.optional(),
  })
  .strict();
export const ContinuityUpdateSchema = z
  .object({
    beliefs: z.array(belief).max(8).optional(),
    predictions: z.array(prediction).max(8).optional(),
    plan: plan.nullable().optional(),
    memories: z.array(note).max(8).optional(),
    reflections: z.array(note).max(8).optional(),
  })
  .strict();

export type Saved<T> = T & { recordedAt: string; environmentTime: DomainTime; ownerIntentFingerprint: string };
export type State = {
  beliefs: Saved<z.infer<typeof belief>>[];
  predictions: Saved<z.infer<typeof prediction>>[];
  plan: Saved<z.infer<typeof plan>> | null;
  memories: Saved<z.infer<typeof note>>[];
  reflections: Saved<z.infer<typeof note>>[];
};
export const empty = (): State => ({ beliefs: [], predictions: [], plan: null, memories: [], reflections: [] });
export const lifetime = 30 * 86400000;
export const later = (a: DomainTime, b: DomainTime) =>
  a.clockId === b.clockId &&
  (a.clockId === "utc"
    ? Number.isFinite(Date.parse(a.value)) &&
      Number.isFinite(Date.parse(b.value)) &&
      Date.parse(a.value) > Date.parse(b.value)
    : /^\d+$/.test(a.value) && /^\d+$/.test(b.value) && BigInt(a.value) > BigInt(b.value));

/** A separate binding/profile namespace; existing journals remain the encrypted evidence authority. */

import type { ContinuityV1Ports } from "./ports.js";
export class ContinuityV1 {
  private ports: ContinuityV1Ports;
  constructor(ports: ContinuityV1Ports | undefined) {
    if (!ports) throw Error("CONTINUITY_PORTS_REQUIRED");
    this.ports = ports;
  }
  context(...args: Parameters<ContinuityV1Ports["context"]>) {
    return this.ports.context(...args);
  }
  restrict(...args: Parameters<ContinuityV1Ports["restrict"]>) {
    return this.ports.restrict(...args);
  }
  apply(...args: Parameters<ContinuityV1Ports["apply"]>) {
    return this.ports.apply(...args);
  }
  recordCommand(...args: Parameters<ContinuityV1Ports["recordCommand"]>) {
    return this.ports.recordCommand(...args);
  }
}
