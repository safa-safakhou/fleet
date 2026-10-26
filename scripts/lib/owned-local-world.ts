import { execFile, spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile),
  fleetRepo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export type OwnedWorldConfig = {
  schemaVersion: string;
  id: string;
  root: string;
  node: string;
  pactRepo: string;
  fleetRepo: string;
  postgresImage: string;
  pactContainer: string;
  fleetContainer: string;
  purpose?: string;
  pactEnv: Record<string, string>;
  fleetEnv: Record<string, string>;
  model: { endpoint: string; servedName: string; repository: string; revision: string };
};
/** Native local event publication is part of the run, without external delivery adapters. */
export function ownedEventPublisher(c: OwnedWorldConfig) {
  if (!c.fleetEnv.FLEET_PACT_EVENT_FEED_VERSION && c.pactEnv.PACT_AGENT_EVENTS_ENABLED !== "1") return undefined;
  if (c.pactEnv.PACT_AGENT_EVENTS_ENABLED !== "1") throw Error("EVENT_PUBLISHER_REQUIRED");
  return {
    name: "pact-events",
    kind: "pact" as const,
    args: ["workers/notification/dist/main.js"],
    env: { SMTP_URL: "", WEB_PUSH_PUBLIC_KEY: "", WEB_PUSH_PRIVATE_KEY: "", WEB_PUSH_SUBJECT: "" },
  };
}
export function requiredOwnedProcesses(c: OwnedWorldConfig) {
  return ["fleet-worker", "pact-rules", ...(ownedEventPublisher(c) ? ["pact-events"] : [])];
}
export async function startOwnedEventPublisher(c: OwnedWorldConfig) {
  const plan = ownedEventPublisher(c);
  if (!plan) return;
  const record = await startOwnedProcess(c, plan.name, plan.kind, plan.args, plan.env);
  for (let n = 0; n < 100; n++) {
    const current = await processIdentity(record.pid);
    if (current.state === "Z" || !sameProcess(record, current, c.root)) throw Error("EVENT_PUBLISHER_NOT_READY");
    const log = await readFile(resolve(c.root, "logs", `${plan.name}.log`), "utf8");
    if (log.includes('"event":"notification.ready"')) return record;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw Error("EVENT_PUBLISHER_NOT_READY");
}
export function assertOwnedConfiguration(c: OwnedWorldConfig, root: string) {
  if (
    c.model.servedName !== "nemotron-4b" ||
    c.model.repository !== "nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16" ||
    c.model.revision !== "dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f" ||
    new URL(c.model.endpoint).hostname !== "127.0.0.1"
  )
    throw Error("PINNED_NEMOTRON_REQUIRED");
  if (
    c.schemaVersion !== "pact.fresh-24h.v1" ||
    c.root !== resolve(root) ||
    !/^fresh-(24h|canary)-\d{8}-[a-f0-9]{8}$/.test(c.id) ||
    c.fleetRepo !== fleetRepo ||
    c.pactRepo !== resolve(fleetRepo, "../pact") ||
    c.node !== process.execPath ||
    c.pactContainer !== `${c.id}-pact-db` ||
    c.fleetContainer !== `${c.id}-fleet-db`
  )
    throw Error("OWNED_WORLD_CONFIGURATION_REQUIRED");
  for (const kind of ["pact", "fleet"] as const) {
    const db = new URL(c[`${kind}Env`].DATABASE_URL),
      origin = new URL(c[`${kind}Env`][kind === "pact" ? "PACT_ORIGIN" : "FLEET_ORIGIN"]);
    if (
      db.hostname !== "127.0.0.1" ||
      db.pathname !== `/${kind}` ||
      !db.port ||
      ["5432", "5437", "5439"].includes(db.port) ||
      origin.hostname !== "127.0.0.1" ||
      origin.protocol !== "http:"
    )
      throw Error("OWNED_WORLD_LOOPBACK_REQUIRED");
  }
  if (
    c.fleetEnv.FLEET_ENVIRONMENT_INSTANCE !== c.id ||
    c.fleetEnv.FLEET_RUN_WINDOW_FILE !== resolve(root, "window.json")
  )
    throw Error("OWNED_WORLD_IDENTITY_MISMATCH");
}
export async function loadOwnedWorld(root: string) {
  root = resolve(root);
  if ((await realpath(root)) !== root || (await stat(root)).mode & 0o077) throw Error("PRIVATE_OWNED_ROOT_REQUIRED");
  const c = JSON.parse(await readFile(resolve(root, "config.json"), "utf8")) as OwnedWorldConfig;
  assertOwnedConfiguration(c, root);
  for (const kind of ["pact", "fleet"] as const) {
    const { stdout } = await exec("docker", [
      "inspect",
      c[`${kind}Container`],
      "--format",
      '{{index .Config.Labels "pact.fresh-world"}}',
    ]);
    if (stdout.trim() !== c.id) throw Error("DATABASE_OWNERSHIP_MISMATCH");
  }
  return c;
}
export async function writePrivateJson(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.next`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  await rename(temp, file);
}
export async function closeAdmissions(c: OwnedWorldConfig, reason: string, status = "draining") {
  const path = c.fleetEnv.FLEET_RUN_WINDOW_FILE;
  try {
    await writeFile(`${path}.closed`, JSON.stringify({ reason, at: Date.now() }), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const first = JSON.parse(await readFile(`${path}.closed`, "utf8"));
  const old = JSON.parse(await readFile(path, "utf8"));
  await writePrivateJson(path, { ...old, status, reason: first.reason, closedAt: first.at });
}
export const localEnvironment = (c: OwnedWorldConfig, kind: "pact" | "fleet", extra: Record<string, string> = {}) => ({
  PATH: `${dirname(c.node)}:/usr/local/bin:/usr/bin:/bin`,
  HOME: process.env.HOME ?? "/home/mnim",
  LANG: "C.UTF-8",
  ...c[`${kind}Env`],
  ...extra,
});
export async function clock(c: OwnedWorldConfig, action: "pause" | "resume" | "status") {
  const { stdout } = await exec(c.node, ["--import", "tsx", "workers/rules/src/control.ts", action], {
    cwd: c.pactRepo,
    env: localEnvironment(c, "pact"),
    timeout: 10000,
  });
  return JSON.parse(stdout);
}
export type OwnedProcess = {
  root: string;
  pid: number;
  startTicks: string;
  cwd: string;
  commandSha256: string;
  name: string;
};
export async function processIdentity(pid: number) {
  const base = `/proc/${pid}`,
    text = await readFile(`${base}/stat`, "utf8"),
    values = text.slice(text.lastIndexOf(")") + 2).split(" ");
  const identity = {
    startTicks: values[19],
    state: values[0],
    cwd: await realpath(`${base}/cwd`),
    commandSha256: createHash("sha256")
      .update(await readFile(`${base}/cmdline`))
      .digest("hex"),
  };
  // Exit can empty cmdline between the first stat and these reads. Check the
  // final state before interpreting that shutdown race as a foreign process.
  const after = await readFile(`${base}/stat`, "utf8"),
    final = after.slice(after.lastIndexOf(")") + 2).split(" ");
  if (final[19] !== identity.startTicks) throw Error("PROCESS_OWNERSHIP_MISMATCH");
  return { ...identity, state: final[0] };
}
export function sameProcess(saved: OwnedProcess, current: Awaited<ReturnType<typeof processIdentity>>, root: string) {
  return (
    saved.root === root &&
    saved.startTicks === current.startTicks &&
    saved.cwd === current.cwd &&
    saved.commandSha256 === current.commandSha256
  );
}
/** Only after a verified stop request: Linux can empty cmdline before publishing Z.
 * This authorizes waiting only, never another signal or a claim that a live process exited. */
export function mayWaitForOwnedExit(
  saved: OwnedProcess,
  current: Awaited<ReturnType<typeof processIdentity>>,
  root: string,
) {
  return (
    current.commandSha256 === createHash("sha256").digest("hex") &&
    sameProcess(saved, { ...current, commandSha256: saved.commandSha256 }, root)
  );
}
export async function startOwnedProcess(
  c: OwnedWorldConfig,
  name: string,
  kind: "pact" | "fleet",
  args: string[],
  extra: Record<string, string> = {},
) {
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(name)) throw Error("INVALID_PROCESS_NAME");
  const recordFile = resolve(c.root, `${name}.process.json`);
  // A prior record is an operator inspection gate, never implicit permission to replace a process.
  try {
    await stat(recordFile);
    throw Error("PROCESS_RECORD_ALREADY_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const log = openSync(resolve(c.root, "logs", `${name}.log`), "wx", 0o600);
  try {
    const child = spawn(c.node, args, {
      cwd: c[`${kind}Repo`],
      env: localEnvironment(c, kind, extra),
      detached: true,
      stdio: ["ignore", log, log],
    });
    await new Promise<void>((ok, fail) => {
      child.once("spawn", ok);
      child.once("error", fail);
    });
    const pid = child.pid;
    if (!pid) throw Error("OWNED_PROCESS_START_FAILED");
    const current = await processIdentity(pid);
    const record: OwnedProcess = {
      root: c.root,
      pid,
      startTicks: current.startTicks,
      cwd: current.cwd,
      commandSha256: current.commandSha256,
      name,
    };
    await writeFile(recordFile, JSON.stringify(record, null, 2), { mode: 0o600, flag: "wx" });
    child.unref();
    return record;
  } finally {
    closeSync(log);
  }
}
export async function stopOwnedProcess(c: OwnedWorldConfig, name: string, force = false) {
  let saved: OwnedProcess;
  try {
    saved = JSON.parse(await readFile(resolve(c.root, `${name}.process.json`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  let current: Awaited<ReturnType<typeof processIdentity>>;
  try {
    current = await processIdentity(saved.pid);
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
    throw error;
  }
  if (!sameProcess(saved, current, c.root)) throw Error("PROCESS_OWNERSHIP_MISMATCH");
  let firstStop = true;
  const stopFile = resolve(c.root, `${name}.stop-request.json`);
  try {
    await writeFile(stopFile, JSON.stringify({ pid: saved.pid, startTicks: saved.startTicks, at: Date.now() }), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const previous = JSON.parse(await readFile(stopFile, "utf8"));
    if (previous.pid !== saved.pid || previous.startTicks !== saved.startTicks)
      throw Error("PROCESS_OWNERSHIP_MISMATCH");
    firstStop = false;
  }
  if (firstStop) process.kill(saved.pid, "SIGTERM");
  for (let i = 0; i < 100; i++) {
    try {
      current = await processIdentity(saved.pid);
    } catch (error) {
      if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
      throw error;
    }
    if (current.state === "Z") return;
    if (!sameProcess(saved, current, c.root) && !mayWaitForOwnedExit(saved, current, c.root))
      throw Error("PROCESS_OWNERSHIP_MISMATCH");
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!force) throw Error("OWNED_PROCESS_DRAIN_TIMEOUT");
  current = await processIdentity(saved.pid);
  if (!sameProcess(saved, current, c.root)) throw Error("PROCESS_OWNERSHIP_MISMATCH");
  process.kill(saved.pid, "SIGKILL");
}
export async function stopOwnedProvider(c: OwnedWorldConfig) {
  let saved: {
    pid: number;
    startTicks: string;
    root: string;
    model: string;
    instanceId: string;
    sharedFrom?: string;
    exclusiveConsumer?: string;
  };
  try {
    saved = JSON.parse(await readFile(resolve(c.root, "provider/service.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { stopped: true, absent: true };
    throw error;
  }
  if (saved.model !== "nemotron-4b") throw Error("PROVIDER_OWNERSHIP_MISMATCH");
  if (saved.root !== resolve(c.root, "provider")) {
    if (saved.exclusiveConsumer !== c.root || !saved.sharedFrom || dirname(saved.sharedFrom) !== saved.root)
      throw Error("PROVIDER_OWNERSHIP_MISMATCH");
    const original = JSON.parse(await readFile(saved.sharedFrom, "utf8"));
    if (
      original.pid !== saved.pid ||
      original.startTicks !== saved.startTicks ||
      original.instanceId !== saved.instanceId
    )
      throw Error("PROVIDER_OWNERSHIP_MISMATCH");
  }
  const inspect = async () => {
    const text = await readFile(`/proc/${saved.pid}/stat`, "utf8"),
      values = text.slice(text.lastIndexOf(")") + 2).split(" ");
    if (values[0] === "Z") return false;
    if (
      values[19] !== saved.startTicks ||
      Number(values[2]) !== saved.pid ||
      (await realpath(`/proc/${saved.pid}/cwd`)) !== saved.root
    )
      throw Error("PROVIDER_OWNERSHIP_MISMATCH");
    return true;
  };
  try {
    if (!(await inspect())) return { stopped: true, alreadyStopped: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { stopped: true, alreadyStopped: true };
    throw error;
  }
  process.kill(-saved.pid, "SIGTERM");
  for (let i = 0; i < 100; i++) {
    await new Promise((done) => setTimeout(done, 100));
    try {
      if (!(await inspect())) return { stopped: true, pid: saved.pid, instanceId: saved.instanceId };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { stopped: true, pid: saved.pid, instanceId: saved.instanceId };
      throw error;
    }
  }
  if (await inspect()) process.kill(-saved.pid, "SIGKILL");
  return { stopped: true, pid: saved.pid, forced: true };
}
export async function snapshot(c: OwnedWorldConfig, label: string) {
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(label)) throw Error("INVALID_SNAPSHOT_LABEL");
  for (const kind of ["pact", "fleet"] as const) {
    const { stdout: plain } = await exec(
      "docker",
      ["exec", c[`${kind}Container`], "pg_dump", "-U", kind, "-d", kind, "-Fc"],
      { encoding: "buffer", maxBuffer: 512 * 1024 ** 2 },
    );
    const key = randomBytes(32),
      nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, nonce);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    await writeFile(resolve(c.root, "keys", `${label}-${kind}.key`), key, { mode: 0o600, flag: "wx" });
    await writeFile(
      resolve(c.root, "evidence", `${label}-${kind}.dump.enc`),
      Buffer.concat([nonce, cipher.getAuthTag(), encrypted]),
      { mode: 0o600, flag: "wx" },
    );
    await writeFile(
      resolve(c.root, "evidence", `${label}-${kind}.sha256`),
      createHash("sha256").update(plain).digest("hex"),
      { mode: 0o600, flag: "wx" },
    );
  }
}
/** Restore the exact encrypted archives into a network-disabled temporary database; never load retained worlds. */
export async function restoreCheck(c: OwnedWorldConfig, label: string) {
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(label)) throw Error("INVALID_SNAPSHOT_LABEL");
  const clone = `${c.id}-restore-${randomUUID().slice(0, 8)}`,
    hashes: Record<string, Record<string, string>> = {};
  const run = async (args: string[], input?: Buffer) => {
    if (input) {
      const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
      const error: Buffer[] = [];
      child.stderr.on("data", (part) => error.push(part));
      child.stdout.resume();
      child.stdin.on("error", () => {});
      child.stdin.end(input);
      const code = await new Promise<number>((ok, fail) => {
        child.once("error", fail);
        child.once("exit", (n) => ok(n ?? 1));
      });
      if (code !== 0) throw Error("RESTORE_FAILED");
      return "";
    }
    return (await exec("docker", args, { maxBuffer: 4 * 1024 ** 2 })).stdout.trim();
  };
  await run([
    "run",
    "--pull=never",
    "-d",
    "--network",
    "none",
    "--name",
    clone,
    "--label",
    `pact.restore-check=${c.id}`,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    c.postgresImage,
  ]);
  const removeOwnedRestore = async () => {
    if ((await run(["inspect", clone, "--format", '{{index .Config.Labels "pact.restore-check"}}'])) !== c.id)
      throw Error("RESTORE_OWNERSHIP_MISMATCH");
    await run(["rm", "-f", "-v", clone]);
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await run(["exec", clone, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 200));
      }
    }
    if (!ready) throw Error("RESTORE_DATABASE_NOT_READY");
    for (const kind of ["pact", "fleet"] as const) {
      const data = await readFile(resolve(c.root, "evidence", `${label}-${kind}.dump.enc`));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        await readFile(resolve(c.root, "keys", `${label}-${kind}.key`)),
        data.subarray(0, 12),
      );
      decipher.setAuthTag(data.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
      if (
        createHash("sha256").update(plain).digest("hex") !==
        (await readFile(resolve(c.root, "evidence", `${label}-${kind}.sha256`), "utf8"))
      )
        throw Error("SNAPSHOT_HASH_MISMATCH");
      await run(["exec", clone, "psql", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE ${kind}`]);
      await run(
        ["exec", "-i", clone, "pg_restore", "-U", "postgres", "-d", kind, "--no-owner", "--no-acl", "--exit-on-error"],
        plain,
      );
      const tables = (
        await run([
          "exec",
          clone,
          "psql",
          "-U",
          "postgres",
          "-d",
          kind,
          "-tA",
          "-c",
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        ])
      ).split("\n");
      hashes[kind] = {};
      for (const table of tables) {
        if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw Error("UNEXPECTED_TABLE_NAME");
        const sql = `SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.${table} t`;
        const original = await run(["exec", c[`${kind}Container`], "psql", "-U", kind, "-d", kind, "-tA", "-c", sql]);
        const restored = await run(["exec", clone, "psql", "-U", "postgres", "-d", kind, "-tA", "-c", sql]);
        if (original !== restored) throw Error(`RESTORE_ROW_MISMATCH:${kind}:${table}`);
        hashes[kind][table] = original;
      }
    }
    const proof = {
      label,
      authenticated: true,
      networkDisabled: true,
      completeRowTables: Object.fromEntries(Object.entries(hashes).map(([k, v]) => [k, Object.keys(v).length])),
      hashes,
    };
    await writePrivateJson(resolve(c.root, "evidence", `${label}-restore.json`), proof);
    return proof;
  } finally {
    await removeOwnedRestore();
  }
}
