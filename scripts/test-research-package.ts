import { writeFile } from "node:fs/promises";
import { buildQualificationImage, runLinuxFixture } from "./research-linux-fixture.js";

if (process.argv.slice(2).join(" ") !== "--fixture") throw Error("EXPLICIT_FIXTURE_REQUIRED");
const failureRoot = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
try {
  const image = await buildQualificationImage(),
    result = await runLinuxFixture(image, [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "tests/architecture.vitest.config.ts",
      "tests/acceptance/research-package.test.ts",
    ]);
  const root = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
  await writeFile(`${root}/package-linux.log`, result.stdout + result.stderr);
  await writeFile(
    `${root}/package-report.json`,
    JSON.stringify(
      {
        schemaVersion: "fleet.package-test/v1",
        scope: "owned-linux-synthetic",
        status: result.exitCode === 0 ? "passed" : "blocked",
        image,
        exitCode: result.exitCode,
        isolation: result.isolation,
        resources: result.resources,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ status: result.exitCode === 0 ? "passed" : "blocked", image, exitCode: result.exitCode }),
  );
  process.exitCode = result.exitCode;
} catch (error) {
  const code =
    (error as { code?: string }).code ??
    (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "LINUX_FIXTURE_UNAVAILABLE");
  const report = {
    schemaVersion: "fleet.package-test/v1",
    status: "blocked",
    scope: "owned-linux-synthetic",
    image: null,
    blockers: [code],
    measurements: null,
  };
  await writeFile(`${failureRoot}/package-report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  process.exitCode = 1;
}
