import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { validateOwnedDatabaseTarget } from "./lib/negotiation-artifacts.js";

const imageId = "sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537",
  exec = promisify(execFile);
export interface OwnedBootstrapDriver {
  image(): Promise<string>;
  start(directory: string, nonce: string, password: string): Promise<{ containerId: string; port: number }>;
  owner(containerId: string, nonce: string): Promise<string>;
  initialize(url: string, nonce: string): Promise<void>;
}
const docker = async (args: string[]) => (await exec("docker", args, { maxBuffer: 1000000 })).stdout.trim();
const driver: OwnedBootstrapDriver = {
  image: () => docker(["image", "inspect", "--format", "{{.Id}}", "postgres:17-alpine"]),
  start: async (directory, nonce, password) => {
    const envFile = join(directory, "postgres.env"),
      volume = `pact-negotiation-${nonce}`;
    await writeFile(envFile, `POSTGRES_USER=architecture_fixture\nPOSTGRES_PASSWORD=${password}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await docker(["volume", "create", "--label", `pact.negotiation.owned=${nonce}`, volume]);
    if (
      (await docker(["volume", "inspect", "--format", '{{ index .Labels "pact.negotiation.owned" }}', volume])) !==
      nonce
    )
      throw Error("OWNED_DATABASE_VOLUME");
    const containerId = await docker([
      "run",
      "--pull=never",
      "-d",
      "--label",
      `pact.negotiation.owned=${nonce}`,
      "--env-file",
      envFile,
      "--mount",
      `type=volume,source=${volume},target=/var/lib/postgresql/data`,
      "-p",
      "127.0.0.1::5432",
      imageId,
    ]);
    await writeFile(join(directory, "container.json"), JSON.stringify({ containerId, volume, nonce }) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    const port = await docker(["port", containerId, "5432/tcp"]);
    if (!/^127\.0\.0\.1:\d+$/.test(port)) throw Error("OWNED_DATABASE_PORT");
    return { containerId, port: Number(port.split(":")[1]) };
  },
  owner: async (id) => docker(["inspect", "--format", '{{ index .Config.Labels "pact.negotiation.owned" }}', id]),
  initialize: async (url, nonce) => {
    const u = validateOwnedDatabaseTarget(url),
      database = u.pathname.slice(1);
    u.pathname = "/postgres";
    const admin = new pg.Pool({ connectionString: u.href, connectionTimeoutMillis: 500 });
    try {
      let ready = false;
      for (let n = 0; n < 100; n++) {
        try {
          await admin.query("SELECT 1");
          ready = true;
          break;
        } catch {
          await delay(100);
        }
      }
      if (!ready) throw Error("OWNED_DATABASE_NOT_READY");
      await admin.query(`CREATE DATABASE ${database}`);
    } finally {
      await admin.end();
    }
    const p = new pg.Pool({ connectionString: url });
    try {
      await p.query("CREATE TABLE public.architecture_fixture_owner(nonce text PRIMARY KEY)");
      await p.query("INSERT INTO public.architecture_fixture_owner VALUES($1)", [nonce]);
    } finally {
      await p.end();
    }
  },
};
/** Creates only new labelled persistent storage. There is intentionally no stop,
 * drop, reset, retry or teardown capability on this operational bootstrap. */
export async function bootstrapOwnedNegotiationDatabase(directory: string, ports: OwnedBootstrapDriver = driver) {
  if ((await ports.image()) !== imageId) throw Error("OWNED_DATABASE_IMAGE");
  await mkdir(directory, { mode: 0o700 });
  const nonce = randomBytes(32).toString("hex"),
    password = randomBytes(32).toString("hex");
  const started = await ports.start(directory, nonce, password);
  if (!/^[a-f0-9]{64}$/.test(started.containerId) || (await ports.owner(started.containerId, nonce)) !== nonce)
    throw Error("OWNED_DATABASE_CONTAINER");
  const fleetUrl = `postgres://architecture_fixture:${password}@127.0.0.1:${started.port}/fleet_test`,
    pactUrl = `postgres://architecture_fixture:${password}@127.0.0.1:${started.port}/pact_test`;
  validateOwnedDatabaseTarget(fleetUrl);
  validateOwnedDatabaseTarget(pactUrl);
  const manifest = { schemaVersion: "fleet.owned-negotiation-database.v1", ...started, nonce, fleetUrl, pactUrl };
  await writeFile(join(directory, "database.json"), JSON.stringify(manifest) + "\n", { mode: 0o600, flag: "wx" });
  await ports.initialize(fleetUrl, nonce);
  await ports.initialize(pactUrl, nonce);
  return { directory, containerId: started.containerId, port: started.port };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== "linux" || process.argv.slice(2).join(" ") !== "--prepare-new-owned")
      throw Error("EXPLICIT_OWNED_DATABASE_PREPARATION_REQUIRED");
    const base = join(homedir(), ".local/state/pact-negotiation-qualification");
    await mkdir(base, { recursive: true, mode: 0o700 });
    process.stdout.write(JSON.stringify(await bootstrapOwnedNegotiationDatabase(join(base, randomUUID()))) + "\n");
  } catch {
    process.stderr.write("OWNED_DATABASE_PREPARATION_FAILED_RETAIN_PARTIAL_STATE\n");
    process.exitCode = 1;
  }
}
