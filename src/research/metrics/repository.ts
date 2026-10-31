import { randomUUID } from "node:crypto";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import { type EvaluatorSpec, PactEvaluator } from "../evaluation/pact.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import type { ResearchPrincipal, RunInspection, RunSnapshot } from "../evidence/inspection.js";
import { MetricAggregator } from "./aggregate.js";
import { SnapshotMetricEvidence } from "./evidence.js";
import type { MetricSet, MetricWindow } from "./types.js";
export type MetricRecord = { id: string; metrics: MetricSet; evaluation: unknown; snapshot: RunSnapshot };
export class MetricRepository {
  constructor(
    readonly inspection: RunInspection,
    readonly capture: CaptureSession,
    readonly principal: ResearchPrincipal,
  ) {}
  async compute(snapshot: RunSnapshot, ids: string[], window: MetricWindow, spec?: EvaluatorSpec) {
    const loader = new SnapshotMetricEvidence(this.inspection, this.principal),
      evidence = await loader.load(snapshot);
    const evaluation = spec ? await new PactEvaluator({ load: async () => evidence }).grade(snapshot, spec) : null;
    if (evaluation)
      evidence.measurements = [
        ...evidence.measurements.filter((m) => !evaluation.measurements.some((e) => e.id === m.id)),
        ...evaluation.measurements,
      ];
    const metrics = await new MetricAggregator(
      { load: async () => evidence },
      { window, ...(evaluation ? { evaluatorDigest: evaluation.evaluatorDigest } : {}) },
    ).compute(snapshot, ids);
    const id = randomUUID(),
      scope = snapshot.scopes[0];
    if (!scope) throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
    await transaction(this.inspection.store.pool, async (db) => {
      const run = await this.inspection.authorize(snapshot.runId, this.principal, db);
      await db.query("SELECT id FROM cohorts WHERE id=$1 FOR SHARE", [run.cohort_id]);
      const original = (
        await db.query("SELECT consent_version::text version FROM research_snapshots WHERE id=$1", [snapshot.id])
      ).rows[0];
      if (original?.version !== run.consent_version) throw new FleetError("EVIDENCE_WITHHELD", true);
      const event = await this.capture.emit(
        scope,
        "evaluation.result",
        { metrics, evaluation, snapshot },
        {},
        { db, required: true, stream: "independent-evaluator", sourceRefs: evidence.sourceRefs },
      );
      if (!event) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
      const ref = (await db.query("SELECT event->'artifacts'->0 ref FROM research_events WHERE id=$1", [event.id]))
        .rows[0].ref;
      await db.query("INSERT INTO research_metric_snapshots VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
        id,
        snapshot.id,
        snapshot.runId,
        this.principal.sessionHash,
        run.consent_version,
        metrics.digest,
        scope,
        ref,
        this.inspection.store.now(),
        run.expires_at,
      ]);
    });
    return { id, metrics, evaluation };
  }
  async latest(runId: string) {
    await this.inspection.authorize(runId, this.principal);
    const ids = (
      await this.inspection.store.pool.query(
        "SELECT id FROM research_metric_snapshots WHERE run_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",
        [runId],
      )
    ).rows;
    const published = [];
    for (const { id } of ids) {
      const { metrics, evaluation } = await this.get(id);
      published.push({ id, metrics, evaluation });
    }
    await this.inspection.authorize(runId, this.principal);
    return published;
  }
  async get(id: string): Promise<MetricRecord> {
    const row = (await this.inspection.store.pool.query("SELECT * FROM research_metric_snapshots WHERE id=$1", [id]))
      .rows[0];
    if (!row) throw new FleetError("METRIC_SNAPSHOT_UNAVAILABLE", true);
    const authorize = async () => {
      const run = await this.inspection.authorize(row.run_id, this.principal);
      if (String(row.consent_version) !== run.consent_version) throw new FleetError("EVIDENCE_WITHHELD", true);
      if (new Date(row.expires_at) <= this.inspection.store.now())
        throw new FleetError("METRIC_SNAPSHOT_UNAVAILABLE", true);
    };
    await authorize();
    const chunks = [];
    for await (const chunk of this.capture.artifacts.read(row.scope, row.artifact_ref)) chunks.push(Buffer.from(chunk));
    await authorize();
    return { id, ...JSON.parse(Buffer.concat(chunks).toString()) };
  }
}
