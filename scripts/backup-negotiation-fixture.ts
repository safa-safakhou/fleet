import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { designDigest } from "../src/negotiation-plan.js";
import {
  openPreparationArchive,
  sealPreparationArchive,
  verifyPreparationRestore,
} from "./lib/negotiation-backup-proof.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.string().regex(/^[a-f0-9]{40}$/);
const contextSchema = z
  .object({ sources: z.object({ fleet: revision, pact: revision }).strict(), protocolDigest: hash, fixtureNonce: hash })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal("fleet.owned-negotiation-database.v1"),
    containerId: hash,
    port: z.number().int(),
    nonce: hash,
    fleetUrl: z.string(),
    pactUrl: z.string(),
  })
  .strict();
const docker = (args: string[], input?: Buffer | string) =>
  execFileSync("docker", args, { input, maxBuffer: 512000000, stdio: ["pipe", "pipe", "pipe"] });
const owner = (id: string, label = "pact.negotiation.owned") =>
  docker(["inspect", "--format", `{{ index .Config.Labels "${label}" }}`, id])
    .toString()
    .trim();
function sql(id: string, db: string, query: string) {
  return docker(
    ["exec", "-i", id, "psql", "-U", "architecture_fixture", "-d", db, "-XqAt", "-v", "ON_ERROR_STOP=1"],
    `SET TIME ZONE 'UTC';\n${query}\n`,
  );
}
function identifier(s: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw Error("OWNED_BACKUP_IDENTIFIER");
  return `"${s}"`;
}
export function ownedDatabaseFingerprint(id: string, db: string): string {
  const schemas = "n.nspname='public' OR n.nspname LIKE 'test_negotiation_%'";
  const metadata = JSON.parse(
    sql(
      id,
      db,
      `SELECT coalesce(json_agg(x ORDER BY schema_name,relation_name),'[]') FROM (SELECT n.nspname schema_name,c.relname relation_name,c.relkind,pg_get_userbyid(c.relowner) owner,coalesce(c.relacl::text,'') acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (${schemas}) AND c.relkind IN ('r','p','S')) x;`,
    ).toString(),
  );
  const h = createHash("sha256").update(JSON.stringify(metadata));
  for (const t of metadata) {
    const name = `${identifier(t.schema_name)}.${identifier(t.relation_name)}`;
    const value =
      t.relkind === "S"
        ? sql(id, db, `SELECT last_value::text||':'||is_called::text FROM ${name};`)
        : sql(id, db, `COPY (SELECT to_jsonb(t)::text row FROM ${name} t ORDER BY 1) TO STDOUT;`);
    h.update(JSON.stringify([t.schema_name, t.relation_name]));
    h.update(value);
  }
  return h.digest("hex");
}
/** Operator-only retain/restore proof. Plain SQL/custom dumps stay in RAM;
 * authentication completes before any restore consumer starts. The original
 * container is never stopped, dropped, reset or used as a restore destination. */
export async function backupOwnedNegotiationFixture(
  databasePath: string,
  contextPath: string,
  phase: "before" | "after" = "before",
) {
  if (process.platform !== "linux") throw Error("OWNED_LINUX_BACKUP_REQUIRED");
  const m = manifestSchema.parse(JSON.parse(await readFile(databasePath, "utf8"))),
    context = contextSchema.parse(JSON.parse(await readFile(contextPath, "utf8")));
  if (m.nonce !== context.fixtureNonce || owner(m.containerId) !== m.nonce) throw Error("OWNED_BACKUP_SCOPE");
  const base = dirname(resolve(databasePath)),
    s = await lstat(base);
  if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077) throw Error("OWNED_BACKUP_PRIVATE_DIRECTORY");
  const directory = join(base, `backup-${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  await mkdir(join(directory, "keys"), { mode: 0o700 });
  for (const db of ["fleet_test", "pact_test"]) {
    if (sql(m.containerId, db, "SELECT nonce FROM public.architecture_fixture_owner;").toString().trim() !== m.nonce)
      throw Error("OWNED_BACKUP_SCOPE");
  }
  const active = sql(m.containerId, "fleet_test", "SELECT count(*) FROM turns WHERE state='running';")
    .toString()
    .trim();
  if (active !== "0") throw Error("OWNED_BACKUP_NOT_QUIESCENT");
  if (
    phase === "before" &&
    sql(m.containerId, "fleet_test", "SELECT (SELECT count(*) FROM compute_ledger)+(SELECT count(*) FROM turns);")
      .toString()
      .trim() !== "0"
  )
    throw Error("OWNED_PREPARATION_MUST_BE_ZERO_COST");
  const key = randomBytes(32),
    databases = {} as Record<"fleet_test" | "pact_test", { dump: string; fingerprint: string }>;
  for (const db of ["fleet_test", "pact_test"] as const) {
    const fingerprint = ownedDatabaseFingerprint(m.containerId, db),
      dump = docker(["exec", m.containerId, "pg_dump", "-U", "architecture_fixture", "-d", db, "-Fc"]);
    if (ownedDatabaseFingerprint(m.containerId, db) !== fingerprint) throw Error("OWNED_BACKUP_STATE_CHANGED");
    databases[db] = { dump: dump.toString("base64"), fingerprint };
  }
  const payload = { schemaVersion: "fleet.negotiation-preparation-backup.v1", ...context, databases },
    archive = sealPreparationArchive(payload, key);
  await writeFile(join(directory, "keys/backup.key"), key.toString("base64") + "\n", { mode: 0o600, flag: "wx" });
  await writeFile(join(directory, "preparation-backup.json"), archive, { mode: 0o600, flag: "wx" });
  const verified = openPreparationArchive(await readFile(join(directory, "preparation-backup.json")), key);
  const restoreNonce = randomBytes(32).toString("hex"),
    restorePassword = randomBytes(32).toString("hex"),
    env = join(directory, "restore.env");
  await writeFile(env, `POSTGRES_USER=architecture_fixture\nPOSTGRES_PASSWORD=${restorePassword}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  const restoreId = docker([
    "run",
    "--pull=never",
    "-d",
    "--label",
    `pact.negotiation.restore=${restoreNonce}`,
    "--label",
    `pact.negotiation.original=${m.containerId}`,
    "--env-file",
    env,
    "-p",
    "127.0.0.1::5432",
    "sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537",
  ])
    .toString()
    .trim();
  if (
    !/^[a-f0-9]{64}$/.test(restoreId) ||
    restoreId === m.containerId ||
    owner(restoreId, "pact.negotiation.restore") !== restoreNonce
  )
    throw Error("OWNED_RESTORE_SCOPE");
  await writeFile(
    join(directory, "restore-container.json"),
    JSON.stringify({ restoreId, restoreNonce, original: m.containerId }) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      sql(restoreId, "postgres", "SELECT 1;");
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  if (!ready) throw Error("OWNED_RESTORE_NOT_READY");
  const restored = {} as Record<"fleet_test" | "pact_test", string>;
  for (const db of ["fleet_test", "pact_test"] as const) {
    sql(restoreId, "postgres", `CREATE DATABASE ${db};`);
    docker(
      ["exec", "-i", restoreId, "pg_restore", "-U", "architecture_fixture", "-d", db, "--exit-on-error", "--no-owner"],
      Buffer.from(verified.databases[db].dump, "base64"),
    );
    restored[db] = ownedDatabaseFingerprint(restoreId, db);
  }
  const proof = {
    schemaVersion: "fleet.negotiation-preparation-restore.v1",
    ...context,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    restored,
  };
  verifyPreparationRestore(archive, key, proof, context);
  for (const db of ["fleet_test", "pact_test"] as const)
    if (ownedDatabaseFingerprint(m.containerId, db) !== verified.databases[db].fingerprint)
      throw Error("OWNED_ORIGINAL_CHANGED_DURING_RESTORE");
  await writeFile(join(directory, "preparation-restore-proof.json"), JSON.stringify(proof, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  const port = docker(["port", restoreId, "5432/tcp"]).toString().trim();
  if (!/^127\.0\.0\.1:\d+$/.test(port)) throw Error("OWNED_RESTORE_PORT");
  await writeFile(
    join(directory, "restore-database.json"),
    JSON.stringify({
      containerId: restoreId,
      restoreNonce,
      original: m.containerId,
      nonce: m.nonce,
      port: Number(port.split(":")[1]),
      fleetUrl: `postgres://architecture_fixture:${restorePassword}@${port}/fleet_test`,
      pactUrl: `postgres://architecture_fixture:${restorePassword}@${port}/pact_test`,
    }) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  return {
    directory,
    archiveSha256: proof.archiveSha256,
    restoredStateDigest: designDigest(restored),
    authenticatedRestoreVerified: true,
    phase,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [database, context, phase] = process.argv.slice(2);
    if (!database || !context || (phase !== "before" && phase !== "after")) throw Error("OWNED_BACKUP_ARGUMENTS");
    process.stdout.write(JSON.stringify(await backupOwnedNegotiationFixture(database, context, phase)) + "\n");
  } catch {
    process.stderr.write("OWNED_BACKUP_FAILED_PARTIAL_STATE_RETAINED\n");
    process.exitCode = 1;
  }
}
