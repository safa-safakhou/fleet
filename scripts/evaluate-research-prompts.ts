import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { JSON_SCHEMA, load } from "js-yaml";
import { z } from "zod";
import { digest } from "../src/research/contracts.js";
import { loadDataset } from "../src/research/evaluation/datasets.js";
import { RunArchive } from "../src/research/evidence/export.js";
import { ComparisonService } from "../src/research/experiments/comparison.js";
import { ExperimentRepository } from "../src/research/experiments/repository.js";
import { recordMeasurement } from "../src/research/metrics/record.js";
import { MetricRepository } from "../src/research/metrics/repository.js";
import { Vault } from "../src/vault.js";
import { runFrameworkChild } from "./lib/research-framework-child.js";
import { childFixtureEnvironment, createOwnedFixture } from "./test-architecture-offline.js";
export const PromptSuiteConfig = z
  .object({
    schemaVersion: z.literal("fleet.prompt-suite/v1"),
    mode: z.literal("offline"),
    provider: z.literal("fleet-owned@1"),
    datasetManifest: z.string(),
    split: z.literal("development"),
    candidates: z
      .array(z.enum(["reference", "corrupt"]))
      .min(1)
      .max(2),
    maxCalls: z.number().int().min(1).max(16),
    promptfooVersion: z.literal("0.125.1"),
    cache: z.literal(false),
    sharing: z.literal(false),
    writeLatestResults: z.literal(false),
  })
  .strict();
export async function runPromptSuite(raw: unknown) {
  const config = PromptSuiteConfig.parse(raw),
    manifestPath = resolve(config.datasetManifest),
    dataset = await loadDataset(manifestPath, "evaluator");
  if (config.candidates.length * dataset.development.length > config.maxCalls) throw Error("EVALUATION_CALL_CAP");
  const fixture = await createOwnedFixture();
  Object.assign(process.env, childFixtureEnvironment(fixture, process.env));
  try {
    const { withEvaluationFixture } = await import("../tests/fixtures/research/evaluation.js");
    return await withEvaluationFixture(
      dataset,
      async (runtime) => {
        const results: any[] = [],
          batches: any[] = [];
        for (const candidate of config.candidates)
          for (let offset = 0; offset < dataset.development.length; offset += 3) {
            const cases = dataset.development.slice(offset, offset + 3),
              prepared = batches.length ? await runtime.prepare(dataset, 3, "development") : null;
            batches.push({
              candidate,
              cases,
              prepared,
              scope: prepared?.scope ?? runtime.scope,
              cohortId: prepared?.cohortId ?? runtime.f.group.id,
              manifest: prepared?.manifest ?? runtime.f.manifest,
            });
          }
        const metrics = new MetricRepository(runtime.inspection, runtime.f.capture, runtime.principal),
          experiments = new ExperimentRepository(metrics);
        const window = {
            start: runtime.f.now().toISOString(),
            end: new Date(runtime.f.now().getTime() + 1).toISOString(),
          },
          experimentId = randomUUID();
        await experiments.create({
          schemaVersion: "fleet.experiment/v1",
          id: experimentId,
          assignmentUnit: "world",
          baseline: config.candidates[0],
          primaryMetric: "first_pass_accuracy.v1",
          secondaryMetrics: ["calls.v1"],
          margin: 0,
          window,
          horizonMs: 1,
          seed: 42,
          paired: false,
          stoppingRule: "fixed-horizon",
          missingness: "report-and-block-inference",
          splitDigests: dataset.manifest.splitDigests,
          units: batches.map((b, index) => ({
            id: `batch-${index}`,
            arm: b.candidate,
            worldId: b.manifest.environment.worldIncarnation,
            sessionId: `fixture-${index}`,
            cohortId: b.cohortId,
            runIds: [b.scope.runId],
            manifestDigest: b.scope.manifestDigest,
            limits: b.manifest.limits,
          })),
        });
        for (const batch of batches) {
          const execute = async (r: any) => {
            const result = await runFrameworkChild(r, {
              manifestPath,
              split: config.split,
              candidates: [batch.candidate],
              caseIds: batch.cases.map((c: any) => c.id),
            });
            await r.f.capture.emit(
              r.scope,
              "evaluation.result",
              result,
              { purpose: "judge" },
              { required: true, stream: "promptfoo-evaluator" },
            );
            await recordMeasurement(r.f.capture, r.scope, {
              id: "first_pass_accuracy.v1",
              at: r.f.now().toISOString(),
              value: null,
              numerator: result.successes,
              denominator: result.results.length,
              status: "complete",
              sourceRefs: result.results.map((c: any) => c.resultRef),
            });
            results.push(...result.results);
          };
          if (batch.prepared) await batch.prepared.execute(execute);
          else await execute(runtime);
        }
        const published = [];
        for (const r of runtime.runtimes) published.push(await r.inspection.snapshot(r.scope.runId, r.principal));
        const experimentSnapshot = await experiments.snapshot(
            experimentId,
            published.map((s) => s.id),
          ),
          comparison = await new ComparisonService(experiments).compare(experimentSnapshot.id);
        const allocations = (
          await runtime.f.pool.query(
            "SELECT id,status,input_tokens::text,output_tokens::text FROM compute_ledger ORDER BY id",
          )
        ).rows;
        if (allocations.length !== results.length || allocations.some((a: any) => a.status !== "reported"))
          throw Error("EVALUATION_ALLOCATION_MISMATCH");
        const directory = resolve(".state/research/offline", randomUUID());
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const key = randomBytes(32);
        await writeFile(join(directory, "archive.key"), key, { mode: 0o600 });
        await writeFile(
          join(directory, "experiment.enc"),
          new Vault(key.toString("base64")).encrypt(
            { experimentSnapshot, comparison },
            `offline-study:${experimentId}`,
          ),
          { mode: 0o600 },
        );
        const archives = [];
        for (const r of runtime.runtimes) {
          const snapshot = await r.inspection.snapshot(r.scope.runId, r.principal),
            parts = [];
          for await (const part of new RunArchive(r.inspection, key).export(snapshot, r.principal))
            parts.push(Buffer.from(part));
          const name = `${randomUUID()}.fleet`;
          await writeFile(join(directory, name), Buffer.concat(parts), { mode: 0o600 });
          archives.push({ id: snapshot.id, file: name, digest: digest(snapshot) });
        }
        const report = {
          version: "fleet.prompt-suite/v1",
          mode: "offline",
          promptfooVersion: config.promptfooVersion,
          datasetId: dataset.manifest.id,
          datasetDigest: digest(dataset.manifest),
          split: config.split,
          results,
          allocations: allocations.length,
          externalCalls: 0,
          experiment: {
            id: experimentId,
            snapshotId: experimentSnapshot.id,
            digest: experimentSnapshot.digest,
            comparisonDigest: comparison.digest,
            winner: comparison.winner,
            flags: comparison.flags,
          },
          archives,
          summary: config.candidates.map((candidateId) => ({
            candidateId,
            passed: results.filter((r) => r.candidateId === candidateId && r.pass).length,
            total: results.filter((r) => r.candidateId === candidateId).length,
          })),
          qualification: "Synthetic recorded providers only; not model quality or gameplay acceptance",
        };
        await writeFile(join(directory, "summary.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
        return report;
      },
      { maxCalls: Math.min(3, dataset.development.length), totalCalls: config.maxCalls, candidates: config.candidates },
    );
  } finally {
    await fixture.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--mode" || args[1] !== "offline" || args[2] !== "--config")
    throw Error("OFFLINE_CONFIG_REQUIRED");
  runPromptSuite(load(await readFile(resolve(args[3]), "utf8"), { schema: JSON_SCHEMA }))
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch(() => {
      console.error("OFFLINE_PROMPT_SUITE_FAILED; no retained database or real provider was selected.");
      process.exitCode = 1;
    });
}
