import { randomUUID } from "node:crypto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  createAllowListAttributesProcessor,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import type { EvidenceEvent } from "../evidence/types.js";
import { OperationalMetrics } from "./metrics.js";
import { TelemetryProjection } from "./projection.js";
export class TelemetryPump {
  private busy = false;
  constructor(
    readonly store: Store,
    readonly projection: TelemetryProjection,
    readonly metrics: OperationalMetrics,
  ) {}
  async tick(limit = 100) {
    if (this.busy) return 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new FleetError("TELEMETRY_LIMIT", true);
    this.busy = true;
    try {
      const owner = randomUUID(),
        now = this.store.now();
      const rows = await transaction(this.store.pool, async (db) => {
        await db.query(
          "INSERT INTO research_telemetry_delivery(event_id,updated_at) SELECT e.id,$1 FROM research_events e LEFT JOIN research_telemetry_delivery d ON d.event_id=e.id WHERE d.event_id IS NULL ORDER BY (e.event->>'recordedAt')::timestamptz,e.id LIMIT $2 ON CONFLICT DO NOTHING",
          [now, limit],
        );
        return (
          await db.query(
            `WITH picked AS (SELECT event_id FROM research_telemetry_delivery WHERE state='pending' AND next_attempt_at<=$1 AND (lease_until IS NULL OR lease_until<=$1) ORDER BY updated_at,event_id LIMIT $2 FOR UPDATE SKIP LOCKED)
      UPDATE research_telemetry_delivery d SET attempts=attempts+1,owner=$3,lease_until=$4,updated_at=$1 FROM picked WHERE d.event_id=picked.event_id RETURNING d.event_id,d.attempts`,
            [now, limit, owner, new Date(now.getTime() + Math.max(30000, limit * 2500 + 5000))],
          )
        ).rows;
      });
      for (const row of rows) {
        const event = (await this.store.pool.query("SELECT event FROM research_events WHERE id=$1", [row.event_id]))
          .rows[0]?.event as EvidenceEvent;
        let state = "exported";
        try {
          await this.projection.publish(event);
        } catch {
          state = row.attempts >= 3 ? "dropped" : "pending";
        }
        await this.store.pool.query(
          "UPDATE research_telemetry_delivery SET state=$2,owner=NULL,lease_until=NULL,next_attempt_at=$3,updated_at=$4 WHERE event_id=$1 AND owner=$5",
          [row.event_id, state, new Date(now.getTime() + 5000), this.store.now(), owner],
        );
      }
      await this.metrics.refresh(this.store);
      return rows.length;
    } finally {
      this.busy = false;
    }
  }
}
export function createTelemetry(store: Store, endpoint: string) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new FleetError("TELEMETRY_LOOPBACK_REQUIRED", true);
  const base = url.origin,
    resource = resourceFromAttributes({ "service.name": "fleet-kernel", "service.version": "research-v1" });
  const reader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, timeoutMillis: 1500 }),
    exportIntervalMillis: 5000,
    exportTimeoutMillis: 2000,
    cardinalityLimits: { default: 512 },
  });
  const meters = new MeterProvider({
    resource,
    readers: [reader],
    views: [
      {
        instrumentName: "fleet.*",
        attributesProcessors: [createAllowListAttributesProcessor(["kind", "outcome", "component", "status", "state"])],
        aggregationCardinalityLimit: 512,
      },
    ],
  });
  const metrics = new OperationalMetrics(meters.getMeter("fleet.evidence", "1")),
    projection = new TelemetryProjection(
      new OTLPTraceExporter({ url: `${base}/v1/traces`, timeoutMillis: 1500 }),
      metrics,
    ),
    pump = new TelemetryPump(store, projection, metrics);
  return {
    pump,
    metrics,
    projection,
    flush: () => meters.forceFlush(),
    close: async () => {
      await projection.close();
      await meters.shutdown();
    },
  };
}

/** A separate bounded projection loop; never awaited by gameplay or native settlement. */
export function startTelemetryLoop(telemetry: ReturnType<typeof createTelemetry> | undefined) {
  if (!telemetry) return async () => {};
  let stopped = false,
    inFlight: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || inFlight) return;
    inFlight = telemetry.pump
      .tick(50)
      .catch(() => {})
      .finally(() => {
        inFlight = undefined;
      });
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await inFlight;
    await telemetry.close();
  };
}
