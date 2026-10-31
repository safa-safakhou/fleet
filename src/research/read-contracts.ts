/** O4/A1/A2 authoritative read models. Type imports never ship server implementations. */

export type { ContextLineage } from "./context/lineage.js";
export type { ArtifactRef } from "./contracts.js";
export type { RunSnapshot } from "./evidence/inspection.js";
export type { CompletenessManifest, EvidenceEvent } from "./evidence/types.js";
export type { MetricDefinition, MetricSet, MetricValue } from "./metrics/types.js";
export type ComparisonReport = ReturnType<typeof import("./experiments/comparison.js").compareExperiment>;
export type EventPage = Awaited<ReturnType<import("./evidence/inspection.js").RunInspection["events"]>>;
export type WireEvent = import("./generated/fleet/v1/evidence_pb.js").EvidenceEvent;
export type ArtifactChunk = {
  index: number;
  chunks: number;
  bytes: number;
  totalBytes: string;
  body: string;
  complete: boolean;
  contentType: string;
};

export type InspectedEvent = import("./evidence/types.js").EvidenceEvent & { traceparent?: string };
