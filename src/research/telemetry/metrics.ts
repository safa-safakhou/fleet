import type { Attributes, Meter } from "@opentelemetry/api";
import type { Store } from "../../store.js";
import type { EvidenceEvent } from "../evidence/types.js";
export class OperationalMetrics {
  readonly event;
  readonly duration;
  readonly queue;
  readonly loss;
  readonly lag;
  readonly delivery;
  readonly coverage;
  readonly bytes;
  readonly work;
  readonly unknown;
  readonly memory;
  losses = 0;
  constructor(meter: Meter) {
    this.event = meter.createCounter("fleet.evidence.events", {
      description: "Projected evidence units; advisory, journal is authoritative",
    });
    this.duration = meter.createHistogram("fleet.service.duration", { unit: "ms" });
    this.queue = meter.createHistogram("fleet.queue.delay", { unit: "ms" });
    this.loss = meter.createCounter("fleet.telemetry.loss", {
      description: "Failed span delivery attempts, including later recovered ones",
    });
    this.lag = meter.createGauge("fleet.telemetry.lag", { unit: "s" });
    this.delivery = meter.createGauge("fleet.telemetry.delivery");
    this.coverage = meter.createGauge("fleet.recording.runs");
    this.bytes = meter.createGauge("fleet.recording.bytes", { unit: "By" });
    this.work = meter.createGauge("fleet.queue.pending");
    this.unknown = meter.createGauge("fleet.usage.unknown");
    this.memory = meter.createObservableGauge("fleet.process.memory", { unit: "By" });
    this.memory.addCallback((result) => {
      result.observe(process.memoryUsage().rss, { component: "kernel" });
    });
  }
  record(event: EvidenceEvent) {
    const attrs: Attributes = {
      kind: event.kind,
      outcome: event.attributes.outcome ?? "ok",
      component: event.kind.split(".")[0],
    };
    this.event.add(1, attrs);
    const bounded = (s: string | undefined) =>
      s !== undefined && /^\d+$/.test(s) && BigInt(s) <= 1000000000000n ? Number(s) : undefined;
    const d = bounded(event.attributes.durationMs),
      q = bounded(event.attributes.queueDelayMs);
    if (d !== undefined) this.duration.record(d, { component: attrs.component, outcome: attrs.outcome });
    if (q !== undefined) this.queue.record(q, { component: attrs.component });
  }
  dropped() {
    this.losses++;
    this.loss.add(1, { component: "trace-exporter" });
  }
  async refresh(store: Store) {
    const statuses = (
      await store.pool.query("SELECT state,count(*)::int n FROM research_telemetry_delivery GROUP BY state")
    ).rows;
    for (const state of ["pending", "exported", "dropped"])
      this.delivery.record(statuses.find((r) => r.state === state)?.n ?? 0, { state });
    const runs = (
      await store.pool.query("SELECT capture_failed,count(*)::int n FROM research_runs GROUP BY capture_failed")
    ).rows;
    for (const failed of [false, true])
      this.coverage.record(runs.find((r) => r.capture_failed === failed)?.n ?? 0, {
        status: failed ? "capture_failed" : "no_capture_failure",
      });
    const bytes = (
      await store.pool.query("SELECT status,COALESCE(sum(bytes),0)::text n FROM research_artifacts GROUP BY status")
    ).rows;
    for (const status of ["writing", "complete", "partial", "withheld", "expired"])
      this.bytes.record(Math.min(Number(bytes.find((r) => r.status === status)?.n ?? 0), Number.MAX_SAFE_INTEGER), {
        status,
      });
    this.work.record(
      (await store.pool.query("SELECT count(*)::int n FROM platform_tasks WHERE state IN ('ready','running')")).rows[0]
        .n,
    );
    this.unknown.record(
      (await store.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='unknown'")).rows[0].n,
    );
    const oldest = (
      await store.pool.query(
        "SELECT min((e.event->>'recordedAt')::timestamptz) oldest FROM research_events e LEFT JOIN research_telemetry_delivery d ON d.event_id=e.id WHERE d.event_id IS NULL OR d.state='pending'",
      )
    ).rows[0].oldest;
    this.lag.record(oldest ? Math.max(0, (store.now().getTime() - new Date(oldest).getTime()) / 1000) : 0);
  }
}
