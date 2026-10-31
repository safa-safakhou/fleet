import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { digest } from "../src/research/contracts.js";
import { loadDataset } from "../src/research/evaluation/datasets.js";
import { RunArchive } from "../src/research/evidence/export.js";
import { type CandidateArtifact, CandidateRegistry, candidatePrompt } from "../src/research/experiments/candidates.js";
import { ComparisonService } from "../src/research/experiments/comparison.js";
import { MLflowProjection } from "../src/research/experiments/mlflow.js";
import { ExperimentRepository } from "../src/research/experiments/repository.js";
import { recordMeasurement } from "../src/research/metrics/record.js";
import { MetricRepository } from "../src/research/metrics/repository.js";
import { Vault } from "../src/vault.js";
import { capability } from "../tests/fixtures/research/manifest.js";
import { runFrameworkChild } from "./lib/research-framework-child.js";
import { childFixtureEnvironment, createOwnedFixture } from "./test-architecture-offline.js";

export async function optimizeOfflineFixture() {
  const manifestPath = resolve("evals/pact/datasets/manifest.json"),
    dataset = await loadDataset(manifestPath, "optimizer");
  const fixture = await createOwnedFixture();
  Object.assign(process.env, childFixtureEnvironment(fixture, process.env));
  try {
    const { withEvaluationFixture } = await import("../tests/fixtures/research/evaluation.js");
    const candidates = ["reference"];
    return await withEvaluationFixture(
      dataset,
      async (r) => {
        const candidate: CandidateArtifact = await runFrameworkChild(
          r,
          { manifestPath, config: { seed: 42, maxCalls: 16, maxDemos: 2 } },
          "python",
        );
        const { status, capabilityDigest, ...base } = r.f.manifest;
        const registry = new CandidateRegistry(
          r.inspection,
          r.f.capture,
          r.principal,
          base,
          { ...capability, model: { ...capability.model, route: "ollama", model: "fake-model" } },
          dataset,
        );
        const candidateId = await registry.propose(candidate);
        candidates.push(candidateId);
        const development = [];
        for (let offset = 0; offset < dataset.development.length; offset += 3) {
          const cases = dataset.development.slice(offset, offset + 3);
          const batch = await r.additional(dataset, 3, (next: any) =>
            runFrameworkChild(next, {
              manifestPath,
              split: "development",
              candidates: [candidateId],
              candidatePrompt: candidatePrompt(candidate),
              caseIds: cases.map((c) => c.id),
            }),
          );
          development.push(...batch.results);
        }
        // Only after candidate export and development validation: independent heldout host.
        const heldout = await loadDataset(manifestPath, "evaluator", "heldout");
        await registry.beginHeldout(candidateId, heldout.manifest.splitDigests.heldout);
        const planned = [];
        for (const id of candidates) {
          const prepared = await r.prepare(heldout, 2, "heldout", true);
          planned.push({ id, prepared });
        }
        const metrics = new MetricRepository(r.inspection, r.f.capture, r.principal),
          experiments = new ExperimentRepository(metrics),
          experimentId = randomUUID();
        await experiments.create({
          schemaVersion: "fleet.experiment/v1",
          id: experimentId,
          assignmentUnit: "world",
          baseline: "reference",
          primaryMetric: "first_pass_accuracy.v1",
          secondaryMetrics: ["calls.v1"],
          margin: 0,
          window: { start: r.f.now().toISOString(), end: new Date(r.f.now().getTime() + 1).toISOString() },
          horizonMs: 1,
          seed: 42,
          paired: false,
          stoppingRule: "fixed-horizon",
          missingness: "report-and-block-inference",
          splitDigests: dataset.manifest.splitDigests,
          units: planned.map((p) => ({
            id: p.id,
            arm: p.id,
            worldId: p.prepared.manifest.environment.worldIncarnation,
            sessionId: p.id,
            cohortId: p.prepared.cohortId,
            runIds: [p.prepared.scope.runId],
            manifestDigest: p.prepared.scope.manifestDigest,
            limits: p.prepared.manifest.limits,
          })),
        });
        const heldoutResults: { candidateId: string; caseId: string; allocationId: string; resultRef: string }[] = [],
          snapshotIds = [];
        for (const phase of planned) {
          await phase.prepared.execute(async (next: any) => {
            const batch = await runFrameworkChild(next, {
              manifestPath,
              split: "heldout",
              candidates: [phase.id],
              ...(phase.id !== "reference" ? { candidatePrompt: candidatePrompt(candidate) } : {}),
              caseIds: heldout.heldout!.map((c) => c.id),
            });
            heldoutResults.push(...batch.results);
            await recordMeasurement(next.f.capture, next.scope, {
              id: "first_pass_accuracy.v1",
              at: next.f.now().toISOString(),
              value: null,
              numerator: batch.successes,
              denominator: batch.results.length,
              status: "complete",
              sourceRefs: batch.results.map((x: any) => x.resultRef),
            });
          });
          const next = r.runtimes.at(-1);
          snapshotIds.push((await next.inspection.snapshot(next.scope.runId, next.principal)).id);
        }
        const heldoutResultId = await registry.recordHeldout(candidateId, heldout, heldoutResults);
        const assessment = await registry.assess(candidateId, heldoutResultId);
        const study = await experiments.snapshot(experimentId, snapshotIds),
          comparison = await new ComparisonService(experiments).compare(study.id);
        const directory = resolve(".state/research/offline", randomUUID());
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const trackingCalls: any[] = [];
        const projection = new MLflowProjection(experiments, {
          sync: async (snapshot) => {
            const result = await runFrameworkChild(
              {},
              { mode: "tracking", directory: join(directory, "mlflow"), snapshot },
              "python",
            );
            trackingCalls.push(result);
            return result;
          },
        });
        const first = await projection.sync(study),
          second = await projection.sync(study);
        if (
          first.status !== "synced" ||
          second.status !== "synced" ||
          trackingCalls[0].runId !== trackingCalls[1].runId
        )
          throw Error("TRACKING_RESYNC_FAILED");
        const outage = await new MLflowProjection(experiments, {
          sync: async () => {
            throw Error("synthetic outage");
          },
        }).sync(study);
        if (outage.status !== "unavailable" || (await experiments.retained(study.id)).digest !== study.digest)
          throw Error("TRACKING_AUTHORITY_LOST");
        const key = randomBytes(32);
        await writeFile(join(directory, "archive.key"), key, { mode: 0o600 });
        await writeFile(
          join(directory, "optimization.enc"),
          new Vault(key.toString("base64")).encrypt(
            { candidate, candidateId, study, comparison, assessment },
            `offline-optimization:${candidateId}`,
          ),
          { mode: 0o600 },
        );
        const archives = [];
        for (const next of r.runtimes) {
          const snapshot = await next.inspection.snapshot(next.scope.runId, next.principal),
            parts = [];
          for await (const part of new RunArchive(next.inspection, key).export(snapshot, next.principal))
            parts.push(Buffer.from(part));
          const file = `${randomUUID()}.fleet`;
          await writeFile(join(directory, file), Buffer.concat(parts), { mode: 0o600 });
          archives.push({ id: snapshot.id, file, digest: digest(snapshot) });
        }
        const allocations = (await r.f.pool.query("SELECT id,status FROM compute_ledger")).rows;
        const expected = candidate.lineage.calls + development.length + heldoutResults.length;
        if (
          allocations.length !== expected ||
          allocations.some((a: any) => a.status !== "reported") ||
          candidate.lineage.calls + development.length > 16
        )
          throw Error("OPTIMIZATION_ALLOCATION_MISMATCH");
        const report = {
          version: "fleet.optimization-report/v1",
          mode: "offline",
          seed: 42,
          datasetDigest: digest(dataset.manifest),
          candidateId,
          candidateDigest: candidate.digest,
          demonstrations: candidate.content.demonstrations.length,
          teacherCalls: candidate.lineage.calls,
          development: { passed: development.filter((x) => x.pass).length, total: development.length },
          heldout: {
            baseline: assessment.baseline,
            candidate: assessment.candidate,
            delta: assessment.delta,
            conclusion: assessment.conclusion,
            promoted: false,
            independentUnits: 1,
          },
          allocations: allocations.length,
          externalCalls: 0,
          experiment: {
            id: experimentId,
            snapshotId: study.id,
            digest: study.digest,
            flags: comparison.flags,
            winner: comparison.winner,
          },
          mlflow: { status: first.status, idempotent: true, outage: outage.status },
          archives,
          qualification:
            "Synthetic recorded providers only; not model quality, gameplay acceptance or production isolation qualification",
        };
        await writeFile(join(directory, "summary.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
        return report;
      },
      { split: "train-development", maxCalls: 3, totalCalls: 16, candidates },
    );
  } finally {
    await fixture.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.slice(2).join(" ") !== "--fixture") throw Error("OFFLINE_FIXTURE_REQUIRED");
  optimizeOfflineFixture()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch(() => {
      console.error("OFFLINE_OPTIMIZATION_FAILED; only owned synthetic fixtures are supported.");
      process.exitCode = 1;
    });
}
