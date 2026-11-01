import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { connect, migrate } from "../src/db.js";
import { storageBlockers } from "../src/research/qualification/storage.js";
import { assertOwnedFixture } from "../tests/architecture-fixture.js";
import { createOwnedFixture } from "./test-architecture-offline.js";

const exec = promisify(execFile),
  ledger = ".superpowers/sdd/2026-10-30-pact-research-07-qualification";
async function docker(args: string[]) {
  return (await exec("docker", args, { maxBuffer: 32 * 1024 * 1024 })).stdout.trim();
}
async function publicSources() {
  return (
    await exec(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "Dockerfile",
        "contracts",
        "workers/research/src",
        "workers/research/tests",
        "workers/research/pyproject.toml",
        "workers/research/uv.lock",
        "workers/research/requirements.lock",
        "workers/research/Dockerfile",
        "ops/research/package.compose.yaml",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tsconfig.server.json",
        "vite.config.ts",
        "vitest.config.ts",
        "biome.json",
        "index.html",
        "src",
        "web",
        "config",
        "vendor",
        "migrations",
        "tests",
        "scripts",
        "ops/research/Dockerfile",
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    )
  ).stdout
    .split("\0")
    .filter(Boolean)
    .sort();
}
export async function publicSourceDigest() {
  const hash = createHash("sha256");
  for (const path of await publicSources())
    hash
      .update(path + "\0")
      .update(await readFile(path))
      .update("\0");
  return hash.digest("hex");
}
export async function buildQualificationImage() {
  const disk = await statfs(tmpdir());
  if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw Error("BUILD_DISK_SPACE_REQUIRED");
  // A fresh read-only container measures Docker's filesystem, not the host-mounted source tree.
  let dockerFree: unknown;
  try {
    const output = await docker([
      "run",
      "--rm",
      "--pull=never",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--user",
      "10001:10001",
      "--memory",
      "128m",
      "--pids-limit",
      "32",
      "--entrypoint",
      "node",
      "node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9",
      "-e",
      "const s=require('node:fs').statfsSync('/');console.log(JSON.stringify({freeBytes:s.bavail*s.bsize}))",
    ]);
    dockerFree = JSON.parse(output).freeBytes;
  } catch {
    throw Error("DOCKER_STORAGE_PROBE_UNAVAILABLE");
  }
  const blockers = storageBlockers(disk.bavail * disk.bsize, dockerFree);
  if (blockers.length) throw Error(blockers[0]);
  const root = await mkdtemp(join(tmpdir(), "fleet-package-build-")),
    tag = `fleet-research-qualification:${randomUUID()}`;
  try {
    const paths = await publicSources(),
      sourceDigest = await publicSourceDigest();
    for (const path of paths) {
      if (!(await lstat(path)).isFile()) throw Error("REGULAR_PUBLIC_SOURCE_REQUIRED");
      await mkdir(dirname(join(root, path)), { recursive: true });
      await cp(path, join(root, path));
    }
    try {
      await docker([
        "build",
        "--force-rm",
        "--label",
        `fleet.qualification.source=${sourceDigest}`,
        "--network",
        "default",
        "--target",
        "qualification",
        "-f",
        join(root, "ops/research/Dockerfile"),
        "-t",
        tag,
        root,
      ]);
    } catch (error) {
      await writeFile(
        `${ledger}/linux-build-failure.log`,
        String((error as { stderr?: string }).stderr ?? "Docker build failed"),
      );
      throw Error("QUALIFICATION_IMAGE_BUILD_FAILED");
    }
    const id = await docker(["image", "inspect", tag, "--format", "{{.Id}}"]);
    await writeFile(
      `${ledger}/linux-image.json`,
      JSON.stringify(
        {
          imageId: id,
          tag,
          sourceDigest,
          source: "curated public tracked/unignored files only",
          execution: "disabled; synthetic fixtures only",
        },
        null,
        2,
      ) + "\n",
    );
    return id;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
export async function runLinuxFixture(image: string, args: string[]) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error("PINNED_FIXTURE_IMAGE_REQUIRED");
  const previous = process.env.FLEET_RESEARCH_VECTOR_FIXTURE;
  process.env.FLEET_RESEARCH_VECTOR_FIXTURE = "1";
  const f = await createOwnedFixture();
  if (previous === undefined) delete process.env.FLEET_RESEARCH_VECTOR_FIXTURE;
  else process.env.FLEET_RESEARCH_VECTOR_FIXTURE = previous;
  const root = await mkdtemp(join(tmpdir(), "fleet-linux-fixture-")),
    network = `fleet-qualification-${f.nonce.slice(0, 16)}`,
    name = `fleet-qualification-${randomUUID()}`,
    label = "fleet.qualification.fixture";
  let networkCreated = false,
    container: string | undefined;
  try {
    await assertOwnedFixture(f.fleetUrl, f.nonce);
    await assertOwnedFixture(f.pactUrl, f.nonce);
    const pool = connect(f.fleetUrl);
    let versions: { postgresql: string; pgvector: string };
    try {
      await migrate(pool);
      versions = {
        postgresql: (await pool.query("SHOW server_version")).rows[0].server_version,
        pgvector: (await pool.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0].extversion,
      };
    } finally {
      await pool.end();
    }
    const db = await docker(["ps", "-q", "--filter", `label=fleet.architecture.fixture=${f.nonce}`]);
    if (!/^[a-f0-9]+$/.test(db)) throw Error("OWNED_DATABASE_REQUIRED");
    await docker(["network", "create", "--internal", "--label", `${label}=${f.nonce}`, network]);
    networkCreated = true;
    await docker(["network", "connect", "--alias", "owned-postgres", network, db]);
    const url = new URL(f.fleetUrl);
    url.hostname = "owned-postgres";
    url.port = "5432";
    const envFile = join(root, "fixture.env");
    await writeFile(
      envFile,
      [
        `FLEET_TEST_DATABASE_URL=${url.href}`,
        `FLEET_ARCHITECTURE_NONCE=${f.nonce}`,
        "FLEET_ARCHITECTURE_TEST=1",
        "FLEET_ARCHITECTURE_BASE_CONFIG=/app/vitest.config.ts",
        "FLEET_BENCHMARK_ARTIFACT_ROOT=/tmp/benchmark-artifacts",
        "HOME=/tmp",
        "LANG=C.UTF-8",
        "FLEET_PACKAGE_COMPILED_ROOT=/release",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    container = await docker([
      "create",
      "--name",
      name,
      "--label",
      `${label}=${f.nonce}`,
      "--network",
      network,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "256",
      "--memory",
      "2g",
      "--cpus",
      "2",
      "--user",
      "10001:10001",
      "--tmpfs",
      "/tmp:rw,nosuid,size=512m,uid=10001,gid=10001,mode=1777",
      "--tmpfs",
      "/app/node_modules/.vite-temp:rw,nosuid,size=32m,uid=10001,gid=10001,mode=0700",
      "--tmpfs",
      "/app/node_modules/.vite:rw,nosuid,size=64m,uid=10001,gid=10001,mode=0700",
      "--tmpfs",
      "/app/.superpowers:rw,nosuid,size=64m,uid=10001,gid=10001,mode=0700",
      "--env-file",
      envFile,
      image,
      "node",
      "scripts/research-linux-entry.mjs",
      ...args,
      ...(args[0] === "node_modules/vitest/vitest.mjs" ? ["--fsModuleCachePath", "/tmp/vitest-cache"] : []),
    ]);
    let stopped = false;
    const resources: unknown[] = [];
    const sample = (async () => {
      while (!stopped) {
        try {
          resources.push({
            at: new Date().toISOString(),
            stats: await docker(["stats", "--no-stream", "--format", "{{json .}}", db, container!]),
          });
        } catch {}
        if (!stopped) await new Promise((done) => setTimeout(done, 500));
      }
    })();
    let stdout = "",
      stderr = "",
      exitCode = 1;
    try {
      const result = await exec("docker", ["start", "-a", container], { maxBuffer: 32 * 1024 * 1024 });
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = Number(await docker(["inspect", "--format", "{{.State.ExitCode}}", container]));
    } catch (error) {
      stdout = (error as { stdout?: string }).stdout ?? "";
      stderr = (error as { stderr?: string }).stderr ?? "";
    } finally {
      stopped = true;
      await sample;
    }
    return {
      exitCode,
      versions,
      stdout,
      stderr,
      resources,
      isolation: {
        image,
        user: "10001:10001",
        network: "owned internal database only",
        readOnlyRoot: true,
        cpus: 2,
        ramBytes: 2147483648,
        tmpfsBytes: 536870912,
      },
    };
  } finally {
    if (
      container &&
      (await docker(["inspect", "--format", `{{ index .Config.Labels "${label}" }}`, container])) === f.nonce
    )
      await docker(["rm", "-f", "-v", container]);
    await f.close();
    if (
      networkCreated &&
      (await docker(["network", "inspect", "--format", `{{ index .Labels "${label}" }}`, network])) === f.nonce
    )
      await docker(["network", "rm", network]);
    await rm(root, { recursive: true, force: true });
  }
}
export async function qualificationImage() {
  try {
    const value = JSON.parse(await readFile(`${ledger}/linux-image.json`, "utf8"));
    if (/^sha256:[a-f0-9]{64}$/.test(value.imageId) && value.sourceDigest === (await publicSourceDigest())) {
      await docker(["image", "inspect", value.imageId, "--format", "{{.Id}}"]);
      return value.imageId as string;
    }
  } catch {}
  return buildQualificationImage();
}
