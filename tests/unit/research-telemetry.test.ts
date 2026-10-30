import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";
import { expect, test } from "vitest";
import type { EvidenceEvent } from "../../src/research/evidence/types.js";
import { OperationalMetrics } from "../../src/research/telemetry/metrics.js";
import { parseTraceparent, TelemetryProjection, traceLink } from "../../src/research/telemetry/projection.js";
import { syntheticEvent } from "../fixtures/research/archive.js";

test("propagates_safe_links_during_exporter_outage with bounded labels and stable IDs", async () => {
  const metricsExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    reader = new PeriodicExportingMetricReader({ exporter: metricsExporter, exportIntervalMillis: 60000 }),
    meter = new MeterProvider({ readers: [reader] });
  const metrics = new OperationalMetrics(meter.getMeter("fixture"));
  let down = true;
  const spans: ReadableSpan[] = [];
  const projection = new TelemetryProjection(
    {
      export: (s, cb) => {
        if (down) cb({ code: 1 });
        else {
          spans.push(...s);
          cb({ code: 0 });
        }
      },
      shutdown: async () => {},
    },
    metrics,
  );
  const parent = syntheticEvent as EvidenceEvent,
    child = {
      ...parent,
      id: "77777777-7777-4777-8777-777777777777",
      parentIds: [parent.id],
      streamId: "rpc",
      sequence: "1",
      ordinal: "2",
      attributes: { durationMs: "23", purpose: "helper" as const },
      artifacts: [
        {
          id: "prompt-peer-key-sentinel",
          contentType: "text/plain",
          bytes: "1",
          chunks: "1",
          ciphertextDigest: "a".repeat(64),
          privacyClass: "private",
          retentionClass: "30d",
        },
      ],
    };
  try {
    await expect(projection.publish(parent)).rejects.toThrow("TELEMETRY_UNAVAILABLE");
    down = false;
    await projection.publish(parent);
    await projection.publish(parent);
    await projection.publish(child);
    expect(spans).toHaveLength(2);
    const link = parseTraceparent(traceLink(parent));
    expect(link?.traceId).toBe(spans[1].spanContext().traceId);
    expect(spans[1].parentSpanContext?.spanId).toBe(link?.spanId);
    expect(parseTraceparent("00-" + "0".repeat(32) + "-" + "0".repeat(16) + "-01")).toBeUndefined();
    expect(
      JSON.stringify(spans.map((s) => ({ attributes: s.attributes, resource: s.resource.attributes, links: s.links }))),
    ).not.toContain("sentinel");
    await meter.forceFlush();
    const exported = JSON.stringify(metricsExporter.getMetrics());
    expect(exported).not.toContain(parent.scope.agentId);
    expect(exported).not.toContain("sentinel");
    expect(metrics.losses).toBe(1);
  } finally {
    await projection.close();
    await meter.shutdown();
  }
});
