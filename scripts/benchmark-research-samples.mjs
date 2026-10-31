import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { assessBenchmark } from "../dist/server/research/qualification/benchmark.js";

const repetitions = [];
const root = process.env.FLEET_BENCHMARK_ARTIFACT_ROOT;
for (let i = -1; i < 5; i++) {
  const pair = { repetition: i, warmup: i === -1 };
  for (const mode of i % 2 === 0 ? ["enabled", "disabled"] : ["disabled", "enabled"]) {
    const directory = `${root}/${i}-${mode}`;
    await mkdir(directory, { recursive: true });
    const child = spawnSync(process.execPath, ["scripts/benchmark-research-worker.mjs", mode], {
      encoding: "utf8",
      env: { ...process.env, FLEET_BENCHMARK_ARTIFACT_ROOT: directory },
      maxBuffer: 1024 * 1024,
    });
    if (child.status !== 0) {
      process.stderr.write(child.stderr);
      process.exit(1);
    }
    pair[mode] = JSON.parse(child.stdout);
    process.stdout.write(
      JSON.stringify({ kind: "benchmark_sample", ...pair[mode], repetition: i, warmup: i === -1 }) + "\n",
    );
  }
  repetitions.push(pair);
}
const assessment = assessBenchmark(repetitions);
const report = {
  schemaVersion: "fleet.benchmark/v1",
  scope: "owned-linux-synthetic-recording-boundary",
  ...assessment,
  aggregation:
    "Mean of five per-repetition p95 service latencies; maximum process peak RSS across five repetitions. Both modes warmed once; alternating recorded order.",
  repetitions,
  limits: [
    "No native admission/scheduler/Temporal or optional OTel backend throughput qualification. Active host+PostgreSQL container resource samples are recorded separately.",
  ],
};
console.log(JSON.stringify({ kind: "benchmark_report", report }));
// Performance blockers are report data; the outer runner propagates a failed acceptance exit.
