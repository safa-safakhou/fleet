import { isDeepStrictEqual } from "node:util";
import { transaction } from "../db.js";
import { FleetError, safeCode } from "../domain.js";
import type { Store } from "../store.js";
import type { Bindings } from "./bindings.js";
import type { ActionIntent, ActionOutcome, EnvironmentSession } from "./contracts.js";
import type { EnvironmentRegistry } from "./environment-registry.js";
import { assertDeadline, type TaskClaim, type TaskStore } from "./tasks.js";
export class CommandExecutor {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private bindings: Bindings,
    private environments: EnvironmentRegistry,
  ) {}
  async prepare(claim: TaskClaim, intent: ActionIntent): Promise<boolean> {
    if (intent.bindingId !== claim.bindingId) throw new FleetError("BINDING_MISMATCH", true);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(intent.commandId))
      throw new FleetError("INVALID_COMMAND_ID", true);
    const binding = await this.bindings.get(intent.bindingId),
      adapter = this.environments.resolve(binding.environment);
    if (!adapter.schemas.actions.includes(intent.schemaId)) throw new FleetError("UNSUPPORTED_SCHEMA", true);
    return transaction(this.store.pool, async (db) => {
      await this.tasks.check(claim, db);
      const turn = (await db.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [claim.turn.id])).rows[0];
      const old = (await db.query("SELECT * FROM platform_commands WHERE command_id=$1", [intent.commandId])).rows[0];
      if (old) {
        const original = this.store.vault.decrypt<ActionIntent>(
          old.intent_cipher,
          `platform-command:${intent.commandId}`,
        );
        if (old.turn_id !== claim.turn.id || !isDeepStrictEqual(original, intent))
          throw new FleetError("COMMAND_ID_REUSE", true);
        return false;
      }
      if (turn.pending_command) throw new FleetError("COMMAND_PENDING", true);
      const count = (await db.query("SELECT count(*)::int n FROM platform_commands WHERE turn_id=$1", [claim.turn.id]))
        .rows[0].n;
      const cohort = await this.store.cohort(claim.turn.cohortId, db);
      if (!cohort.budget || count >= cohort.budget.maxActionsPerTurn) throw new FleetError("TURN_ACTION_LIMIT", true);
      await this.store.pending(claim.turn, intent.commandId, intent.payload, true, db);
      await db.query(
        "INSERT INTO platform_commands(command_id,turn_id,task_id,binding_id,intent_cipher,state,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'prepared',$6,$6)",
        [
          intent.commandId,
          claim.turn.id,
          claim.taskId,
          claim.bindingId,
          this.store.vault.encrypt(intent, `platform-command:${intent.commandId}`),
          this.store.now(),
        ],
      );
      return true;
    });
  }
  async submit(claim: TaskClaim, intent: ActionIntent): Promise<ActionOutcome> {
    const fresh = await this.prepare(claim, intent);
    if (!fresh) return this.reconcile(claim.turn.id, intent.commandId);
    const binding = await this.bindings.get(claim.bindingId);
    let session: EnvironmentSession | undefined;
    try {
      session = await this.environments.connect(binding);
      const task = await this.tasks.get(claim.taskId);
      if (task.deadline) assertDeadline(task.deadline, (await session.observe({})).environmentTime, this.store.now());
      await this.tasks.check(claim);
      await transaction(this.store.pool, async (db) => {
        await this.tasks.check(claim, db);
        await db.query("UPDATE recovery_operations SET phase='command_dispatched',updated_at=$2 WHERE turn_id=$1", [
          claim.turn.id,
          this.store.now(),
        ]);
        await db.query("UPDATE platform_commands SET state='dispatched',updated_at=$2 WHERE command_id=$1", [
          intent.commandId,
          this.store.now(),
        ]);
      });
      let outcome: ActionOutcome;
      let source: "receipt" | "explicit_rejection" = "receipt";
      try {
        outcome = await session.execute(intent);
      } catch (error) {
        const proven = error instanceof FleetError && error.notDispatched;
        source = proven ? "explicit_rejection" : "receipt";
        outcome = {
          commandId: intent.commandId,
          status: proven ? "rejected" : "unknown",
          code: safeCode(error),
          sourceRefs: [],
        };
      }
      await this.settle(claim.turn.id, outcome, false, source);
      return outcome;
    } finally {
      await session?.close().catch(() => {});
    }
  }
  private async settle(
    turnId: string,
    outcome: ActionOutcome,
    terminal: boolean,
    source: "receipt" | "explicit_rejection" = "receipt",
  ) {
    await transaction(this.store.pool, async (db) => {
      const command = (
        await db.query("SELECT * FROM platform_commands WHERE command_id=$1 AND turn_id=$2 FOR UPDATE", [
          outcome.commandId,
          turnId,
        ])
      ).rows[0];
      if (!command) throw new FleetError("RECEIPT_MISMATCH");
      if (["confirmed", "rejected"].includes(command.state)) return;
      if (["confirmed", "rejected"].includes(outcome.status)) {
        const turn = (await db.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [turnId])).rows[0];
        await this.store.receipt(
          { id: turnId, agentId: turn.agent_id, cohortId: turn.cohort_id },
          { commandId: outcome.commandId, code: outcome.status === "confirmed" ? "COMMITTED" : outcome.code },
          source,
          { environmentOutcome: outcome, notDispatched: source === "explicit_rejection" },
          terminal,
          db,
        );
      }
      await db.query("UPDATE platform_commands SET state=$2,outcome=$3,updated_at=$4 WHERE command_id=$1", [
        outcome.commandId,
        outcome.status,
        outcome,
        this.store.now(),
      ]);
    });
  }
  async reconcile(turnId: string, commandId?: string): Promise<ActionOutcome> {
    const row = (
      await this.store.pool.query(
        "SELECT p.* FROM platform_commands p JOIN turns t ON t.id=p.turn_id WHERE p.turn_id=$1 AND ($2::uuid IS NULL OR p.command_id=$2) ORDER BY (p.command_id=t.pending_command) DESC NULLS LAST,p.created_at DESC LIMIT 1",
        [turnId, commandId ?? null],
      )
    ).rows[0];
    if (!row) throw new FleetError("COMMAND_NOT_FOUND");
    if (["confirmed", "rejected"].includes(row.state)) return row.outcome;
    if (row.state === "prepared")
      return { commandId: row.command_id, status: "pending", code: "COMMAND_PREPARED_NOT_DISPATCHED", sourceRefs: [] };
    const binding = await this.bindings.get(row.binding_id),
      session = await this.environments.connect(binding);
    try {
      const outcome = await session.resolve(row.command_id);
      await this.settle(turnId, outcome, true);
      return outcome;
    } finally {
      await session.close().catch(() => {});
    }
  }
}
