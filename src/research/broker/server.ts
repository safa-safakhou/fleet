import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../db.js";
import { FleetError, safeCode } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import { withEffectHooks } from "../../platform/effect-context.js";
import type { ScopedServices } from "../../platform/engine-context.js";
import type { TaskStore } from "../../platform/tasks.js";
import type { Store } from "../../store.js";
import { type BrokerResult, canonical, digest, type OperationKey, type RunScope } from "../contracts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import { ManifestRepository } from "../manifests/repository.js";
import { type CheckpointState, WorkerCheckpoints } from "./checkpoints.js";
import { validateBrokerAction } from "./game.js";
import {
  type DecisionProposal,
  GameQuerySchema,
  ModelRequestSchema,
  ProposalSchema,
  type ResearchModelRequest,
} from "./model.js";
import { type WorkerSession, WorkerSessions } from "./session.js";
import { StepJournal } from "./steps.js";

export {
  type DecisionProposal,
  GameQuerySchema,
  ModelRequestSchema,
  ProposalSchema,
  type ResearchModelRequest,
} from "./model.js";

const JsonObject = z.record(z.string(), z.unknown());
export function commandFor(key: OperationKey) {
  const value = createHash("sha256")
    .update(`fleet-research-command/v1:${key.operationId}:${key.logicalStepId}`)
    .digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}
export class ResearchBroker {
  readonly journal: StepJournal;
  readonly sessions: WorkerSessions;
  readonly checkpoints: WorkerCheckpoints;
  constructor(
    readonly store: Store,
    readonly tasks: TaskStore,
    readonly capture: CaptureSession,
    private admission: () => Promise<void> = async () => {},
  ) {
    this.journal = new StepJournal(store, tasks);
    this.sessions = new WorkerSessions(store, this.journal);
    this.checkpoints = new WorkerCheckpoints(store, this.journal, capture);
  }
  async open(
    scope: RunScope,
    services: ScopedServices,
    roleId: string,
    signal: AbortSignal,
    observation?: Observation,
  ) {
    const manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest);
    if (
      manifest.model.route !== services.configuration.model.route ||
      manifest.model.model !== services.configuration.model.model
    )
      throw new FleetError("CAPABILITY_CHANGED", true);
    await this.capture.recorder.append(scope, {
      kind: "task.received",
      streamId: "worker",
      producerKey: `session-scope:${scope.operationId}:${scope.operationEpoch}`,
    });
    return this.sessions.open(scope, services, roleId, signal, observation);
  }
  authenticate(token: string) {
    return this.sessions.authenticate(token);
  }
  stop(id: string) {
    return this.sessions.stop(id);
  }
  async requestModel(
    session: WorkerSession,
    scope: RunScope,
    key: OperationKey,
    raw: ResearchModelRequest,
  ): Promise<BrokerResult> {
    const ctx = await this.sessions.assert(session, scope),
      request = ModelRequestSchema.parse(raw),
      manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest),
      budget = ctx.ports.services.configuration.budget;
    if (
      request.maxOutputTokens > Math.min(budget.maxOutputTokens, manifest.model.parameters.maxOutputTokens) ||
      Buffer.byteLength(canonical(request)) > Math.min(budget.inputByteLimit, manifest.context.maxBytes)
    )
      throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
    const requestBody = {
      messages: request.messages,
      schema: request.schema,
      maxOutputTokens: request.maxOutputTokens,
      signal: ctx.ports.signal,
      ...(ctx.authority === "advisory" || request.purpose === "helper"
        ? { stage: { kind: "worker" as const, retryReserveCalls: 0 } }
        : {}),
    };
    return this.step(session, scope, key, "model", request, async (mark) => {
      const used = (
        await this.store.pool.query(
          "SELECT count(*)::int calls,coalesce(sum(l.tokens),0)::text tokens FROM research_steps s JOIN compute_ledger l ON l.id::text=s.result->>'allocationId' WHERE s.operation_id=$1",
          [scope.operationId],
        )
      ).rows[0];
      if (
        BigInt(used.calls) >= BigInt(manifest.limits.calls) ||
        BigInt(used.tokens) + BigInt(budget.perCallTokenLimit) > BigInt(manifest.limits.tokens)
      )
        throw new FleetError("RESEARCH_BUDGET_EXHAUSTED", true);
      const decide = ctx.ports.services.model.decideWithFeedback;
      if (!decide) throw new FleetError("SINGLE_ATTEMPT_MODEL_REQUIRED", true);
      mark();
      const out = await decide(requestBody, { maxAttempts: 1, validate: () => null });
      if (!out.result) throw new FleetError("MODEL_RESULT_UNAVAILABLE", true);
      const value = out.result;
      const row = (
        await this.store.pool.query("SELECT result FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2", [
          scope.operationId,
          key.logicalStepId,
        ])
      ).rows[0];
      const status = value.inputTokens === null || value.outputTokens === null ? "unknown" : "completed";
      const usage = {
        inputTokens: value.inputTokens === null ? null : String(value.inputTokens),
        outputTokens: value.outputTokens === null ? null : String(value.outputTokens),
      };
      return this.record(scope, key, { status, allocationId: row.result.allocationId, usage }, { ...value, usage });
    });
  }
  async readGame(session: WorkerSession, scope: RunScope, key: OperationKey, raw: z.infer<typeof GameQuerySchema>) {
    const ctx = await this.sessions.assert(session, scope),
      query = GameQuerySchema.parse(raw),
      manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest);
    if (!manifest.tools.includes(query.tool)) throw new FleetError("TOOL_UNSUPPORTED", true);
    return this.step(session, scope, key, "read", query, async (mark) => {
      mark();
      const result = await ctx.ports.services.observe({ tool: query.tool, args: query.arguments });
      ctx.ports.observation = result;
      return this.record(scope, key, { status: "completed", usage: null }, result);
    });
  }
  async proposeAction(session: WorkerSession, scope: RunScope, key: OperationKey, raw: DecisionProposal) {
    const ctx = await this.sessions.assert(session, scope),
      proposal = ProposalSchema.parse(raw);
    if (proposal.kind === "action" && ctx.authority !== "actor") throw new FleetError("AUTHORITY_DENIED", true);
    if (
      proposal.sourceRefs.length &&
      (!ctx.ports.observation || proposal.sourceRefs.some((ref) => !ctx.ports.observation!.sourceRefs.includes(ref)))
    )
      throw new FleetError("SOURCE_REF_REQUIRED", true);
    return this.step(session, scope, key, "proposal", proposal, async (mark) => {
      if (proposal.kind === "read") throw new FleetError("READ_PORT_REQUIRED", true);
      if (proposal.kind !== "action")
        return this.record(scope, key, { status: "completed", usage: null }, { proposal });
      const observation = ctx.ports.observation,
        manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest);
      if (
        !observation ||
        !Number.isFinite(Date.parse(observation.observedAt)) ||
        this.store.now().getTime() < Date.parse(observation.observedAt) ||
        this.store.now().getTime() - Date.parse(observation.observedAt) > manifest.context.maxObservationAgeMs
      )
        throw new FleetError("OBSERVATION_STALE", true);
      if (!proposal.sourceRefs.length || proposal.sourceRefs.some((ref) => !observation.sourceRefs.includes(ref)))
        throw new FleetError("SOURCE_REF_REQUIRED", true);
      const pre = z
        .object({ revision: z.string(), clockId: z.string(), clockValue: z.string() })
        .strict()
        .parse(proposal.preconditions);
      if (
        pre.revision !== observation.revision ||
        pre.clockId !== observation.environmentTime.clockId ||
        pre.clockValue !== observation.environmentTime.value ||
        pre.clockId !== manifest.clock.observationId
      )
        throw new FleetError("PROPOSAL_STALE", true);
      const intent = z
          .object({ schemaId: z.string().min(1).max(2000), payload: JsonObject })
          .strict()
          .parse(proposal.payload),
        commandId = commandFor(key);
      const admitted = await validateBrokerAction(
        ctx.ports.services,
        observation,
        scope.taskId,
        { ...intent, bindingId: scope.bindingId, commandId, expectedVersion: observation.revision },
        proposal,
      ).then(
        async (intent) => {
          await this.capture.emit(scope, "validation.result", { valid: true }, { outcome: "ok" }, { required: true });
          return intent;
        },
        async (error) => {
          await this.capture.emit(
            scope,
            "validation.result",
            { valid: false, code: safeCode(error) },
            { code: safeCode(error), outcome: "not_dispatched" },
            { required: true },
          );
          throw error;
        },
      );
      mark();
      const result = await ctx.ports.services.actions.submit(admitted);
      const status = ["confirmed", "rejected"].includes(result.status)
        ? "completed"
        : result.status === "pending"
          ? "pending"
          : "unknown";
      return this.record(scope, key, { status, commandId, usage: null }, result);
    });
  }
  async scopedPort(session: WorkerSession, scope: RunScope, key: OperationKey, port: string, input: unknown[]) {
    const ctx = await this.sessions.assert(session, scope);
    const allowed = new Set([
      "state.load",
      "state.accept",
      "participants.load",
      "participants.inbox",
      "participants.originals",
      "participants.coordination",
      "skills.retrieve",
      "skills.loadSelected",
    ]);
    if (!allowed.has(port)) throw new FleetError("TOOL_UNSUPPORTED", true);
    return this.step(session, scope, key, "port", { port, input }, async (mark) => {
      const [group, method] = port.split("."),
        target = (ctx.ports.services as unknown as Record<string, Record<string, unknown>>)[group],
        fn = target?.[method];
      if (typeof fn !== "function") throw new FleetError("TOOL_UNSUPPORTED", true);
      mark();
      return this.record(scope, key, { status: "completed", usage: null }, await fn.apply(target, input));
    });
  }
  async checkpoint(session: WorkerSession, scope: RunScope, expectedVersion: string, value: CheckpointState) {
    await this.sessions.assert(session, scope);
    const manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest);
    if (
      value.workerVersion !== manifest.components.worker ||
      value.policyVersion !== (manifest.components.policy ?? manifest.components.worker)
    )
      throw new FleetError("CHECKPOINT_INCOMPATIBLE", true);
    return this.checkpoints.save(scope, expectedVersion, value);
  }
  async loadCheckpoint(session: WorkerSession, scope: RunScope) {
    await this.sessions.assert(session, scope);
    return this.checkpoints.load(scope);
  }
  async lookup(session: WorkerSession, scope: RunScope, key: OperationKey) {
    await this.sessions.assert(session, scope);
    return this.journal.lookup(scope, key);
  }
  async stepMap(session: WorkerSession, scope: RunScope) {
    await this.sessions.assert(session, scope);
    return (
      await this.store.pool.query(
        "SELECT logical_step_id,original_epoch,result FROM research_steps WHERE operation_id=$1 ORDER BY logical_step_id",
        [scope.operationId],
      )
    ).rows;
  }
  async *artifact(session: WorkerSession, scope: RunScope, id: string) {
    await this.sessions.assert(session, scope);
    const rows = (
      await this.store.pool.query(
        "SELECT result FROM research_steps WHERE operation_id=$1 AND result->'artifacts' @> $2::jsonb",
        [scope.operationId, JSON.stringify([{ id }])],
      )
    ).rows;
    const ref = rows.flatMap((r) => r.result.artifacts ?? []).find((a) => a.id === id);
    if (!ref) throw new FleetError("ARTIFACT_SCOPE_MISMATCH", true);
    const record = (
      await this.store.pool.query("SELECT scope FROM research_artifacts WHERE id=$1 AND run_id=$2", [id, scope.runId])
    ).rows[0];
    for await (const chunk of this.capture.artifacts.read(record.scope, ref)) {
      await this.sessions.assert(session, scope);
      yield chunk;
    }
  }
  private async step(
    session: WorkerSession,
    scope: RunScope,
    key: OperationKey,
    kind: "model" | "read" | "proposal" | "port",
    body: unknown,
    run: (mark: () => void) => Promise<BrokerResult>,
  ): Promise<BrokerResult> {
    if (!/^(model|read|proposal|port):[0-9]{1,8}$/.test(key.logicalStepId))
      throw new FleetError("STEP_INPUT_CONFLICT", true);
    await this.admission();
    const begun = await this.journal.begin(scope, key, digest({ kind, body }), kind);
    if (begun.disposition === "existing") return begun.result;
    let dispatched = false;
    try {
      await this.sessions.assert(session, scope);
      const result = await this.capture.withScope(scope, () =>
        withEffectHooks(
          {
            allocation: (id, db) => this.journal.attach(scope, key, { allocationId: id }, db),
            command: (id, db) => this.journal.attach(scope, key, { commandId: id }, db),
          },
          () =>
            run(() => {
              dispatched = true;
            }),
        ),
      );
      if (result.status !== "pending") await this.journal.complete(scope, key, result);
      await this.sessions.assert(session, scope);
      return result;
    } catch (error) {
      // Only native ledger/receipts may settle effects. A worker exception is not proof of non-dispatch.
      const saved = (
        await this.store.pool.query("SELECT result FROM research_steps WHERE operation_id=$1 AND logical_step_id=$2", [
          scope.operationId,
          key.logicalStepId,
        ])
      ).rows[0]?.result as BrokerResult | undefined;
      if (saved?.status === "pending") {
        if (dispatched) await this.capture.gap(scope);
        let result: BrokerResult = {
          ...saved,
          status:
            saved.allocationId ||
            saved.commandId ||
            (dispatched && !(kind === "model" && error instanceof FleetError && error.notDispatched))
              ? "unknown"
              : "not_dispatched",
        };
        if (saved.allocationId) {
          const native = (
            await this.store.pool.query(
              "SELECT status,input_tokens::text,output_tokens::text FROM compute_ledger WHERE id=$1",
              [saved.allocationId],
            )
          ).rows[0];
          result = {
            ...saved,
            status:
              native?.status === "reported"
                ? "completed"
                : native?.status === "not_dispatched"
                  ? "not_dispatched"
                  : "unknown",
            usage:
              native?.status === "reported"
                ? { inputTokens: native.input_tokens, outputTokens: native.output_tokens }
                : null,
          };
        }
        await this.journal.complete(scope, key, result);
      }
      throw new FleetError(safeCode(error), true);
    }
  }
  private async record(
    scope: RunScope,
    key: OperationKey,
    result: BrokerResult,
    value: unknown,
  ): Promise<BrokerResult> {
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > 4 * 1024 * 1024) throw new FleetError("ARTIFACT_QUOTA", true);
    const manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest),
      policy = await this.capture.artifacts.policy(
        scope,
        body.length,
        Number(
          BigInt(manifest.evidence.maxArtifactBytes) > 1073741824n
            ? 1073741824n
            : BigInt(manifest.evidence.maxArtifactBytes),
        ),
      );
    return transaction(this.store.pool, async (db) => {
      const ref = await this.capture.artifacts.putWithin(scope, body, { ...policy, expectedBytes: body.length }, db),
        final = { ...result, resultRef: { id: ref.id, kind: "broker.result/v1" }, artifacts: [ref] };
      await this.capture.recorder.append(
        scope,
        { kind: "observation.record", streamId: "broker", producerKey: `result:${digest(key)}`, artifacts: [ref] },
        db,
      );
      if (final.status !== "pending") await this.journal.complete(scope, key, final, db);
      else {
        const saved = await db.query(
          "UPDATE research_steps SET result=$4 WHERE operation_id=$1 AND logical_step_id=$2 AND original_epoch=$3 AND result->>'status'='pending' RETURNING operation_id",
          [key.operationId, key.logicalStepId, key.operationEpoch, final],
        );
        if (!saved.rowCount) throw new FleetError("STEP_RESULT_CONFLICT", true);
      }
      return final;
    });
  }
}
