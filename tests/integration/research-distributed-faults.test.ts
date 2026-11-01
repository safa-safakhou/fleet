import { expect, test } from "vitest";
import { WorkerCheckpoints } from "../../src/research/broker/checkpoints.js";
import { StepJournal } from "../../src/research/broker/steps.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { CoverageService } from "../../src/research/evidence/coverage.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("database outage, artifact outage and stale checkpoint preserve obligations with explicit incomplete evidence", async () => {
  const f = await memoryFixture(false);
  try {
    const journal = new StepJournal(f.store, f.tasks),
      checkpoints = new WorkerCheckpoints(f.store, journal, f.capture);
    const state = {
      workerVersion: "fixture@1",
      policyVersion: "fixture@1",
      steps: [],
      sourceRefs: [],
      state: { counter: "9007199254740993" },
    };
    const races = await Promise.allSettled([
      checkpoints.save(f.scope, "0", state),
      checkpoints.save(f.scope, "0", state),
    ]);
    expect(races.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      races.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason.message),
    ).toEqual(["CHECKPOINT_CONFLICT"]);
    expect(await checkpoints.load(f.scope)).toMatchObject({ version: "1", state: { counter: "9007199254740993" } });
    const allocation = await f.store.reserveCall(f.claim.turn);
    await f.store.recordUsage(allocation, null, null);
    const before = (await f.pool.query("SELECT id,status,tokens::text FROM compute_ledger")).rows;
    // A real PostgreSQL statement outage inside a transaction must roll back, never dispatch.
    const { transaction } = await import("../../src/db.js");
    await expect(
      transaction(f.pool, async (db) => {
        await db.query("UPDATE compute_ledger SET tokens=0 WHERE id=$1", [allocation]);
        await db.query("SELECT * FROM synthetic_unavailable_database_relation");
      }),
    ).rejects.toThrow();
    expect((await f.pool.query("SELECT id,status,tokens::text FROM compute_ledger")).rows).toEqual(before);
    const connection = await f.pool.connect();
    connection.on("error", () => {});
    try {
      await connection.query("BEGIN");
      await connection.query("UPDATE compute_ledger SET tokens=0 WHERE id=$1", [allocation]);
      const pid = (await connection.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      await f.pool.query("SELECT pg_terminate_backend($1)", [pid]);
      await expect(connection.query("COMMIT")).rejects.toThrow();
    } finally {
      connection.release(true);
    }
    expect((await f.pool.query("SELECT id,status,tokens::text FROM compute_ledger")).rows).toEqual(before);
    const files = Object.create(f.capture.artifacts.files);
    files.writeChunk = async () => {
      throw Error("synthetic artifact outage");
    };
    const failed = new CaptureSession(f.store, files);
    await expect(
      failed.emit(f.scope, "context.prepared", { text: "synthetic".repeat(8192) }, {}, { required: true }),
    ).rejects.toThrow();
    const coverage = await new CoverageService(f.store).reconcile(f.scope.runId);
    expect(coverage.status).not.toBe("complete");
    expect(coverage.missing).toContainEqual({ kind: "usage.unknown", sourceId: allocation });
    expect((await f.pool.query("SELECT id,status,tokens::text FROM compute_ledger")).rows).toEqual(before);
  } finally {
    await f.close();
  }
});
