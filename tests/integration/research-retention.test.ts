import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { ArtifactStore, bytes } from "../../src/research/evidence/artifacts.js";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { scopeForTurn } from "../../src/research/evidence/repository.js";
import { researchFixture } from "../research-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});
async function setup() {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-artifacts-"));
  cleanup = async () => {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  };
  const scope = await scopeForTurn(f.store, f.claim.turn.id);
  await new EvidenceRecorder(f.store).append(scope, { kind: "run.started", producerKey: "start", streamId: "run" });
  const artifacts = new ArtifactStore(f.store, new ArtifactFilesystem(root));
  const version = (
    await f.pool.query("SELECT observation_consent_version::text v FROM cohorts WHERE id=$1", [f.group.id])
  ).rows[0].v;
  return {
    f,
    root,
    scope,
    artifacts,
    policy: {
      contentType: "application/octet-stream",
      privacyClass: "private" as const,
      retentionClass: "30d" as const,
      maxBytes: 4 * 1024 * 1024,
      runQuotaBytes: 32 * 1024 * 1024,
      consentVersion: version,
    },
  };
}
async function collect(source: AsyncIterable<Uint8Array>) {
  const chunks = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
test("round_trips_large_body_and_refuses_stale_consent", async () => {
  const { f, root, scope, artifacts, policy } = await setup(),
    body = Buffer.alloc(2 * 1024 * 1024 + 17, 7);
  const ref = await artifacts.put(scope, bytes(body), { ...policy, expectedBytes: body.length });
  expect(ref.chunks).toBe("3");
  expect((await new CoverageService(f.store).reconcile(scope.runId)).missing).toContainEqual({
    kind: "artifact.unlinked",
    sourceId: ref.id,
  });
  expect((await new CoverageService(f.store).reconcile(scope.runId)).byteCoverage).toMatchObject({
    expected: String(body.length),
    recorded: String(body.length),
  });
  expect(await collect(artifacts.read(scope, ref))).toEqual(body);
  const chunk = await readFile(join(root, ref.id, "0.chunk"));
  expect(chunk.includes(body.subarray(0, 100))).toBe(false);
  await writeFile(join(root, ref.id, "0.chunk"), Buffer.from("tampered"));
  await expect(collect(artifacts.read(scope, ref))).rejects.toThrow("ARTIFACT_INTEGRITY");
  await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
  await expect(collect(artifacts.read(scope, ref))).rejects.toThrow("ARTIFACT_WITHHELD");
  await f.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [f.group.id]);
  await expect(artifacts.put(scope, bytes(body), policy)).rejects.toThrow("ARTIFACT_WITHHELD");
  expect((await new CoverageService(f.store).reconcile(scope.runId)).reasons).toContain("ARTIFACT_WITHHELD");
  await artifacts.expire(f.now());
  expect((await f.pool.query("SELECT status FROM research_artifacts WHERE id=$1", [ref.id])).rows[0].status).toBe(
    "withheld",
  );
});
test("incomplete streams and quota exhaustion never become complete artifacts", async () => {
  const { f, scope, artifacts, policy } = await setup();
  await expect(artifacts.put(scope, bytes(Buffer.alloc(10)), { ...policy, expectedBytes: 20 })).rejects.toThrow(
    "ARTIFACT_INCOMPLETE",
  );
  await expect(artifacts.put(scope, bytes(Buffer.alloc(10)), { ...policy, maxBytes: 5 })).rejects.toThrow(
    "ARTIFACT_QUOTA",
  );
  expect((await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE status='complete'")).rows[0].n).toBe(
    0,
  );
  f.advance(31 * 86400000);
  await artifacts.expire(f.now());
  await artifacts.expire(f.now());
  expect((await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE status='expired'")).rows[0].n).toBe(
    2,
  );
});
test("revocation during streaming stops subsequent bytes and a storage failure remains explicit", async () => {
  const { f, scope, artifacts, policy } = await setup();
  const body = Buffer.alloc(2 * 1024 * 1024, 1);
  const ref = await artifacts.put(scope, bytes(body), policy);
  const iterator = artifacts.read(scope, ref)[Symbol.asyncIterator]();
  expect((await iterator.next()).value?.length).toBe(1024 * 1024);
  await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
  await expect(iterator.next()).rejects.toThrow("ARTIFACT_WITHHELD");
});
test("disk failure records an incomplete manifest without publishing content", async () => {
  const { f, scope, artifacts, policy } = await setup();
  const files = Object.create(artifacts.files);
  files.writeChunk = async () => {
    throw Error("synthetic disk full");
  };
  const failing = new ArtifactStore(f.store, files);
  await expect(failing.put(scope, bytes(Buffer.alloc(100)), policy)).rejects.toThrow("ARTIFACT_STORAGE");
  expect((await f.pool.query("SELECT status,reason FROM research_artifacts")).rows).toEqual([
    { status: "partial", reason: "ARTIFACT_STORAGE" },
  ]);
});
test("transactional ciphertext rolls back with native intent and materializes idempotently", async () => {
  const { f, scope, artifacts, policy } = await setup();
  const { transaction } = await import("../../src/db.js");
  await expect(
    transaction(f.pool, async (db) => {
      await artifacts.putWithin(scope, Buffer.from("rollback"), policy, db);
      throw Error("ROLLBACK");
    }),
  ).rejects.toThrow("ROLLBACK");
  expect((await f.pool.query("SELECT count(*)::int n FROM research_artifacts")).rows[0].n).toBe(0);
  const ref = await transaction(f.pool, (db) => artifacts.putWithin(scope, Buffer.from("committed"), policy, db));
  expect(await collect(artifacts.read(scope, ref))).toEqual(Buffer.from("committed"));
  expect(await artifacts.materialize()).toBe(1);
  expect(await artifacts.materialize()).toBe(0);
  expect(await collect(artifacts.read(scope, ref))).toEqual(Buffer.from("committed"));
});
