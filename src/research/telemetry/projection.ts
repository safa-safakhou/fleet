import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { ROOT_CONTEXT, type SpanContext, SpanStatusCode, TraceFlags, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { AlwaysOnSampler, type ReadableSpan, type SpanExporter, TracerProvider } from "@opentelemetry/sdk-trace";
import { FleetError } from "../../domain.js";
import { EventSchema, type EvidenceEvent } from "../evidence/types.js";
import type { OperationalMetrics } from "./metrics.js";

const hash = (s: string, n: number) => createHash("sha256").update(s).digest("hex").slice(0, n);
export const eventContext = (e: Pick<EvidenceEvent, "id" | "scope">): SpanContext => ({
  traceId: hash(`fleet.run:${e.scope.runId}`, 32),
  spanId: hash(`fleet.event:${e.id}`, 16),
  traceFlags: TraceFlags.SAMPLED,
  isRemote: true,
});
export const traceLink = (e: Pick<EvidenceEvent, "id" | "scope">) => {
  const c = eventContext(e);
  return `00-${c.traceId}-${c.spanId}-01`;
};
export function parseTraceparent(value: string): SpanContext | undefined {
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-(0[01])$/.exec(value);
  return match && match[1] !== "0".repeat(32) && match[2] !== "0".repeat(16)
    ? {
        traceId: match[1],
        spanId: match[2],
        traceFlags: match[3] === "01" ? TraceFlags.SAMPLED : TraceFlags.NONE,
        isRemote: true,
      }
    : undefined;
}
/** Explicit providers: no global registration, environment/host detection, HTTP/SQL/model auto instrumentation, or log exporter. */
export class TelemetryProjection {
  private frame = new AsyncLocalStorage<{ event: EvidenceEvent; span?: ReadableSpan }>();
  private provider: TracerProvider;
  private delivered = new Set<string>();
  private counted = new Set<string>();
  constructor(
    private exporter: SpanExporter,
    readonly metrics: OperationalMetrics,
  ) {
    this.provider = new TracerProvider({
      resource: resourceFromAttributes({ "service.name": "fleet-kernel", "service.version": "research-v1" }),
      sampler: new AlwaysOnSampler(),
      idGenerator: {
        generateTraceId: () => eventContext(this.current()).traceId,
        generateSpanId: () => eventContext(this.current()).spanId,
      },
      spanLimits: { attributeCountLimit: 20, attributeValueLengthLimit: 200, linkCountLimit: 100, eventCountLimit: 0 },
      spanProcessors: [
        {
          onStart() {},
          onEnd: (span) => {
            const f = this.frame.getStore();
            if (f) f.span = span;
          },
          forceFlush: async () => {},
          shutdown: async () => {},
        },
      ],
    });
  }
  private current() {
    const event = this.frame.getStore()?.event;
    if (!event) throw new FleetError("TELEMETRY_CONTEXT_REQUIRED");
    return event;
  }
  private remember(set: Set<string>, id: string) {
    set.add(id);
    if (set.size > 10000) set.delete(set.values().next().value!);
  }
  async publish(input: EvidenceEvent): Promise<void> {
    const event = EventSchema.parse(input);
    if (this.delivered.has(event.id)) return;
    if (!this.counted.has(event.id)) {
      this.metrics.record(event);
      this.remember(this.counted, event.id);
    }
    const frame: { event: EvidenceEvent; span?: ReadableSpan } = { event };
    this.frame.run(frame, () => {
      const parents = event.parentIds.map((id) => eventContext({ id, scope: event.scope })),
        ctx = parents[0] ? trace.setSpanContext(ROOT_CONTEXT, parents[0]) : ROOT_CONTEXT;
      const attributes = {
        "fleet.event.id": event.id,
        "fleet.run.id": event.scope.runId,
        "fleet.event.kind": event.kind,
        "fleet.coverage": event.coverage.status,
        "fleet.duration.available": event.durationNs !== undefined || event.attributes.durationMs !== undefined,
        ...(event.attributes.outcome ? { "fleet.outcome": event.attributes.outcome } : {}),
        ...(event.attributes.purpose ? { "fleet.purpose": event.attributes.purpose } : {}),
      };
      const start = new Date(event.occurredAt).getTime(),
        duration = event.durationNs
          ? Number(BigInt(event.durationNs)) / 1000000
          : Number(event.attributes.durationMs ?? 0);
      const span = this.provider
        .getTracer("fleet.evidence", "1")
        .startSpan(
          event.kind,
          { startTime: start, attributes, links: parents.slice(1).map((context) => ({ context })) },
          ctx,
        );
      if (event.attributes.outcome === "error") span.setStatus({ code: SpanStatusCode.ERROR });
      span.end(start + Math.min(duration, 86400000));
    });
    try {
      if (!frame.span) throw Error();
      const span = frame.span;
      await new Promise<void>((resolve, reject) => {
        this.exporter.export([span], (result) =>
          result.code === 0 ? resolve() : reject(new FleetError("TELEMETRY_UNAVAILABLE", true)),
        );
      });
      this.remember(this.delivered, event.id);
    } catch {
      this.metrics.dropped();
      throw new FleetError("TELEMETRY_UNAVAILABLE", true);
    }
  }
  async close() {
    await this.provider.shutdown();
    await this.exporter.shutdown();
  }
}
