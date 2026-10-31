import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { digest } from "../src/research/contracts.js";
import { compileManifest } from "../src/research/manifests/compiler.js";
import { assembleQualification, type QualificationGateResult } from "../src/research/qualification/bundle.js";
import { ConfigurationMatrix, highRiskTriples, matrixDimensions } from "../src/research/qualification/matrix.js";
import { type QualificationEvidence, requiredGates } from "../src/research/qualification/policy.js";
import { capability, manifestInput } from "../tests/fixtures/research/manifest.js";
import { publicSourceDigest, qualificationImage, runLinuxFixture } from "./research-linux-fixture.js";

const args = process.argv.slice(2),
  root = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
if (args.length !== 1 || !["--matrix", "--fixture"].includes(args[0]))
  throw Error("EXPLICIT_QUALIFICATION_SCOPE_REQUIRED");
const matrix = {
  schemaVersion: "fleet.configuration-matrix/v1",
  scope: "fixture-design",
  seed: 20261030,
  dimensions: matrixDimensions,
  mandatoryTriples: highRiskTriples,
  limits: [
    "Pairwise axes plus four required risk scenarios; not exhaustive higher-order coverage.",
    "Generated cases are test obligations, not execution evidence or qualification.",
  ],
  cases: new ConfigurationMatrix().generate({ runtimes: ["ts", "python"], owners: ["platform", "temporal"] }),
};
if (args[0] === "--matrix") {
  await writeFile("tests/fixtures/research/config-matrix.json", JSON.stringify(matrix, null, 2) + "\n");
  const formatted = spawnSync(
    process.execPath,
    ["node_modules/@biomejs/biome/bin/biome", "format", "--write", "tests/fixtures/research/config-matrix.json"],
    { encoding: "utf8" },
  );
  if (formatted.status !== 0) throw Error("MATRIX_FORMAT_FAILED");
} else if (digest(JSON.parse(await readFile("tests/fixtures/research/config-matrix.json", "utf8"))) !== digest(matrix))
  throw Error("CONFIGURATION_MATRIX_DRIFT");
if (args[0] === "--matrix")
  console.log(
    JSON.stringify({
      kind: "matrix",
      cases: matrix.cases.length,
      excluded: matrix.cases.filter((x) => x.status === "excluded").length,
      blocking: matrix.cases.filter((x) => x.status === "blocking").length,
    }),
  );
else {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = {};
  for (const k of ["PATH", "HOME", "TMPDIR", "LANG", "CI"]) if (process.env[k]) env[k] = process.env[k];
  const runs: { id: string; command: string[]; exitCode: number | null; digest: string; executed?: boolean }[] = [];
  const disk = await statfs(tmpdir()),
    infrastructureReady = disk.bavail * disk.bsize >= 8 * 1024 ** 3;
  const needsInfrastructure = new Set([
    "properties",
    "worker-isolation",
    "faults",
    "preservation",
    "native",
    "package",
    "benchmark",
    "architecture",
  ]);
  function run(id: string, command: string[], extra: NodeJS.ProcessEnv = {}) {
    console.log(JSON.stringify({ kind: "qualification_gate_started", id }));
    if (!infrastructureReady && needsInfrastructure.has(id)) {
      const output =
        "NOT_RUN: BUILD_DISK_SPACE_REQUIRED; source qualification requires8GiB free before disposable Linux builds. Existing services are preserved.\n";
      const result = { id, command, exitCode: null, digest: digest(output), executed: false };
      runs.push(result);
      return writeFile(`${root}/qualify-${id}.log`, output).then(() => {
        console.log(
          JSON.stringify({ kind: "qualification_gate_unavailable", id, reason: "BUILD_DISK_SPACE_REQUIRED" }),
        );
        return result;
      });
    }
    const r = spawnSync(command[0], command.slice(1), {
      env: { ...env, ...extra },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const output = (r.stdout ?? "") + (r.stderr ?? "");
    const result = { id, command, exitCode: r.status, digest: digest(output), executed: true };
    runs.push(result);
    return writeFile(`${root}/qualify-${id}.log`, output).then(() => {
      console.log(JSON.stringify({ kind: "qualification_gate_finished", id, exitCode: r.status }));
      return result;
    });
  }
  await run("units", ["npm", "test"]);
  await run("contracts", ["npm", "run", "research:contracts:check"]);
  await run("check", ["npm", "run", "check"]);
  await run("boundaries", ["npm", "run", "check:boundaries"]);
  await run("build", ["npm", "run", "build"]);
  await run("properties", ["npm", "run", "test:properties", "--", "--release", "--seed", "20261030"]);
  await run("python", [
    "uv",
    "run",
    "--project",
    "workers/research",
    "--group",
    "dev",
    "--extra",
    "optimization",
    "pytest",
    "workers/research/tests",
    "-q",
  ]);
  const workerImage = JSON.parse(await readFile("docs/research/worker-image.json", "utf8"));
  if (!/^sha256:[a-f0-9]{64}$/.test(workerImage.isolationTestImageId)) throw Error("PINNED_WORKER_PROBE_REQUIRED");
  await run("worker-isolation", [
    "docker",
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--user",
    "10001:10001",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=32m,uid=10001,gid=10001",
    "-e",
    "FLEET_ISOLATION_PROBE=1",
    workerImage.isolationTestImageId,
  ]);
  await run("faults", ["npm", "run", "test:research-faults"]);
  await run("preservation", ["npm", "run", "test:research-migration"]);
  await run(
    "native",
    [
      "npm",
      "run",
      "test:architecture",
      "--",
      "tests/acceptance/research-engine.test.ts",
      "tests/acceptance/pact.test.ts",
      "tests/integration/research-qualification.test.ts",
      "tests/integration/research-recipes-runtime.test.ts",
      "tests/integration/research-context-lineage.test.ts",
      "tests/integration/research-retrieval.test.ts",
      "tests/integration/research-metric-coverage.test.ts",
      "tests/integration/research-experiments.test.ts",
      "tests/integration/architecture-maintenance.test.ts",
    ],
    { FLEET_RESEARCH_VECTOR_FIXTURE: "1" },
  );
  await run("browser", ["npm", "run", "test:research-ui"], { FLEET_RESEARCH_UI_OUTPUT: `${root}/browser` });
  await run("package", ["npm", "run", "test:research-package", "--", "--fixture"]);
  await run("benchmark", ["npm", "run", "benchmark:research", "--", "--fixture"]);
  await run("architecture", ["npm", "run", "test:architecture"]);
  await run("audit", ["npm", "audit", "--json"]);
  let image: string | null = null,
    linux: Awaited<ReturnType<typeof runLinuxFixture>> | null = null;
  let linuxOutput = "LINUX_FIXTURE_UNAVAILABLE";
  try {
    if (!infrastructureReady) throw Error("BUILD_DISK_SPACE_REQUIRED");
    image = await qualificationImage();
    linux = await runLinuxFixture(image, [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "tests/architecture.vitest.config.ts",
      "tests/unit/research-qualification.test.ts",
      "tests/unit/research-qualification-bundle.test.ts",
      "tests/unit/research-source-expiry.test.ts",
      "tests/unit/codex.test.ts",
      "tests/unit/owned-local-world.test.ts",
    ]);
    linuxOutput = linux.stdout + linux.stderr;
  } catch (error) {
    linuxOutput =
      error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "LINUX_FIXTURE_UNAVAILABLE";
  }
  await writeFile(`${root}/qualify-linux-units.log`, linuxOutput);
  runs.push({
    id: "linux-units",
    command: ["owned-linux-fixture", "vitest", "affected qualification/expiry units and Linux-only process fixtures"],
    exitCode: linux?.exitCode ?? null,
    executed: linux !== null,
    digest: digest(linuxOutput),
  });
  const map: Record<string, string[]> = {
    contracts: ["contracts", "check", "boundaries", "build", "audit"],
    invariants: ["units", "properties", "architecture", "linux-units"],
    privacy: ["faults", "native", "worker-isolation"],
    accounting: ["faults", "native"],
    ownership: ["faults"],
    faults: ["faults"],
    preservation: ["preservation"],
    wire: ["python", "faults", "worker-isolation"],
    metrics: ["native", "units"],
    visualization: ["browser"],
    performance: ["benchmark"],
    package: ["package"],
  };
  const sourceDigest = await publicSourceDigest(),
    lockDigest = createHash("sha256")
      .update(await readFile("package-lock.json"))
      .digest("hex"),
    input = manifestInput();
  input.build = {
    source: sourceDigest,
    build: image?.slice(7) ?? digest({ build: "unavailable", sourceDigest }),
    dependencies: lockDigest,
  };
  input.seed = "20261030";
  const compiled = compileManifest(input, capability),
    issued = new Date(),
    dependencies = {
      node: process.versions.node,
      npm: "12.2.1",
      postgresql: linux?.versions.postgresql.split(" ")[0] ?? "17.11",
      pgvector: linux?.versions.pgvector ?? "0.8.7",
      wire: "1",
    };
  const gates: QualificationGateResult[] = requiredGates.map((name) => {
    const selected = map[name].map((id) => runs.find((x) => x.id === id));
    const pass = selected.every((x) => x?.exitCode === 0);
    return {
      scope: "fixture",
      target: `owned-source-suite:${image?.slice(7) ?? "unavailable"}`,
      manifestDigest: compiled.digest,
      capabilityDigest: digest(capability),
      dependenciesDigest: digest(dependencies),
      name,
      status: pass ? "pass" : "fail",
      exitCode: pass ? 0 : 1,
      evidenceDigest: digest(selected),
    };
  });
  const evidence: QualificationEvidence = {
    scope: "fixture",
    manifest: compiled.manifest,
    capability,
    testedManifestDigest: compiled.digest,
    testedCapabilityDigest: digest(capability),
    dependencies,
    testedDependenciesDigest: digest(dependencies),
    issuedAt: issued.toISOString(),
    expiresAt: new Date(issued.getTime() + 86400000).toISOString(),
    data: { status: linux ? "complete" : "unavailable", expected: String(runs.length), recorded: String(runs.length) },
    gates: {},
    attestation: {
      scope: "fixture",
      target: `owned-source-suite:${image?.slice(7) ?? "unavailable"}`,
      provider: "fake",
      dataset: "synthetic@1",
      independentUnits: 0,
    },
  };
  const decision = assembleQualification(evidence, gates);
  const report = {
    schemaVersion: "fleet.qualification-bundle/v1",
    decision,
    manifest: compiled.manifest,
    capability,
    dependencies,
    sourceDigest,
    lockDigest,
    image,
    matrix,
    runs,
    gates,
    linuxIsolation: linux?.isolation ?? null,
    actualLinuxVersions: linux?.versions ?? null,
    buildAvailability: image ? "image" : "unavailable-marker",
    limits: [
      "Fixture-only test-suite qualification. No real provider accuracy, strategic effectiveness, installation or deployment acceptance.",
      "Pairwise axes plus named fault scenarios are not exhaustive combinations.",
      "Actual skipped and failed tests remain in linked logs. Performance blockers prevent qualification.",
      "Read-only compiled package; activation remains a separate explicit operational assignment.",
    ],
  };
  await writeFile(`${root}/qualification-bundle.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: decision.status,
      scope: decision.scope,
      reasons: decision.reasons,
      manifestDigest: decision.manifestDigest,
      activationAuthorized: false,
    }),
  );
  process.exitCode = decision.status === "qualified" ? 0 : 1;
}
