import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { transaction } from "../../src/db.js";
import { ArtifactStore, bytes } from "../../src/research/evidence/artifacts.js";
import { RunArchive, verifyArchive, writeArchive } from "../../src/research/evidence/export.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { RunInspection } from "../../src/research/evidence/inspection.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { scopeForTurn } from "../../src/research/evidence/repository.js";
import { researchFixture } from "../research-helpers.js";

test("exports_every_retained_page and 16 MiB payload with explicit unavailable data", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-export-"));
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id),
      recorder = new EvidenceRecorder(f.store),
      artifacts = new ArtifactStore(f.store, new ArtifactFilesystem(join(root, "artifacts"))),
      sessionHash = randomUUID(),
      principal = { sessionHash };
    await f.pool.query("INSERT INTO operator_sessions(hash,csrf,expires_at) VALUES($1,'fixture',$2)", [
      sessionHash,
      new Date(f.now().getTime() + 3600000),
    ]);
    await recorder.append(scope, { kind: "run.started", producerKey: "start", streamId: "run" });
    const raw = Buffer.alloc(16 * 1024 * 1024, 7),
      ref = await artifacts.put(scope, bytes(raw), { ...(await artifacts.policy(scope)), expectedBytes: raw.length });
    await transaction(f.pool, async (db) => {
      for (let i = 0; i < 1204; i++)
        await recorder.append(
          scope,
          {
            kind: "observation.record",
            producerKey: `event-${i}`,
            streamId: `stream-${i % 4}`,
            artifacts: i === 0 ? [ref] : [],
          },
          db,
        );
    });
    const inspection = new RunInspection(f.store, artifacts),
      snap = await inspection.snapshot(scope.runId, principal),
      key = randomBytes(32),
      archive = new RunArchive(inspection, key),
      path = join(root, "complete.fleet");
    await writeArchive(path, archive.export(snap, principal));
    expect(await verifyArchive(path)).toMatchObject({ status: "key_required" });
    expect(await verifyArchive(path, key)).toMatchObject({
      status: "verified",
      events: 1205,
      artifacts: 1,
      bytes: String(raw.length),
      gaps: 0,
    });
    const stored = await readFile(path, "utf8");
    expect(stored).not.toContain(scope.agentId);
    await writeFile(join(root, "cut.fleet"), stored.slice(0, stored.lastIndexOf("\n", stored.length - 2) + 1));
    expect((await verifyArchive(join(root, "cut.fleet"), key)).status).toBe("invalid");
    const lines = stored.trimEnd().split("\n");
    lines.splice(3, 0, lines[2]);
    await writeFile(join(root, "duplicate.fleet"), lines.join("\n") + "\n");
    expect((await verifyArchive(join(root, "duplicate.fleet"), key)).status).toBe("invalid");
    expect((await verifyArchive(path, randomBytes(32))).status).toBe("invalid");
    await f.pool.query("UPDATE research_artifacts SET expires_at=$1 WHERE id=$2", [f.now(), ref.id]);
    await artifacts.expire(f.now());
    const expired = await inspection.snapshot(scope.runId, principal),
      gapPath = join(root, "gap.fleet");
    await writeArchive(gapPath, archive.export(expired, principal));
    expect(await verifyArchive(gapPath, key)).toMatchObject({
      status: "verified",
      events: 1205,
      artifacts: 0,
      gaps: 1,
    });
    const source = archive.export(expired, principal)[Symbol.asyncIterator]();
    await source.next();
    await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
    await expect(source.next()).rejects.toThrow("EVIDENCE_WITHHELD");
    await expect(writeArchive(path, archive.export(expired, principal))).rejects.toThrow();
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
