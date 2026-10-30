import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { expect, test } from "vitest";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { scopeForTurn } from "../../src/research/evidence/repository.js";
import { OperationalMetrics } from "../../src/research/telemetry/metrics.js";
import { TelemetryProjection } from "../../src/research/telemetry/projection.js";
import { TelemetryPump } from "../../src/research/telemetry/sdk.js";
import { researchFixture } from "../research-helpers.js";

test("telemetry outage and competing pumps cannot alter the journal or dispatch execution", async () => {
  const f = await researchFixture(),
    meters = new MeterProvider(),
    metrics = new OperationalMetrics(meters.getMeter("fixture"));
  let down = true,
    exports = 0;
  const projection = new TelemetryProjection(
      {
        export: (_s, cb) => {
          if (down) cb({ code: 1 });
          else {
            exports++;
            cb({ code: 0 });
          }
        },
        shutdown: async () => {},
      },
      metrics,
    ),
    pump = new TelemetryPump(f.store, projection, metrics);
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    await new EvidenceRecorder(f.store).append(scope, { kind: "run.started", streamId: "run", producerKey: "start" });
    const before = await new CoverageService(f.store).reconcile(scope.runId);
    await pump.tick();
    expect(metrics.losses).toBe(1);
    expect(await new CoverageService(f.store).reconcile(scope.runId)).toEqual(before);
    down = false;
    f.advance(6000);
    await Promise.all([pump.tick(), new TelemetryPump(f.store, projection, metrics).tick()]);
    await pump.tick();
    expect(exports).toBe(1);
    expect((await f.pool.query("SELECT state FROM research_telemetry_delivery")).rows).toEqual([{ state: "exported" }]);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  } finally {
    await projection.close();
    await meters.shutdown();
    await f.pool.end();
  }
});

test("exhausted exporter retries become a visible drop without execution retries", async () => {
  const f = await researchFixture(),
    meters = new MeterProvider(),
    metrics = new OperationalMetrics(meters.getMeter("fixture"));
  const projection = new TelemetryProjection(
      { export: (_s, cb) => cb({ code: 1 }), shutdown: async () => {} },
      metrics,
    ),
    pump = new TelemetryPump(f.store, projection, metrics);
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    await new EvidenceRecorder(f.store).append(scope, {
      kind: "run.started",
      streamId: "run",
      producerKey: "drop-start",
    });
    for (let i = 0; i < 3; i++) {
      await pump.tick();
      f.advance(6000);
    }
    expect(await pump.tick()).toBe(0);
    expect(metrics.losses).toBe(3);
    expect((await f.pool.query("SELECT state,attempts FROM research_telemetry_delivery")).rows).toEqual([
      { state: "dropped", attempts: 3 },
    ]);
    expect((await new CoverageService(f.store).reconcile(scope.runId)).status).toBe("complete");
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  } finally {
    await projection.close();
    await meters.shutdown();
    await f.pool.end();
  }
});
