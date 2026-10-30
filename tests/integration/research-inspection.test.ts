import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { transaction } from "../../src/db.js";
import { ArtifactStore, bytes } from "../../src/research/evidence/artifacts.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { RunInspection } from "../../src/research/evidence/inspection.js";
import { EvidenceRecorder } from "../../src/research/evidence/recorder.js";
import { scopeForTurn } from "../../src/research/evidence/repository.js";
import { buildServer } from "../../src/server.js";
import { researchFixture } from "../research-helpers.js";

test("paginates_snapshot_without_loss and reauthorizes private chunks", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-inspection-"));
  try {
    const recorder = new EvidenceRecorder(f.store),
      scope = await scopeForTurn(f.store, f.claim.turn.id),
      sessionHash = randomUUID();
    await f.pool.query("INSERT INTO operator_sessions(hash,csrf,expires_at) VALUES($1,'fixture',$2)", [
      sessionHash,
      new Date(f.now().getTime() + 3600000),
    ]);
    const principal = { sessionHash, agentIds: [scope.agentId] },
      artifacts = new ArtifactStore(f.store, new ArtifactFilesystem(root));
    await recorder.append(scope, { kind: "run.started", streamId: "run", producerKey: "begin" });
    const raw = Buffer.alloc(2 * 1024 * 1024 + 17, 5),
      ref = await artifacts.put(scope, bytes(raw), { ...(await artifacts.policy(scope)), expectedBytes: raw.length });
    await transaction(f.pool, async (db) => {
      for (let i = 0; i < 1204; i++)
        await recorder.append(
          scope,
          {
            kind: "observation.record",
            streamId: `stream-${i % 3}`,
            producerKey: `event-${i}`,
            occurredAt: "2026-10-30T00:00:00.000Z",
            artifacts: i === 0 ? [ref] : [],
          },
          db,
        );
    });
    const inspect = new RunInspection(f.store, artifacts),
      snap = await inspect.snapshot(scope.runId, principal);
    expect(snap.total).toBe(1205);
    await recorder.append(scope, { kind: "run.finished", streamId: "run", producerKey: "later" });
    let cursor: string | undefined;
    const ids = new Set<string>();
    do {
      const page = await inspect.events(scope.runId, principal, { snapshotId: snap.id, cursor, limit: 500 });
      expect(page.total).toBe(1205);
      expect(page.events.length).toBeLessThanOrEqual(500);
      page.events.forEach((e) => {
        expect(ids.has(e.id)).toBe(false);
        ids.add(e.id);
      });
      cursor = page.nextCursor ?? undefined;
      if (cursor)
        await expect(
          inspect.events(scope.runId, principal, { snapshotId: snap.id, cursor: cursor + "x", limit: 500 }),
        ).rejects.toThrow("EVIDENCE_CURSOR_INVALID");
    } while (cursor);
    expect(ids.size).toBe(1205);
    await expect(
      inspect.events(scope.runId, { sessionHash, agentIds: [randomUUID()] }, { snapshotId: snap.id }),
    ).rejects.toThrow("EVIDENCE_FORBIDDEN");
    const stream = inspect.artifact(scope.runId, principal, ref.id, snap.id)[Symbol.asyncIterator]();
    expect((await stream.next()).value?.length).toBe(1024 * 1024);
    await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [f.group.id]);
    await expect(stream.next()).rejects.toThrow("ARTIFACT_WITHHELD");
    await expect(inspect.events(scope.runId, principal, { snapshotId: snap.id })).rejects.toThrow("EVIDENCE_WITHHELD");
    await f.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [f.group.id]);
    await expect(inspect.events(scope.runId, principal, { snapshotId: snap.id })).rejects.toThrow("EVIDENCE_WITHHELD");
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("research routes use operator authentication and never decrypt list bodies", async () => {
  const f = await researchFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-routes-"));
  const inspect = new RunInspection(f.store, new ArtifactStore(f.store, new ArtifactFilesystem(root)));
  const app = buildServer({
    store: f.store,
    broker: {} as never,
    engine: {} as never,
    origin: "http://fixture.invalid",
    operatorSecret: "x".repeat(32),
    liveAllowed: false,
    researchInspection: inspect,
  });
  try {
    const scope = await scopeForTurn(f.store, f.claim.turn.id);
    await new EvidenceRecorder(f.store).append(scope, {
      kind: "run.started",
      streamId: "run",
      producerKey: "route-start",
    });
    const url = `/api/research/runs/${scope.runId}`;
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "http://fixture.invalid" },
      payload: { password: "x".repeat(32) },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const result = await app.inject({ method: "GET", url, headers: { cookie } });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    const snap = result.json();
    const page = await app.inject({ method: "GET", url: `${url}/events?snapshotId=${snap.id}`, headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expect(page.json().total).toBe(1);
    expect(
      (await app.inject({ method: "GET", url: `${url}/events?snapshotId=${snap.id}&limit=501`, headers: { cookie } }))
        .statusCode,
    ).toBe(400);
    await app.inject({
      method: "POST",
      url: "/api/logout",
      headers: { cookie, origin: "http://fixture.invalid", "x-csrf-token": login.json().csrf },
    });
    expect(
      (await app.inject({ method: "GET", url: `${url}/coverage?snapshotId=${snap.id}`, headers: { cookie } }))
        .statusCode,
    ).toBe(401);
  } finally {
    await app.close();
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
