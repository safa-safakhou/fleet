import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const exec = promisify(execFile);
const retainedPorts = new Set([5432, 5436, 5437, 5438, 5439, 5451, 5452]);
export function assertFixtureUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error("OWNED_FIXTURE_REQUIRED");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    !["/fleet_test", "/pact_test"].includes(url.pathname) ||
    !url.port ||
    Number(url.port) < 1024 ||
    retainedPorts.has(Number(url.port)) ||
    url.search ||
    url.hash
  ) {
    throw Error("OWNED_FIXTURE_REQUIRED");
  }
  return url;
}
export interface OwnedFixture {
  fleetUrl: string;
  pactUrl: string;
  nonce: string;
  close(): Promise<void>;
}
interface FixtureRuntime {
  start(nonce: string, password: string): Promise<string>;
  port(id: string): Promise<number>;
  owner(id: string): Promise<string>;
  initialize(url: string, nonce: string): Promise<void>;
  stop(id: string): Promise<void>;
}

async function docker(args: string[]) {
  const { stdout } = await exec("docker", args, { maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
const runtime: FixtureRuntime = {
  async start(nonce, password) {
    const directory = await mkdtemp(resolve(tmpdir(), "fleet-architecture-"));
    const envFile = resolve(directory, "postgres.env");
    try {
      await writeFile(envFile, `POSTGRES_USER=architecture_fixture\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
      return await docker([
        "run",
        "--pull=never",
        "-d",
        "--label",
        `fleet.architecture.fixture=${nonce}`,
        "--env-file",
        envFile,
        "-p",
        "127.0.0.1::5432",
        "postgres:17-alpine",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  async port(id) {
    const output = await docker(["port", id, "5432/tcp"]);
    if (!/^127\.0\.0\.1:\d+$/.test(output)) throw Error("OWNED_FIXTURE_PORT_REQUIRED");
    return Number(output.split(":")[1]);
  },
  owner: (id) => docker(["inspect", "--format", '{{ index .Config.Labels "fleet.architecture.fixture" }}', id]),
  async initialize(url, nonce) {
    const database = new URL(url).pathname.slice(1);
    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    const admin = new pg.Pool({ connectionString: adminUrl.href, connectionTimeoutMillis: 500 });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await admin.query("SELECT 1");
          ready = true;
          break;
        } catch {
          await new Promise((done) => setTimeout(done, 100));
        }
      }
      if (!ready) throw Error("OWNED_POSTGRES_NOT_READY");
      // Names have already passed assertFixtureUrl; no arbitrary identifiers.
      await admin.query(`CREATE DATABASE ${database}`);
    } finally {
      await admin.end();
    }
    const pool = new pg.Pool({ connectionString: url });
    try {
      await pool.query("CREATE TABLE public.architecture_fixture_owner(nonce text PRIMARY KEY)");
      await pool.query("INSERT INTO public.architecture_fixture_owner VALUES($1)", [nonce]);
    } finally {
      await pool.end();
    }
  },
  async stop(id) {
    await docker(["rm", "-f", "-v", id]);
  },
};

export async function createOwnedFixture(
  driver: FixtureRuntime = runtime,
  signal?: AbortSignal,
): Promise<OwnedFixture> {
  const active = () => {
    if (signal?.aborted) throw Error("FIXTURE_INTERRUPTED");
  };
  active();
  const nonce = randomBytes(32).toString("hex"),
    password = randomBytes(32).toString("hex");
  const id = await driver.start(nonce, password);
  let closed = false;
  const close = async () => {
    if (closed) return;
    if ((await driver.owner(id)) !== nonce) throw Error("FIXTURE_CLEANUP_OWNERSHIP_MISMATCH");
    await driver.stop(id);
    closed = true;
  };
  try {
    active();
    const port = await driver.port(id);
    const fleetUrl = `postgres://architecture_fixture:${password}@127.0.0.1:${port}/fleet_test`;
    const pactUrl = `postgres://architecture_fixture:${password}@127.0.0.1:${port}/pact_test`;
    assertFixtureUrl(fleetUrl);
    assertFixtureUrl(pactUrl);
    active();
    await driver.initialize(fleetUrl, nonce);
    active();
    await driver.initialize(pactUrl, nonce);
    active();
    return { fleetUrl, pactUrl, nonce, close };
  } catch (error) {
    // Refusing to clean a foreign target must not replace the original failure.
    try {
      await close();
    } catch {
      /* leave a mismatched container untouched */
    }
    throw error;
  }
}

export function childFixtureEnvironment(
  fixture: Pick<OwnedFixture, "fleetUrl" | "pactUrl" | "nonce">,
  parent: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "HOME", "TMPDIR", "LANG", "CI", "NO_COLOR", "FORCE_COLOR", "FLEET_OFFLINE_SCHEMAS"]) {
    if (parent[name] !== undefined) env[name] = parent[name];
  }
  return {
    ...env,
    FLEET_TEST_DATABASE_URL: fixture.fleetUrl,
    TEST_DATABASE_URL: fixture.pactUrl,
    PACT_ACCEPTANCE_DATABASE_URL: fixture.pactUrl,
    FLEET_ARCHITECTURE_TEST: "1",
    FLEET_ARCHITECTURE_NONCE: fixture.nonce,
  };
}

async function main(argv: string[]) {
  const fleetRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let repo = "fleet",
    suite = "",
    paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--repo") repo = argv[++i] ?? "";
    else if (value === "--suite") suite = argv[++i] ?? "";
    else if (value !== "--") paths.push(value);
  }
  if (
    !["fleet", "pact"].includes(repo) ||
    (suite && !["unit", "integration", "acceptance"].includes(suite)) ||
    paths.some((p) => p.startsWith("-") || p.startsWith("/") || p.split(/[\\/]/).includes(".."))
  ) {
    throw Error("EXPLICIT_ARCHITECTURE_TEST_SELECTION_REQUIRED");
  }
  const root = repo === "fleet" ? fleetRoot : resolve(fleetRoot, "../pact");
  await readFile(resolve(root, "package.json"));
  const groups =
    repo === "pact"
      ? ["unit", "integration"].map((kind) => ({
          config: kind === "unit" ? "vitest.config.ts" : "vitest.integration.config.ts",
          paths: paths.filter((p) => /^(tests\/integration|tests\/smoke)\//.test(p) === (kind === "integration")),
          selected: suite
            ? suite === kind
            : !paths.length
              ? kind === "unit"
              : paths.some((p) => /^(tests\/integration|tests\/smoke)\//.test(p) === (kind === "integration")),
        }))
      : [{ config: "vitest.config.ts", paths: paths.length ? paths : [`tests/${suite || "unit"}`], selected: true }];
  if (!groups.some((g) => g.selected)) throw Error("UNSUPPORTED_ARCHITECTURE_SUITE");
  let fixture: OwnedFixture | undefined;
  const cancellation = new AbortController();
  let child: ReturnType<typeof spawn> | undefined;
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    cancellation.abort();
    child?.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    fixture = await createOwnedFixture(runtime, cancellation.signal);
    const env = {
      ...childFixtureEnvironment(fixture, process.env),
      PACT_ACCEPTANCE_ROOT: resolve(fleetRoot, "../pact"),
      FLEET_ARCHITECTURE_BASE_CONFIG: "",
    };
    const { assertOwnedFixture } = await import("../tests/architecture-fixture.js");
    await assertOwnedFixture(fixture.fleetUrl, fixture.nonce);
    await assertOwnedFixture(fixture.pactUrl, fixture.nonce);
    for (const group of groups.filter((g) => g.selected)) {
      if (interrupted) return 1;
      env.FLEET_ARCHITECTURE_BASE_CONFIG = resolve(root, group.config);
      const args = [
        resolve(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        resolve(fleetRoot, "tests/architecture.vitest.config.ts"),
        "--maxWorkers=1",
        "--fileParallelism=false",
        ...group.paths,
      ];
      child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit" });
      const code = await new Promise<number>((done, fail) => {
        child?.once("error", fail);
        child?.once("exit", (code) => done(code ?? 1));
      });
      if (code !== 0) return code;
    }
    return 0;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await fixture?.close();
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error("Architecture fixture/test execution failed; no retained database was selected.");
      process.exitCode = 1;
    });
}
