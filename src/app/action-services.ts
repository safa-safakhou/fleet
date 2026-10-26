import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import { ActionClaimRepository } from "../modules/action-admission/v1/repository.js";
import { type ActionEffects, ActionEffectsSchema, actionIntentDigest } from "../platform/action-effects.js";
import type { RecipientSpec } from "../platform/architecture.js";
import type {
  ActionIntent,
  ActionOutcome,
  BindingRef,
  DomainTime,
  EnvironmentEvent,
  EnvironmentSession,
} from "../platform/contracts.js";
import type { CommandExecutor } from "../platform/execution.js";
import { launchDigest } from "../platform/launch.js";
import { ParticipantDelivery } from "../platform/participant-delivery.js";
import {
  type SpecialistEnvelope,
  SpecialistEnvelopeSchema,
  type SpecialistScope,
} from "../platform/participant-state.js";
import type { TaskClaim, TaskStore } from "../platform/tasks.js";
import { compareDomainTime } from "../platform/wake-conditions.js";
import type { Store } from "../store.js";
import { SpecialistRepository } from "./participant-services.js";

const inputSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    envelope: SpecialistEnvelopeSchema.omit({ intent: true }),
    intent: z
      .object({
        commandId: z.uuid(),
        bindingId: z.uuid(),
        schemaId: z.string().min(1).max(100),
        payload: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict();
type Options = {
  store: Store;
  tasks: TaskStore;
  commands: CommandExecutor;
  session?: EnvironmentSession;
  claim?: TaskClaim;
  binding: BindingRef;
  specialistId?: string;
  scope?: SpecialistScope;
  quote?(intent: ActionIntent): Promise<ActionEffects>;
  admit?(intent: ActionIntent, effects: ActionEffects): Promise<(db: PoolClient) => Promise<void>>;
  validateIntent?(intent: ActionIntent, effects: ActionEffects): Promise<void>;
  reserveConstraints?(intent: ActionIntent, effects: ActionEffects): Record<string, string>;
  clock?: DomainTime;
  messagesWithin?: (
    db: PoolClient,
    scope: SpecialistScope,
    operationId: string,
    envelope: SpecialistEnvelope,
  ) => Promise<void>;
  resultRecipients?: (event: EnvironmentEvent) => RecipientSpec[];
};
export class ParticipantActions {
  private scope: SpecialistScope;
  private claims: ActionClaimRepository;
  constructor(private options: Options) {
    const { claim, binding, specialistId } = options;
    if ((claim && claim.bindingId !== binding.id) || (options.scope && options.scope.bindingId !== binding.id))
      throw new FleetError("BINDING_MISMATCH", true);
    if (claim && specialistId)
      this.scope = {
        instanceId: `${binding.id}:${claim.profile.id}@${claim.profile.version}`,
        bindingId: binding.id,
        specialistId,
      };
    else if (!claim && options.scope) this.scope = structuredClone(options.scope);
    else throw new FleetError("PARTICIPANT_OPERATION_REQUIRED", true);
    this.claims = new ActionClaimRepository(options.store);
  }
  private async existing(commandId: string) {
    return (
      await this.options.store.pool.query(
        "SELECT * FROM specialist_intents WHERE command_id=$1 AND instance_id=$2 AND binding_id=$3 AND specialist_id=$4",
        [commandId, this.scope.instanceId, this.scope.bindingId, this.scope.specialistId],
      )
    ).rows[0];
  }
  async acceptAndDispatch(raw: unknown): Promise<{ version: number; accepted: boolean; outcome?: ActionOutcome }> {
    if (!this.options.claim || !this.options.quote || !this.options.clock)
      throw new FleetError("PARTICIPANT_OPERATION_REQUIRED", true);
    const input = inputSchema.parse(raw),
      { store, tasks, commands, claim } = this.options;
    if (input.intent.bindingId !== this.scope.bindingId) throw new FleetError("BINDING_MISMATCH", true);
    const inputDigest = launchDigest(input),
      previous = await this.existing(input.intent.commandId);
    if (previous) {
      if (previous.input_digest !== inputDigest || previous.turn_id !== claim.turn.id)
        throw new FleetError("IDEMPOTENCY_CONFLICT", true);
      return { version: previous.state_version, accepted: true, outcome: await this.reconcile(input.intent.commandId) };
    }
    await tasks.check(claim);
    const state = await new SpecialistRepository(store, this.scope, (db) => tasks.check(claim, db)).load(this.scope);
    if (state.version !== input.expectedVersion) throw new FleetError("STALE_STATE_VERSION", true);
    const quote = this.options.quote;
    const effects = ActionEffectsSchema.parse(await quote(input.intent));
    if (effects.intentDigest !== actionIntentDigest(input.intent)) throw new FleetError("EFFECT_INTENT_MISMATCH", true);
    if (!state.charter.allowedActions.includes(effects.actionKey))
      throw new FleetError("SPECIALIST_ACTION_FORBIDDEN", true);
    const currentTime =
      effects.validUntil.clockId === "utc" ? { clockId: "utc", value: store.now().toISOString() } : this.options.clock;
    const comparison = compareDomainTime(effects.validUntil, currentTime);
    if (comparison === undefined || comparison >= 0) throw new FleetError("ACTION_QUOTE_EXPIRED", true);
    await this.options.validateIntent?.(input.intent, effects);
    const admitWithin = await this.options.admit?.(input.intent, effects);
    const intent: ActionIntent = {
      ...input.intent,
      guard: {
        schemaVersion: "fleet.action-effects-guard.v1",
        expectedRevision: effects.revision,
        expectedEffects: effects,
        ...(this.options.reserveConstraints
          ? { reserveConstraints: this.options.reserveConstraints(input.intent, effects) }
          : {}),
      },
    };
    const repository = new SpecialistRepository(
      store,
      this.scope,
      (db) => tasks.check(claim, db),
      this.options.messagesWithin,
      async (db, scope, _operationId, accepted) => {
        if (launchDigest(accepted) !== launchDigest(intent)) throw new FleetError("EFFECT_INTENT_MISMATCH", true);
        await admitWithin?.(db);
        await this.claims.reserveWithin(db, scope, intent, effects);
        await commands.prepare(claim, intent, db);
        await db.query(
          "INSERT INTO specialist_intents(command_id,instance_id,binding_id,specialist_id,turn_id,task_id,input_digest,effects_cipher,state_version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)",
          [
            intent.commandId,
            scope.instanceId,
            scope.bindingId,
            scope.specialistId,
            claim.turn.id,
            claim.taskId,
            inputDigest,
            store.vault.encrypt(
              effects,
              `specialist-effects:${scope.instanceId}:${scope.bindingId}:${intent.commandId}`,
            ),
            input.expectedVersion + 1,
            store.now(),
          ],
        );
      },
    );
    const result = await repository.accept(this.scope, {
      expectedVersion: input.expectedVersion,
      operationId: claim.turn.id,
      envelope: { ...input.envelope, intent },
    });
    const outcome = await commands.dispatchPrepared(claim, intent, this.options.session);
    await this.record(intent.commandId, outcome);
    return { ...result, outcome };
  }
  async reconcile(commandId: string): Promise<ActionOutcome> {
    const row = await this.existing(commandId);
    if (!row) throw new FleetError("FOREIGN_SPECIALIST_COMMAND");
    const outcome = await this.options.commands.reconcile(row.turn_id, commandId);
    await this.record(commandId, outcome);
    return outcome;
  }
  async expirePrepared(commandId: string): Promise<ActionOutcome> {
    const row = await this.existing(commandId),
      { store, commands } = this.options;
    if (!row) throw new FleetError("FOREIGN_SPECIALIST_COMMAND");
    const claim = (await store.pool.query("SELECT valid_until FROM specialist_claims WHERE command_id=$1", [commandId]))
      .rows[0];
    const at = claim?.valid_until as DomainTime | undefined;
    const currentTime =
      at?.clockId === "utc" ? { clockId: "utc", value: store.now().toISOString() } : this.options.clock;
    if (at && (compareDomainTime(at, currentTime) ?? -1) >= 0) {
      const rejected = await commands.rejectPrepared(row.turn_id, commandId, "ACTION_QUOTE_EXPIRED");
      if (rejected) {
        await this.record(commandId, rejected);
        return rejected;
      }
    }
    return this.reconcile(commandId);
  }
  private async record(commandId: string, outcome: ActionOutcome) {
    const { store, tasks, binding } = this.options;
    await transaction(store.pool, async (db) => {
      await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [binding.id]);
      const row = (
        await db.query(
          "SELECT * FROM specialist_intents WHERE command_id=$1 AND instance_id=$2 AND binding_id=$3 AND specialist_id=$4 FOR UPDATE",
          [commandId, this.scope.instanceId, this.scope.bindingId, this.scope.specialistId],
        )
      ).rows[0];
      if (!row || outcome.commandId !== commandId) throw new FleetError("RECEIPT_MISMATCH");
      const terminal = ["confirmed", "rejected"].includes(outcome.status);
      await db.query("UPDATE specialist_intents SET status=$2,updated_at=$3 WHERE command_id=$1", [
        commandId,
        terminal ? "settled" : "uncertain",
        store.now(),
      ]);
      if (!terminal) return;
      await db.query("UPDATE specialist_claims SET status='released',updated_at=$2 WHERE command_id=$1", [
        commandId,
        store.now(),
      ]);
      const inserted = await db.query(
        "INSERT INTO specialist_action_results VALUES($1,$2,$3,$4,1,$5,$6) ON CONFLICT DO NOTHING RETURNING command_id",
        [commandId, this.scope.instanceId, binding.id, this.scope.specialistId, outcome, store.now()],
      );
      if (!inserted.rowCount) return;
      const event: EnvironmentEvent = {
        id: `command-result:${commandId}:1`,
        type: "command_result",
        sourceRef: `command:${commandId}`,
        observedAt: store.now().toISOString(),
        environmentTime: { clockId: "utc", value: store.now().toISOString() },
        metadata: {
          category: "result",
          groupRef: commandId,
          outcome,
          receiptOnly: true,
          fulfillmentNotEstablished: true,
        },
      };
      const recipients: RecipientSpec[] = [
        { participantId: this.scope.specialistId, subscriptionVersion: "1", taskKey: `result:${commandId}` },
        ...(this.options.resultRecipients?.(event) ?? []),
      ];
      await new ParticipantDelivery(tasks).ingestWithin(db, binding, event, [
        ...new Map(recipients.map((r) => [r.participantId, r])).values(),
      ]);
    });
  }
}
