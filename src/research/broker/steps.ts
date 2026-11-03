import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { TaskAuthority, TaskClaim, TaskStore } from "../../platform/tasks.js";
import type { Store } from "../../store.js";
import {
  type BrokerResult,
  canonical,
  KeySchema,
  type OperationKey,
  ResultSchema,
  type RunScope,
  ScopeSchema,
} from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";

const fail = (code: string): never => {
  throw new FleetError(code, true);
};
/** Kernel-only journal. Neither open nor complete is a worker RPC or approval surface. */
export class StepJournal {
  constructor(
    private store: Store,
    private tasks: TaskStore,
  ) {}
  async open(
    claim: TaskClaim,
    runId: string,
    operationId: string,
    manifestDigest: string,
    client?: PoolClient,
  ): Promise<RunScope> {
    const prepare = async (db: PoolClient) => {
      const manifest = await new ManifestRepository(db).load(manifestDigest);
      if (
        manifest.environment.bindingId !== claim.bindingId ||
        manifest.profile.id !== claim.profile.id ||
        manifest.profile.version !== claim.profile.version
      )
        fail("OPERATION_SCOPE_MISMATCH");
      const participantId = (await db.query("SELECT participant_id FROM platform_tasks WHERE id=$1", [claim.taskId]))
        .rows[0]?.participant_id;
      const scope = ScopeSchema.parse({
        runId,
        operationId,
        manifestDigest,
        agentId: claim.turn.agentId,
        bindingId: claim.bindingId,
        turnId: claim.turn.id,
        taskId: claim.taskId,
        operationEpoch: String(claim.fence),
        ...(participantId ? { participantId } : {}),
      });
      const authority: TaskAuthority = {
        taskId: claim.taskId,
        bindingId: claim.bindingId,
        profile: claim.profile,
        fence: claim.fence,
        turn: {
          id: claim.turn.id,
          agentId: claim.turn.agentId,
          cohortId: claim.turn.cohortId,
          generation: claim.turn.generation,
          fence: claim.turn.fence,
          worker: claim.turn.worker,
        },
      };
      await this.tasks.check(authority, db);
      await db.query(
        "INSERT INTO research_operations(operation_id,task_id,scope,authority,manifest_digest) VALUES($1,$2,$3,$4,$5) ON CONFLICT(operation_id) DO NOTHING",
        [operationId, claim.taskId, scope, authority, manifestDigest],
      );
      const old = (
        await db.query("SELECT scope FROM research_operations WHERE operation_id=$1 FOR UPDATE", [operationId])
      ).rows[0].scope as RunScope;
      const stable = (s: RunScope) => ({ ...s, turnId: "", operationEpoch: "" });
      if (canonical(stable(old)) !== canonical(stable(scope))) fail("OPERATION_SCOPE_MISMATCH");
      if (BigInt(old.operationEpoch) > BigInt(scope.operationEpoch)) fail("TASK_FENCED");
      if (old.operationEpoch === scope.operationEpoch && old.turnId !== scope.turnId) fail("OPERATION_SCOPE_MISMATCH");
      await db.query("UPDATE research_operations SET scope=$2,authority=$3 WHERE operation_id=$1", [
        operationId,
        scope,
        authority,
      ]);
      return scope;
    };
    return client ? prepare(client) : transaction(this.store.pool, prepare);
  }
  private async current(db: PoolClient, scope: RunScope): Promise<void> {
    ScopeSchema.parse(scope);
    const row = (
      await db.query("SELECT scope,authority FROM research_operations WHERE operation_id=$1 FOR UPDATE", [
        scope.operationId,
      ])
    ).rows[0];
    if (!row || canonical(row.scope) !== canonical(scope)) fail("OPERATION_SCOPE_MISMATCH");
    await this.tasks.check(row.authority as TaskAuthority, db);
  }
  async assertCurrent(scope: RunScope, client?: PoolClient): Promise<void> {
    return client ? this.current(client, scope) : transaction(this.store.pool, (db) => this.current(db, scope));
  }
  async begin(
    scope: RunScope,
    key: OperationKey,
    payloadDigest: string,
    kind?: "model" | "read" | "proposal" | "port",
  ): Promise<{ disposition: "new" | "existing"; result: BrokerResult }> {
    KeySchema.parse(key);
    if (key.operationId !== scope.operationId || !/^[a-f0-9]{64}$/.test(payloadDigest)) fail("STEP_INPUT_CONFLICT");
    return transaction(this.store.pool, async (db) => {
      await this.current(db, scope);
      const old = (
        await db.query("SELECT * FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2", [
          key.operationId,
          key.logicalStepId,
        ])
      ).rows[0];
      if (old) {
        if (old.payload_digest !== payloadDigest || old.original_epoch !== key.operationEpoch)
          fail("STEP_INPUT_CONFLICT");
        return { disposition: "existing", result: ResultSchema.parse(old.result) };
      }
      if (key.operationEpoch !== scope.operationEpoch) fail("TASK_FENCED");
      if (
        (
          await db.query(
            "SELECT 1 FROM research_steps WHERE operation_id=$1 AND result->>'status' IN ('pending','unknown') LIMIT 1",
            [key.operationId],
          )
        ).rowCount
      )
        fail("OPERATION_UNRESOLVED");
      const result: BrokerResult = { status: "pending", usage: null };
      await db.query(
        "INSERT INTO research_steps(operation_id,logical_step_id,original_epoch,payload_digest,result,kind) VALUES($1,$2,$3,$4,$5,$6)",
        [key.operationId, key.logicalStepId, key.operationEpoch, payloadDigest, result, kind ?? null],
      );
      return { disposition: "new", result };
    });
  }
  async attach(
    scope: RunScope,
    key: OperationKey,
    identity: { allocationId?: string; commandId?: string },
    db: PoolClient,
  ) {
    const row = (
      await db.query(
        "SELECT original_epoch,result FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2 FOR UPDATE",
        [key.operationId, key.logicalStepId],
      )
    ).rows[0];
    if (!row || key.operationId !== scope.operationId || row.original_epoch !== key.operationEpoch)
      fail("STEP_NOT_FOUND");
    const old = ResultSchema.parse(row.result);
    if (old.status !== "pending") fail("STEP_RESULT_CONFLICT");
    for (const field of ["allocationId", "commandId"] as const)
      if (old[field] && old[field] !== identity[field]) fail("STEP_RESULT_CONFLICT");
    await db.query("UPDATE research_steps SET result=$3 WHERE operation_id=$1 AND logical_step_id=$2", [
      key.operationId,
      key.logicalStepId,
      { ...old, ...identity },
    ]);
  }
  async lookup(scope: RunScope, key: OperationKey): Promise<BrokerResult> {
    KeySchema.parse(key);
    if (key.operationId !== scope.operationId) fail("OPERATION_SCOPE_MISMATCH");
    return transaction(this.store.pool, async (db) => {
      await this.current(db, scope);
      const row = (
        await db.query(
          "SELECT result,original_epoch FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2",
          [key.operationId, key.logicalStepId],
        )
      ).rows[0];
      if (!row || row.original_epoch !== key.operationEpoch) fail("STEP_NOT_FOUND");
      return ResultSchema.parse(row.result);
    });
  }
  /** Called only by trusted receipt/provider settlement, including late original results. Never by workers. */
  async complete(scope: RunScope, key: OperationKey, result: BrokerResult, client?: PoolClient): Promise<void> {
    ScopeSchema.parse(scope);
    KeySchema.parse(key);
    ResultSchema.parse(result);
    if (scope.operationId !== key.operationId) fail("OPERATION_SCOPE_MISMATCH");
    if (result.status === "pending") fail("STEP_RESULT_CONFLICT");
    const write = async (db: PoolClient) => {
      const op = (
        await db.query("SELECT scope FROM research_operations WHERE operation_id=$1 FOR UPDATE", [key.operationId])
      ).rows[0];
      const stable = (s: RunScope) => ({ ...s, operationEpoch: "", turnId: "" });
      if (!op || canonical(stable(op.scope)) !== canonical(stable(scope))) fail("OPERATION_SCOPE_MISMATCH");
      const old = (
        await db.query(
          "SELECT result,original_epoch FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2 FOR UPDATE",
          [key.operationId, key.logicalStepId],
        )
      ).rows[0];
      if (!old || old.original_epoch !== key.operationEpoch) fail("STEP_NOT_FOUND");
      const previous = ResultSchema.parse(old.result);
      if (canonical(previous) === canonical(result)) return;
      if (["completed", "not_dispatched"].includes(previous.status)) fail("STEP_RESULT_CONFLICT");
      if (previous.status === "unknown" && previous.allocationId) {
        if (!/^[a-f0-9-]{36}$/.test(previous.allocationId)) fail("STEP_RESULT_CONFLICT");
        const native = (
          await db.query(
            "SELECT l.status,l.input_tokens::text,l.output_tokens::text FROM compute_ledger l JOIN platform_task_claims c ON c.turn_id=l.turn_id WHERE l.id=$1 AND c.task_id=$2 AND c.fence::text=$3",
            [previous.allocationId, scope.taskId, key.operationEpoch],
          )
        ).rows[0];
        if (
          result.status !== "completed" ||
          native?.status !== "reported" ||
          result.usage?.inputTokens !== native.input_tokens ||
          result.usage?.outputTokens !== native.output_tokens
        )
          fail("STEP_RESULT_CONFLICT");
      } else if (previous.status === "unknown" && !(previous.commandId && result.status === "completed"))
        fail("STEP_RESULT_CONFLICT");
      for (const k of ["allocationId", "commandId"] as const)
        if (previous[k] && result[k] !== previous[k]) fail("STEP_RESULT_CONFLICT");
      if (previous.status === "unknown" && result.status === "not_dispatched") fail("STEP_RESULT_CONFLICT");
      await db.query("UPDATE research_steps SET result=$3 WHERE operation_id=$1 AND logical_step_id=$2", [
        key.operationId,
        key.logicalStepId,
        result,
      ]);
    };
    if (client) await write(client);
    else await transaction(this.store.pool, write);
  }
}
