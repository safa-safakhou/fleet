import { z } from "zod";
import type { RunSnapshot } from "../evidence/inspection.js";
import type { EvidenceEvent } from "../evidence/types.js";
export const WindowSchema = z
  .object({ start: z.iso.datetime(), end: z.iso.datetime() })
  .strict()
  .refine((w) => Date.parse(w.start) < Date.parse(w.end), "Invalid half-open window");
export type MetricWindow = z.infer<typeof WindowSchema>;
export const MeasurementSchema = z
  .object({
    id: z.string(),
    at: z.iso.datetime(),
    value: z.number().finite().nullable(),
    numerator: z.number().finite().optional(),
    denominator: z.number().finite().nonnegative().optional(),
    status: z.enum(["complete", "censored", "ungraded", "unavailable"]),
    sourceRefs: z.array(z.string()).max(500),
    ungraded: z.number().int().nonnegative().optional(),
    priceVersion: z.string().max(200).optional(),
    billableUnits: z.number().finite().nonnegative().optional(),
  })
  .strict();
export type Measurement = z.infer<typeof MeasurementSchema>;
export type ObservationFact = {
  eventId: string;
  artifactId: string;
  observedAt: string;
  sourceRefs: string[];
  payload: Record<string, unknown>;
};
export type MetricEvidence = {
  snapshotId: string;
  events: EvidenceEvent[];
  measurements: Measurement[];
  observations?: ObservationFact[];
  sourceRefs: string[];
  unavailableRefs: string[];
};
export interface MetricEvidencePort {
  load(snapshot: RunSnapshot): Promise<MetricEvidence>;
}
export type MetricDefinition = {
  id: string;
  version: string;
  family: string;
  unit: string;
  direction: string;
  formula: string;
  source: string;
  operation: string;
  population: string;
  timeBasis: string;
  unavailable: string;
};
export type MetricValue = {
  id: string;
  version: string;
  unit: string;
  value: number | null;
  numerator: string | null;
  denominator: string | null;
  population: string;
  window: MetricWindow;
  timeBasis: string;
  coverage: {
    status: "complete" | "partial" | "unavailable";
    expected: number;
    recorded: number;
    censored: number;
    ungraded: number;
  };
  sourceRefs: string[];
  evaluatorDigest: string;
  exclusions: string[];
};
export type MetricSet = {
  version: "fleet.metric-set/v1";
  snapshotId: string;
  digest: string;
  values: MetricValue[];
  exclusions: string[];
  ungraded: number;
  unresolvedUsage: { allocations: number; reservedTokens: string | null };
};
export const inWindow = (at: string | undefined, w: MetricWindow) =>
  Boolean(at && Date.parse(at) >= Date.parse(w.start) && Date.parse(at) < Date.parse(w.end));
