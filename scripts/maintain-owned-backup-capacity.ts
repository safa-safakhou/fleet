import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ownedDatabaseFingerprint } from "./backup-negotiation-fixture.js";
import { validateOwnedDatabaseTarget } from "./lib/negotiation-artifacts.js";
import { waitForOwnedPostgres } from "./lib/negotiation-postgres-ready.js";

const image = "sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537";
async function refreshPublishedAddress(path: string, containerId: string) {
  const old = await readFile(path, "utf8"),
    m = JSON.parse(old) as { port: number; fleetUrl: string; pactUrl: string },
    address = execFileSync("docker", ["port", containerId, "5432/tcp"], { encoding: "utf8" }).trim();
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw Error("OWNED_LOOPBACK_REQUIRED");
  const port = Number(address.split(":")[1]),
    fleet = validateOwnedDatabaseTarget(m.fleetUrl),
    pact = validateOwnedDatabaseTarget(m.pactUrl);
  fleet.port = String(port);
  pact.port = String(port);
  validateOwnedDatabaseTarget(fleet.href);
  validateOwnedDatabaseTarget(pact.href);
  const suffix = randomUUID();
  await writeFile(path + ".before-port-" + suffix, old, { mode: 0o600, flag: "wx" });
  await writeFile(
    path + ".new-port-" + suffix,
    JSON.stringify({ ...JSON.parse(old), port, fleetUrl: fleet.href, pactUrl: pact.href }) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  await rename(path + ".new-port-" + suffix, path);
  return port;
}
/** Capacity maintenance for a new, entirely unexecuted qualification roster.
 * Never accepts a retained installation, consumed model allocation or live group.
 * It changes PostgreSQL lock-table capacity only; every business row and sequence
 * must retain its exact fingerprint across the same owned container restart. */
export async function maintainOwnedBackupCapacity(path: string) {
  const base = resolve(homedir(), ".local/state/pact-negotiation-qualification"),
    directory = dirname(resolve(path));
  if (
    process.platform !== "linux" ||
    !directory.startsWith(base + "/") ||
    dirname(directory) !== base ||
    !/^[a-f0-9-]{36}$/.test(directory.slice(base.length + 1)) ||
    resolve(path) !== join(directory, "database.json") ||
    (await realpath(directory)) !== directory ||
    (await lstat(directory)).mode & 0o077
  )
    throw Error("OWNED_NEW_ROSTER_REQUIRED");
  const m = JSON.parse(await readFile(path, "utf8")) as { containerId: string; nonce: string };
  if (!/^[a-f0-9]{64}$/.test(m.containerId) || !/^[a-f0-9]{64}$/.test(m.nonce)) throw Error("OWNED_SCOPE");
  const docker = (args: string[], input?: string) =>
    execFileSync("docker", args, { input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1000000 });
  if (
    docker(["inspect", "--format", '{{ index .Config.Labels "pact.negotiation.owned" }}', m.containerId])
      .toString()
      .trim() !== m.nonce ||
    docker(["inspect", "--format", "{{.Image}}", m.containerId]).toString().trim() !== image
  )
    throw Error("OWNED_SCOPE");
  const sql = (db: string, query: string) =>
    docker(
      ["exec", "-i", m.containerId, "psql", "-U", "architecture_fixture", "-d", db, "-XqAt", "-v", "ON_ERROR_STOP=1"],
      query,
    )
      .toString()
      .trim();
  for (const db of ["fleet_test", "pact_test"])
    if (sql(db, "SELECT nonce FROM public.architecture_fixture_owner;") !== m.nonce) throw Error("OWNED_SCOPE");
  if (
    sql(
      "fleet_test",
      "SELECT (SELECT count(*) FROM turns)+(SELECT count(*) FROM compute_ledger)+(SELECT count(*) FROM cohorts WHERE state<>'draft');",
    ) !== "0"
  )
    throw Error("DRAFT_ZERO_USAGE_REQUIRED");
  const settings = sql(
    "pact_test",
    "SELECT json_build_object('locks',current_setting('max_locks_per_transaction')::int,'connections',current_setting('max_connections')::int,'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname LIKE 'test_negotiation_%' AND c.relkind IN ('r','p','S')));",
  );
  const capacity = JSON.parse(settings) as { locks: number; connections: number; relations: number };
  if (capacity.locks !== 64 || capacity.relations < 6400 || capacity.connections * 512 < capacity.relations * 2)
    throw Error("EXACT_LARGE_ROSTER_CAPACITY_CASE_REQUIRED");
  const before = Object.fromEntries(
    ["fleet_test", "pact_test"].map((db) => [db, ownedDatabaseFingerprint(m.containerId, db)]),
  );
  await writeFile(
    join(directory, "backup-capacity-before.json"),
    JSON.stringify({ containerId: m.containerId, nonce: m.nonce, capacity, before, modelCalls: 0 }) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  sql("pact_test", "ALTER SYSTEM SET max_locks_per_transaction = '512';");
  docker(["restart", "--time", "60", m.containerId]);
  await waitForOwnedPostgres(m.containerId, async (args) => docker(args));
  const publishedPort = await refreshPublishedAddress(path, m.containerId);
  if (sql("pact_test", "SHOW max_locks_per_transaction;") !== "512") throw Error("CAPACITY_NOT_APPLIED");
  const after = Object.fromEntries(
    ["fleet_test", "pact_test"].map((db) => [db, ownedDatabaseFingerprint(m.containerId, db)]),
  );
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("OWNED_STATE_CHANGED");
  const proof = {
    containerId: m.containerId,
    nonce: m.nonce,
    beforeLocks: 64,
    afterLocks: 512,
    publishedPort,
    before,
    after,
    allBusinessRowsAndSequencesPreserved: true,
    realProviderCalls: 0,
    pausedWorldAccess: false,
  };
  await writeFile(join(directory, "backup-capacity-after.json"), JSON.stringify(proof) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  return proof;
}
/** Original or authenticated restore-only large roster, before any execution. */
export async function maintainOwnedRosterConnections(path: string) {
  const base = resolve(homedir(), ".local/state/pact-negotiation-qualification"),
    directory = dirname(resolve(path));
  if (
    process.platform !== "linux" ||
    !directory.startsWith(base + "/") ||
    (await realpath(directory)) !== directory ||
    !/^\/[a-f0-9-]{36}(\/backup-[a-f0-9-]{36})?$/.test(directory.slice(base.length)) ||
    !["database.json", "restore-database.json"].includes(resolve(path).slice(directory.length + 1)) ||
    (await lstat(directory)).mode & 0o077
  )
    throw Error("OWNED_NEW_ROSTER_REQUIRED");
  const m = JSON.parse(await readFile(path, "utf8")) as {
    containerId: string;
    nonce: string;
    restoreNonce?: string;
    original?: string;
  };
  if (!/^[a-f0-9]{64}$/.test(m.containerId) || !/^[a-f0-9]{64}$/.test(m.nonce)) throw Error("OWNED_SCOPE");
  const docker = (args: string[], input?: string) =>
    execFileSync("docker", args, { input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1000000 });
  const label = (name: string) =>
    docker(["inspect", "--format", `{{ index .Config.Labels "${name}" }}`, m.containerId])
      .toString()
      .trim();
  if (m.restoreNonce) {
    const original = JSON.parse(await readFile(join(dirname(directory), "database.json"), "utf8")) as {
      containerId: string;
      nonce: string;
    };
    if (
      !/^[a-f0-9]{64}$/.test(m.restoreNonce) ||
      label("pact.negotiation.restore") !== m.restoreNonce ||
      label("pact.negotiation.original") !== m.original ||
      original.containerId !== m.original ||
      original.nonce !== m.nonce
    )
      throw Error("OWNED_RESTORE_SCOPE");
  } else if (label("pact.negotiation.owned") !== m.nonce) throw Error("OWNED_SCOPE");
  if (docker(["inspect", "--format", "{{.Image}}", m.containerId]).toString().trim() !== image)
    throw Error("OWNED_IMAGE");
  const sql = (db: string, query: string) =>
    docker(
      ["exec", "-i", m.containerId, "psql", "-U", "architecture_fixture", "-d", db, "-XqAt", "-v", "ON_ERROR_STOP=1"],
      query,
    )
      .toString()
      .trim();
  for (const db of ["fleet_test", "pact_test"])
    if (sql(db, "SELECT nonce FROM public.architecture_fixture_owner;") !== m.nonce) throw Error("OWNED_SCOPE");
  if (
    sql(
      "fleet_test",
      "SELECT (SELECT count(*) FROM turns)+(SELECT count(*) FROM compute_ledger)+(SELECT count(*) FROM cohorts WHERE state<>'draft');",
    ) !== "0"
  )
    throw Error("DRAFT_ZERO_USAGE_REQUIRED");
  if (
    sql("pact_test", "SHOW max_connections;") !== "100" ||
    Number(sql("pact_test", "SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'test_negotiation_%';")) !== 70
  )
    throw Error("EXACT_LARGE_ROSTER_CONNECTION_CASE_REQUIRED");
  const before = Object.fromEntries(
    ["fleet_test", "pact_test"].map((db) => [db, ownedDatabaseFingerprint(m.containerId, db)]),
  );
  await writeFile(
    join(directory, "connection-capacity-before.json"),
    JSON.stringify({ containerId: m.containerId, nonce: m.nonce, before }) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  sql("pact_test", "ALTER SYSTEM SET max_connections = '256';");
  docker(["restart", "--time", "60", m.containerId]);
  await waitForOwnedPostgres(m.containerId, async (args) => docker(args));
  const publishedPort = await refreshPublishedAddress(path, m.containerId);
  const after = Object.fromEntries(
    ["fleet_test", "pact_test"].map((db) => [db, ownedDatabaseFingerprint(m.containerId, db)]),
  );
  if (sql("pact_test", "SHOW max_connections;") !== "256" || JSON.stringify(before) !== JSON.stringify(after))
    throw Error("OWNED_STATE_CHANGED");
  const proof = {
    containerId: m.containerId,
    beforeConnections: 100,
    afterConnections: 256,
    publishedPort,
    before,
    after,
    allBusinessRowsAndSequencesPreserved: true,
    realProviderCalls: 0,
    pausedWorldAccess: false,
  };
  await writeFile(join(directory, "connection-capacity-after.json"), JSON.stringify(proof) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  return proof;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, path] = process.argv.slice(2);
  if (!["--owned-draft-zero-usage", "--owned-zero-usage-connections"].includes(flag) || !path)
    throw Error("EXPLICIT_OWNED_SCOPE_REQUIRED");
  (flag === "--owned-zero-usage-connections" ? maintainOwnedRosterConnections(path) : maintainOwnedBackupCapacity(path))
    .then((proof) => process.stdout.write(JSON.stringify(proof) + "\n"))
    .catch(() => {
      process.stderr.write("OWNED_CAPACITY_MAINTENANCE_FAILED_STATE_RETAINED\n");
      process.exitCode = 1;
    });
}
