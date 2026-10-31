import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { withEffectHooks } from "../../src/platform/effect-context.js";
import { WorkerCheckpoints } from "../../src/research/broker/checkpoints.js";
import { StepJournal } from "../../src/research/broker/steps.js";
import { digest } from "../../src/research/contracts.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { RuntimeReconciler } from "../../src/research/orchestration/reconcile.js";
import { assertOwnedFixture } from "../architecture-fixture.js";
import { crashPoints } from "../fixtures/research/crash-points.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
async function setup(run?: (claim: any) => Promise<void>) {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture();
  const root = await mkdtemp(join(tmpdir(), "frr-")),
    capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
  f.store.observation = capture;
  await f.store.consent(f.group.id, true);
  close = async () => {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  };
  const task = await f.enqueue();
  await f.store.setState(f.group.id, "paused", false);
  const input = manifestInput();
  input.profile = task.profile;
  input.environment.bindingId = task.bindingId;
  const m = compileManifest(input, capability);
  await new ManifestRepository(f.pool).save(m.manifest);
  const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, run ?? (async () => {}));
  await owner.enroll(task.id, m.digest);
  await f.store.setState(f.group.id, "running", true);
  const ref = await owner.reference(
    (await f.pool.query("SELECT id FROM research_task_outbox WHERE kind='wake'")).rows[0].id,
  );
  return { ...f, capture, task, owner, ref, manifest: m.digest };
}
test("cancel before dispatch is durable, idempotent and needs no worker", async () => {
  const f = await setup();
  await f.owner.requestStop(f.task.id);
  await f.owner.requestStop(f.task.id);
  const r = new RuntimeReconciler(f.store, f.tasks, f.owner);
  expect(await r.inspect(f.task.id)).toMatchObject({
    phase: "cancelled",
    stop: { requested: true, fenced: true, acknowledged: true },
    reviewRequired: false,
  });
  await f.owner.execute(f.ref);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
});
test.each(crashPoints)("crash_at_every_dispatch_boundary: %s", async (point) => {
  let claim: any;
  const f = await setup(async (c) => {
    claim = c;
    throw new Error("synthetic crash");
  });
  await f.owner.execute(f.ref);
  const journal = new StepJournal(f.store, f.tasks),
    scope = await journal.open(claim, "recovery-run", "recovery-op", f.manifest),
    key = { operationId: scope.operationId, operationEpoch: scope.operationEpoch, logicalStepId: "model:1" };
  if (point !== "before_reserve") {
    await journal.begin(scope, key, digest({ point }), "model");
    const id = await f.store.reserveCall(claim.turn);
    await f.pool.query("UPDATE research_steps SET result=$3 WHERE operation_id=$1 AND logical_step_id=$2", [
      scope.operationId,
      key.logicalStepId,
      { status: "pending", usage: null, allocationId: id },
    ]);
    if (["provider_result", "worker_checkpoint", "pact_acceptance", "pact_receipt", "task_ack"].includes(point))
      await f.store.recordUsage(id, 7, 8);
    else if (point === "provider_dispatch") await f.store.recordUsage(id, null, null);
  }
  let commandId: string | undefined, commands: any;
  if (["pact_acceptance", "pact_receipt", "task_ack"].includes(point)) {
    const model = await journal.lookup(scope, key);
    const native = (
      await f.pool.query("SELECT input_tokens::text,output_tokens::text FROM compute_ledger WHERE id=$1", [
        model.allocationId,
      ])
    ).rows[0];
    await journal.complete(scope, key, {
      ...model,
      status: "completed",
      usage: { inputTokens: native.input_tokens, outputTokens: native.output_tokens },
    });
    const actionKey = { ...key, logicalStepId: "proposal:2" };
    await journal.begin(scope, actionKey, digest({ action: point }), "proposal");
    commands = f.host({
      decide: async () => {
        throw new Error("unused");
      },
    }).commands;
    commandId = randomUUID();
    if (point === "pact_acceptance") {
      const connect = f.board.adapter.connect;
      f.board.adapter.connect = async (binding) => {
        const session = await connect(binding);
        return {
          ...session,
          execute: async (intent) => {
            await session.execute(intent);
            throw new Error("lost reply after acceptance");
          },
        };
      };
    }
    const result = await withEffectHooks(
      { command: (id, db) => journal.attach(scope, actionKey, { commandId: id }, db) },
      () =>
        commands.submit(claim, {
          commandId,
          bindingId: claim.bindingId,
          schemaId: "board.move.v1",
          payload: { to: "a4" },
        }),
    );
    if (point === "pact_acceptance")
      await journal.complete(scope, actionKey, { status: "unknown", commandId, usage: null });
    if (point === "task_ack") await f.store.finish(claim.turn, "WAIT");
  }
  await f.owner.requestStop(f.task.id);
  await expect(journal.begin(scope, { ...key, logicalStepId: "model:2" }, digest({}))).rejects.toThrow("TASK_FENCED");
  if (point === "pact_acceptance") await commands.reconcile(claim.turn.id, commandId);
  const reconciler = new RuntimeReconciler(f.store, f.tasks, f.owner),
    a = await reconciler.reconcileKnown(f.task.id),
    b = await reconciler.reconcileKnown(f.task.id);
  expect(a).toEqual(b);
  const allocations = (await f.pool.query("SELECT id,status,tokens::text FROM compute_ledger")).rows;
  expect(allocations.length).toBe(point === "before_reserve" ? 0 : 1);
  if (point === "provider_dispatch") expect(allocations[0]).toMatchObject({ status: "unknown", tokens: "40000" });
  expect(f.board.executions).toBe(["pact_acceptance", "pact_receipt", "task_ack"].includes(point) ? 1 : 0);
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM platform_task_claims WHERE task_id=$1", [f.task.id])).rows[0].n,
  ).toBe(1);
});

test("stop during provider call settles the original known late usage and blocks every new effect", async () => {
  const started = deferred(),
    reply = deferred();
  let claim: any,
    scope: any,
    key: any,
    allocation: string | undefined,
    calls = 0;
  const f = await setup(async (c) => {
    claim = c;
    const journal = new StepJournal(f.store, f.tasks);
    scope = await journal.open(c, "late-run", "late-op", f.manifest);
    key = { operationId: scope.operationId, operationEpoch: scope.operationEpoch, logicalStepId: "model:1" };
    await f.capture.recorder.append(scope, { kind: "task.received", streamId: "fixture", producerKey: "scope" });
    await journal.begin(scope, key, digest({ late: true }), "model");
    const { withEffectHooks } = await import("../../src/platform/effect-context.js");
    const h = f.host({
      decide: async () => {
        calls++;
        started.resolve();
        await reply.promise;
        return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
      },
    });
    try {
      await withEffectHooks(
        {
          allocation: async (id, db) => {
            allocation = id;
            await journal.attach(scope, key, { allocationId: id }, db);
          },
        },
        () => h.admission.decideWithFeedback(c, f.request(), { maxAttempts: 1, validate: () => null }),
      );
    } finally {
      await f.store.finish(c.turn, "OPERATION_STOPPED");
    }
  });
  const executing = f.owner.execute(f.ref);
  await started.promise;
  await f.enqueue(f.group.bindings[1], "unrelated", "source:unrelated");
  const unrelated = await f.claim();
  await f.owner.requestStop(f.task.id);
  const r = new RuntimeReconciler(f.store, f.tasks, f.owner);
  expect(await r.inspect(f.task.id)).toMatchObject({ stop: { requested: true, fenced: true, acknowledged: false } });
  await expect(f.tasks.check(unrelated)).resolves.toBeUndefined();
  reply.resolve();
  await executing;
  await expect(f.tasks.check(unrelated)).resolves.toBeUndefined();
  await f.store.finish(unrelated.turn, "WAIT");
  expect(
    (
      await f.pool.query("SELECT status,input_tokens::text,output_tokens::text FROM compute_ledger WHERE id=$1", [
        allocation,
      ])
    ).rows[0],
  ).toEqual({ status: "reported", input_tokens: "7", output_tokens: "8" });
  await expect(
    new StepJournal(f.store, f.tasks).begin(scope, { ...key, logicalStepId: "model:2" }, digest({})),
  ).rejects.toThrow("TASK_FENCED");
  expect(await r.reconcileKnown(f.task.id)).toMatchObject({
    phase: "cancelled",
    stop: { acknowledged: true },
    unknownUsage: [],
  });
  const scopes = (
    await f.pool.query(
      "SELECT DISTINCT event->'scope'->>'runId' run FROM research_events WHERE event->>'kind'='usage.settled'",
    )
  ).rows;
  expect(scopes).toEqual([{ run: "late-run" }]);
  expect(calls).toBe(1);
  expect(f.board.executions).toBe(0);
});
