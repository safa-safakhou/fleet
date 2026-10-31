import { MetricCatalog } from "../metrics/catalog.js";
import type { ExperimentRepository } from "./repository.js";
export type TrackingMetadata = {
  snapshotDigest: string;
  parameters: Record<string, string>;
  metrics: Record<string, number>;
  artifactRefs: string[];
};
/** Replaceable sink; publication is already durable before this optional projection. */
export class MLflowProjection {
  constructor(
    readonly experiments: ExperimentRepository,
    readonly sink: { sync: (metadata: TrackingMetadata) => Promise<unknown> },
  ) {}
  async sync(snapshot: { id: string }) {
    const source = await this.experiments.retained(snapshot.id),
      catalog = new MetricCatalog(),
      metrics: Record<string, number> = {};
    for (const id of [source.spec.primaryMetric, ...source.spec.secondaryMetrics]) {
      catalog.get(id);
      const values = source.units.flatMap((u) =>
        u.runs.flatMap((r) => r.metrics.values.filter((m) => m.id === id && m.value !== null).map((m) => m.value!)),
      );
      if (values.length) metrics[id] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    const payload: TrackingMetadata = {
      snapshotDigest: source.digest,
      parameters: {
        seed: String(source.spec.seed),
        primaryMetric: source.spec.primaryMetric,
        method: "descriptive-run-mean",
        methodVersion: "1",
        trainDigest: source.spec.splitDigests.train,
        developmentDigest: source.spec.splitDigests.development,
        heldoutDigest: source.spec.splitDigests.heldout,
      },
      metrics,
      artifactRefs: [source.id],
    };
    let status: "synced" | "unavailable" = "unavailable";
    try {
      const result = await this.sink.sync(payload);
      if (result && typeof result === "object" && "status" in result && result.status === "synced") status = "synced";
    } catch {}
    await this.experiments.store.pool.query(
      "INSERT INTO research_mlflow_sync VALUES($1,$2,$3,$4) ON CONFLICT(snapshot_id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at",
      [source.id, source.digest, status, this.experiments.store.now()],
    );
    return { status, snapshotDigest: source.digest };
  }
}
