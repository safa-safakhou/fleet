import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { builtinArchitectures } from "../src/app/builtins.js";
import { connect, migrate } from "../src/db.js";
import { digest } from "../src/research/contracts.js";
import { CaptureSession } from "../src/research/evidence/boundaries.js";
import { RunArchive, verifyArchive, writeArchive } from "../src/research/evidence/export.js";
import { ArtifactFilesystem } from "../src/research/evidence/filesystem.js";
import { RunInspection } from "../src/research/evidence/inspection.js";
import { scopeForTurn } from "../src/research/evidence/repository.js";
import { Store } from "../src/store.js";
import { Vault } from "../src/vault.js";
import { assertOwnedFixture } from "../tests/architecture-fixture.js";
import {
  columns,
  legacySchema,
  preservationKey,
  preservationTime,
  rowHashes,
  seedLegacy,
} from "../tests/fixtures/research/pre-migration.js";
import { createOwnedFixture } from "./test-architecture-offline.js";

const exec = promisify(execFile);
function postgresArgs(url: string) {
  const u = new URL(url);
  return {
    args: [
      "--host",
      u.hostname,
      "--port",
      u.port,
      "--username",
      decodeURIComponent(u.username),
      "--dbname",
      u.pathname.slice(1),
    ],
    env: { PATH: process.env.PATH, PGPASSWORD: decodeURIComponent(u.password), PGCONNECT_TIMEOUT: "5" },
  };
}
export async function rehearseMigration() {
  const f = await createOwnedFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-preservation-")),
    pool = connect(f.fleetUrl),
    restored = connect(f.pactUrl);
  try {
    await assertOwnedFixture(f.fleetUrl, f.nonce);
    await assertOwnedFixture(f.pactUrl, f.nonce);
    await legacySchema(pool);
    const seeded = await seedLegacy(pool),
      old = await columns(pool),
      before = await rowHashes(pool, old);
    await migrate(pool);
    await migrate(pool);
    const after = await rowHashes(pool, old);
    const store = new Store(pool, new Vault(preservationKey), () => preservationTime, builtinArchitectures()),
      files = new ArtifactFilesystem(join(root, "source")),
      capture = new CaptureSession(store, files),
      scope = await scopeForTurn(store, seeded.turns[3]);
    await capture.emit(
      scope,
      "observation.record",
      { synthetic: "ciphertext backup and restore", counter: "9007199254740993" },
      {},
      { required: true },
    );
    await capture.artifacts.materialize(100);
    const all = await columns(pool),
      full = await rowHashes(pool, all),
      source = postgresArgs(f.fleetUrl),
      target = postgresArgs(f.pactUrl),
      dump = join(root, "synthetic.sql");
    await exec(
      "pg_dump",
      [...source.args, "--no-owner", "--no-acl", "--exclude-table=public.architecture_fixture_owner", "--file", dump],
      { env: source.env, maxBuffer: 1024 * 1024 },
    );
    await cp(join(root, "source"), join(root, "restored"), { recursive: true });
    await exec("psql", [...target.args, "--set", "ON_ERROR_STOP=1", "--file", dump], {
      env: target.env,
      maxBuffer: 4 * 1024 * 1024,
    });
    await assertOwnedFixture(f.pactUrl, f.nonce);
    const restoredLegacy = await rowHashes(restored, old),
      restoredFull = await rowHashes(restored, all);
    const restoredStore = new Store(
        restored,
        new Vault(preservationKey),
        () => preservationTime,
        builtinArchitectures(),
      ),
      artifacts = new CaptureSession(restoredStore, new ArtifactFilesystem(join(root, "restored"))).artifacts;
    const inspection = new RunInspection(restoredStore, artifacts),
      principal = { sessionHash: seeded.session },
      snapshot = await inspection.snapshot(scope.runId, principal),
      key = randomBytes(32),
      archivePath = join(root, "restore.fleet");
    await writeArchive(archivePath, new RunArchive(inspection, key).export(snapshot, principal));
    const archive = await verifyArchive(archivePath, key),
      unknown = (
        await restored.query(
          "SELECT count(*)::int count,sum(tokens)::text tokens FROM compute_ledger WHERE status='unknown'",
        )
      ).rows[0];
    const ciphertext = (await restored.query("SELECT secret_cipher,id FROM agents ORDER BY ordinal")).rows;
    for (const a of ciphertext)
      if (new Vault(preservationKey).decrypt<{ grant: string }>(a.secret_cipher, a.id).grant !== "synthetic-only")
        throw Error("RESTORED_CREDENTIAL_MISMATCH");
    const passed =
      before.digest === after.digest &&
      before.digest === restoredLegacy.digest &&
      full.digest === restoredFull.digest &&
      archive.status === "verified";
    return {
      schemaVersion: "fleet.migration-rehearsal/v1",
      scope: "owned-synthetic",
      status: passed ? "passed" : "blocked",
      tables: Object.keys(old).length,
      before,
      after,
      restoredLegacy,
      full,
      restoredFull,
      unknown,
      archive,
      dumpDigest: digest(await readFile(dump, "utf8")),
      rollback: {
        pre048Binary: "incompatible",
        required: "stop-fence-drain; retain new rows; use tested ownership-aware build",
      },
    };
  } finally {
    await pool.end();
    await restored.end();
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).join(" ") !== "--fixture") throw Error("EXPLICIT_FIXTURE_REQUIRED");
  const report = await rehearseMigration();
  await writeFile(
    ".superpowers/sdd/2026-10-30-pact-research-07-qualification/migration-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      scope: report.scope,
      status: report.status,
      tables: report.tables,
      archive: report.archive,
      unknown: report.unknown,
    }),
  );
  if (report.status !== "passed") process.exitCode = 1;
}
