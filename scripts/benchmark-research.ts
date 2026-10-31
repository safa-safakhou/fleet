import { writeFile } from "node:fs/promises";
import { qualificationImage, runLinuxFixture } from "./research-linux-fixture.js";

if (process.argv.slice(2).join(" ") !== "--fixture") throw Error("EXPLICIT_FIXTURE_REQUIRED");
const failureRoot = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
try {
  const image = await qualificationImage(),
    result = await runLinuxFixture(image, ["scripts/benchmark-research-samples.mjs"]),
    root = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
  await writeFile(`${root}/benchmark-linux.log`, result.stdout + result.stderr);
  const line = result.stdout.split("\n").find((x) => x.startsWith('{"kind":"benchmark_report"'));
  if (result.exitCode !== 0 || !line) throw Error("BENCHMARK_FIXTURE_FAILED");
  const { report } = JSON.parse(line);
  const full = { ...report, image, isolation: result.isolation, resources: result.resources };
  await writeFile(`${root}/benchmark-report.json`, JSON.stringify(full, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: report.status,
      latencyOverhead: report.latencyOverhead,
      rssOverhead: report.rssOverhead,
      blockers: report.blockers,
    }),
  );
  process.exitCode = report.status === "passed" ? 0 : 1;
} catch (error) {
  const code =
    (error as { code?: string }).code ??
    (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "LINUX_FIXTURE_UNAVAILABLE");
  const report = {
    schemaVersion: "fleet.benchmark-test/v1",
    status: "blocked",
    scope: "owned-linux-synthetic",
    image: null,
    blockers: [code],
    measurements: null,
  };
  await writeFile(`${failureRoot}/benchmark-report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  process.exitCode = 1;
}
