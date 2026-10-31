import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { canonical, Decimal, type RunScope } from "../contracts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import { inheritSources } from "../evidence/derivations.js";
import { ManifestRepository } from "../manifests/repository.js";
import type { StepJournal } from "./steps.js";
export const CheckpointStateSchema = z
  .object({
    workerVersion: z.string().min(1).max(200),
    policyVersion: z.string().min(1).max(200),
    steps: z
      .array(
        z
          .object({
            logicalStepId: z.string().min(1).max(2000),
            operationEpoch: Decimal,
            resultRef: z.object({ id: z.string(), kind: z.string() }).optional(),
          })
          .strict(),
      )
      .max(10000),
    sourceRefs: z.array(z.string().max(2000)).max(10000),
    state: z.record(z.string(), z.unknown()),
  })
  .strict();
export type CheckpointState = z.infer<typeof CheckpointStateSchema>;
export class WorkerCheckpoints {
  constructor(
    readonly store: Store,
    readonly journal: StepJournal,
    readonly capture: CaptureSession,
  ) {}
  async save(scope: RunScope, expectedVersion: string, input: CheckpointState) {
    Decimal.parse(expectedVersion);
    const value = CheckpointStateSchema.parse(input),
      body = Buffer.from(JSON.stringify(value));
    if (body.length > 4 * 1024 * 1024) throw new FleetError("CHECKPOINT_TOO_LARGE", true);
    await this.journal.assertCurrent(scope);
    const policy = await this.capture.artifacts.policy(scope, body.length);
    const manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest);
    return transaction(this.store.pool, async (db) => {
      await this.journal.assertCurrent(scope, db);
      for (const step of value.steps) {
        const saved = (
          await db.query(
            "SELECT original_epoch,result FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2",
            [scope.operationId, step.logicalStepId],
          )
        ).rows[0];
        if (
          !saved ||
          saved.original_epoch !== step.operationEpoch ||
          canonical(saved.result.resultRef ?? null) !== canonical(step.resultRef ?? null)
        )
          throw new FleetError("CHECKPOINT_STEP_MISMATCH", true);
      }
      await db.query("SELECT operation_id FROM research_operations WHERE operation_id=$1 FOR UPDATE", [
        scope.operationId,
      ]);
      const old =
        (
          await db.query(
            "SELECT version::text FROM research_worker_checkpoints WHERE operation_id=$1 ORDER BY version DESC LIMIT 1",
            [scope.operationId],
          )
        ).rows[0]?.version ?? "0";
      if (old !== expectedVersion || BigInt(old) >= 9223372036854775806n)
        throw new FleetError("CHECKPOINT_CONFLICT", true);
      const ref = await this.capture.artifacts.putWithin(scope, body, { ...policy, expectedBytes: body.length }, db),
        id = randomUUID(),
        version = String(BigInt(old) + 1n),
        metadata = { workerVersion: value.workerVersion, policyVersion: value.policyVersion };
      if (manifest.context.policy === "source-complete@1")
        await inheritSources(
          this.store,
          scope,
          ref.id,
          value.steps.flatMap((step) => (step.resultRef ? [step.resultRef.id] : [])),
          db,
        );
      await db.query(
        "INSERT INTO research_worker_checkpoints(id,operation_id,version,scope,worker_version,policy_version,metadata,state_ref,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          scope.operationId,
          version,
          scope,
          value.workerVersion,
          value.policyVersion,
          metadata,
          ref,
          this.store.now(),
        ],
      );
      await this.capture.recorder.append(
        scope,
        { kind: "checkpoint.saved", streamId: "checkpoint", producerKey: id, artifacts: [ref] },
        db,
      );
      return { id, version };
    });
  }
  async load(scope: RunScope) {
    await this.journal.assertCurrent(scope);
    const row = (
      await this.store.pool.query(
        "SELECT id,version::text,metadata,state_ref,scope FROM research_worker_checkpoints WHERE operation_id=$1 ORDER BY version DESC LIMIT 1",
        [scope.operationId],
      )
    ).rows[0];
    if (!row) return null;
    const chunks = [];
    for await (const part of this.capture.artifacts.read(row.scope, row.state_ref)) chunks.push(Buffer.from(part));
    return {
      id: row.id as string,
      version: row.version as string,
      ...CheckpointStateSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
    };
  }
}
