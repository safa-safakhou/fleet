import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { digest } from "../src/research/contracts.js";

if (process.argv.slice(2).join(" ") !== "--fixture") throw Error("EXPLICIT_FIXTURE_REQUIRED");
const tests = [
  "tests/integration/research-distributed-faults.test.ts",
  "tests/integration/research-runtime-recovery.test.ts",
  "tests/integration/research-temporal.test.ts",
  "tests/integration/research-retention.test.ts",
  "tests/integration/research-memory-retention-lineage.test.ts",
  "tests/integration/research-telemetry.test.ts",
  "tests/integration/research-eval-isolation.test.ts",
  "tests/integration/research-worker-rpc.test.ts",
];
const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/test-architecture-offline.ts", ...tests], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: "C.UTF-8" },
});
const output = (result.stdout ?? "") + (result.stderr ?? "");
const root = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
await writeFile(`${root}/fault-tests.log`, output);
const report = {
  schemaVersion: "fleet.fault-qualification/v1",
  scope: "owned-synthetic",
  status: result.status === 0 ? "passed" : "blocked",
  tests,
  exitCode: result.status,
  outputDigest: digest(output),
  limits: [
    "Deterministic failure boundaries and real local Temporal replay/restart; not a distributed network partition or production chaos certification.",
    "Database transaction abort is exercised; whole PostgreSQL host power loss remains outside this fixture.",
  ],
};
await writeFile(`${root}/fault-report.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
process.exitCode = result.status ?? 1;
