import { Ajv } from "ajv";
import { FleetError, object } from "../../domain.js";
import { canonical } from "../contracts.js";
import type { ResearchPrincipal, RunInspection, RunSnapshot } from "../evidence/inspection.js";
import { type Measurement, MeasurementSchema, type MetricEvidence, type MetricEvidencePort } from "./types.js";
/** Evaluation principal only. No adapter from this port to actor tools/context/memory. */
export class SnapshotMetricEvidence implements MetricEvidencePort {
  constructor(
    readonly inspection: RunInspection,
    readonly principal: ResearchPrincipal,
  ) {}
  async load(snapshot: RunSnapshot): Promise<MetricEvidence> {
    const current = await this.inspection.retained(snapshot.runId, this.principal, snapshot.id);
    if (canonical(current) !== canonical(snapshot)) throw new FleetError("METRIC_SNAPSHOT_MISMATCH", true);
    const result: MetricEvidence = {
      snapshotId: snapshot.id,
      events: [],
      measurements: [],
      observations: [],
      sourceRefs: [],
      unavailableRefs: [],
    };
    let cursor: string | undefined,
      totalBytes = 0;
    const schemas = new Map<string, unknown>();
    do {
      const page = await this.inspection.events(snapshot.runId, this.principal, {
        snapshotId: snapshot.id,
        limit: 500,
        ...(cursor ? { cursor } : {}),
      });
      for (const event of page.events) {
        result.events.push(event);
        if (result.events.length > 200000) throw new FleetError("METRIC_ANALYSIS_LIMIT", true);
        if (
          ![
            "model.request",
            "model.response",
            "game.read.response",
            "observation.record",
            "memory.read",
            "context.prepared",
            "embedding.result",
            "evaluation.result",
          ].includes(event.kind)
        )
          continue;
        for (const ref of event.artifacts) {
          try {
            const chunks = [];
            for await (const chunk of this.inspection.artifact(snapshot.runId, this.principal, ref.id, snapshot.id)) {
              totalBytes += chunk.length;
              if (totalBytes > 64 * 1024 * 1024) throw new FleetError("METRIC_ANALYSIS_LIMIT", true);
              chunks.push(Buffer.from(chunk));
            }
            const body = object(JSON.parse(Buffer.concat(chunks).toString()));
            result.sourceRefs.push(ref.id);
            if (
              event.kind === "observation.record" &&
              event.streamId === "native-metrics" &&
              body.schemaVersion === "fleet.measurement/v1"
            )
              result.measurements.push(MeasurementSchema.parse(body.measurement));
            if (
              event.kind === "evaluation.result" &&
              event.streamId === "independent-evaluator" &&
              body.version === "fleet.evaluation/v1"
            )
              for (const m of Array.isArray(body.measurements) ? body.measurements : [])
                result.measurements.push(MeasurementSchema.parse(m));
            const observation =
              event.kind === "game.read.response"
                ? object(body.result)
                : event.kind === "observation.record" && ["observe", "environment.observe"].includes(String(body.port))
                  ? object(body.output)
                  : {};
            if (
              observation.schemaId === "pact.observation.v1" &&
              typeof observation.observedAt === "string" &&
              Array.isArray(observation.sourceRefs) &&
              observation.sourceRefs.every((r) => typeof r === "string")
            )
              result.observations!.push({
                eventId: event.id,
                artifactId: ref.id,
                observedAt: observation.observedAt,
                sourceRefs: observation.sourceRefs as string[],
                payload: object(observation.payload),
              });
            const measure = (id: string, value: number | null, numerator?: number, denominator?: number) =>
              result.measurements.push({
                id,
                at: event.occurredAt,
                value,
                ...(numerator === undefined ? {} : { numerator, denominator }),
                status: value === null && numerator === undefined ? "unavailable" : "complete",
                sourceRefs: [event.id, ref.id],
              });
            if (event.kind === "model.request")
              schemas.set(event.attributes?.allocationId ?? event.scope.operationId, body.schema);
            if (event.kind === "model.response") {
              const output = body.decision;
              measure("parse_validity.v1", null, output && typeof output === "object" ? 1 : 0, 1);
              const schema = schemas.get(event.attributes?.allocationId ?? event.scope.operationId);
              if (schema) {
                try {
                  const validate = new Ajv({ strict: false }).compile(schema as object);
                  measure("schema_validity.v1", null, validate(output) ? 1 : 0, 1);
                } catch {
                  measure("schema_validity.v1", null);
                }
              }
            }
            if (event.kind === "context.prepared") {
              const packet = object(body.accounting),
                coverage = object(object(body.lineage).mandatoryCoverage);
              if (typeof packet.messageBytes === "number") measure("request_bytes.v1", Number(packet.messageBytes));
              if (typeof packet.schemaBytes === "number") measure("schema_bytes.v1", Number(packet.schemaBytes));
              if (typeof coverage.expected === "number" && typeof coverage.recorded === "number")
                measure("mandatory_source_coverage.v1", null, coverage.recorded, coverage.expected);
              if (Array.isArray(object(body.lineage).omitted))
                measure("context_omissions.v1", (object(body.lineage).omitted as unknown[]).length);
            }
            if (event.kind === "memory.read" && typeof body.durationMs === "number")
              measure("retrieval_latency_p95.v1", body.durationMs);
            if (event.kind === "embedding.result") {
              const usage = object(body.usage);
              if (typeof usage.cpuMs === "number") measure("embedding_cpu_ms.v1", usage.cpuMs);
              if (typeof usage.durationMs === "number") measure("embedding_latency_p95.v1", usage.durationMs);
            }
          } catch (error) {
            if (
              error instanceof FleetError &&
              [
                "EVIDENCE_FORBIDDEN",
                "EVIDENCE_WITHHELD",
                "EVIDENCE_SNAPSHOT_EXPIRED",
                "METRIC_ANALYSIS_LIMIT",
              ].includes(error.code)
            )
              throw error;
            result.unavailableRefs.push(ref.id);
          }
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    if (result.events.length !== snapshot.total) throw new FleetError("METRIC_POPULATION_MISMATCH", true);
    await this.inspection.retained(snapshot.runId, this.principal, snapshot.id);
    result.sourceRefs = [...new Set(result.sourceRefs)].sort();
    return result;
  }
}
