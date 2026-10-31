import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { type Data, FleetError, type GamePort, type ModelPort, object, safeCode } from "../../domain.js";
import type { ObservationClaim, ObservationPort } from "../../platform/observation-port.js";
import type { Store } from "../../store.js";
import type { ContextPacket } from "../context/assembler.js";
import { account } from "../context/token-accounting.js";
import { digest, type RunScope } from "../contracts.js";
import { ArtifactStore, bytes } from "./artifacts.js";
import type { ArtifactFiles } from "./filesystem.js";
import { EvidenceRecorder } from "./recorder.js";
import { EvidenceRepository, scopeForTurn } from "./repository.js";
import type { EventRef, EvidenceEventInput } from "./types.js";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const encoded = (value: unknown) =>
  Buffer.from(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : typeof v === "function" ? undefined : v)),
  );
export class CaptureSession implements ObservationPort {
  private readonly inputContext = new AsyncLocalStorage<ContextPacket>();
  withInputContext<T>(packet: ContextPacket, work: () => Promise<T>): Promise<T> {
    if (!packet.lineage.artifact || !packet.eventId) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    return this.inputContext.run(packet, work);
  }
  inputForModel() {
    return this.inputContext.getStore();
  }
  readonly artifacts: ArtifactStore;
  readonly recorder: EvidenceRecorder;
  private active = new AsyncLocalStorage<RunScope>();
  private failed = new Set<string>();
  constructor(
    readonly store: Store,
    files: ArtifactFiles,
  ) {
    this.artifacts = new ArtifactStore(store, files);
    this.recorder = new EvidenceRecorder(store);
  }
  withScope<T>(scope: RunScope, work: () => Promise<T>): Promise<T> {
    return this.active.run(scope, work);
  }
  async scope(claim: ObservationClaim, db?: PoolClient) {
    const scope = this.active.getStore();
    if (scope) {
      if (scope.agentId !== claim.agentId || scope.turnId !== claim.id)
        throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
      return scope;
    }
    return scopeForTurn(this.store, claim.id, db);
  }
  async gap(scope: RunScope, code = "CAPTURE_FAILED", db?: PoolClient) {
    this.failed.add(scope.runId);
    try {
      await (db ?? this.store.pool).query("UPDATE research_runs SET capture_failed=true WHERE run_id=$1", [
        scope.runId,
      ]);
    } catch {
      /* Native settlement has priority; native-ledger reconciliation still exposes the missing record. */
    }
  }
  async emit(
    scope: RunScope,
    kind: EvidenceEventInput["kind"],
    body: unknown,
    attributes: EvidenceEventInput["attributes"] = {},
    options: { required?: boolean; db?: PoolClient; parents?: string[]; stream?: string; producerKey?: string } = {},
  ): Promise<EventRef | undefined> {
    const repo = new EvidenceRepository(this.store),
      db = options.db;
    const write = async () => {
      if (db) await repo.bind(scope, db);
      else {
        await this.recorder.append(scope, { kind: "run.started", streamId: "run", producerKey: "capture-start" });
      }
      const consent = (
        await (db ?? this.store.pool).query(
          "SELECT c.observation_consent,c.observation_consent_version::text version,r.artifact_quota_bytes::text quota FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1",
          [scope.runId],
        )
      ).rows[0];
      const artifacts = [];
      let coverage: EvidenceEventInput["coverage"] =
        kind === "recording.gap"
          ? { status: "partial", expected: "1", recorded: "0", reasons: ["PROVIDER_FIELD_UNAVAILABLE"] }
          : { status: "complete", expected: "1", recorded: "1", reasons: [] };
      if (body !== undefined && consent.observation_consent) {
        const raw = encoded(body);
        if (raw.length > 32 * 1024 * 1024) throw new FleetError("ARTIFACT_QUOTA", true);
        const policy = {
          contentType: "application/json",
          privacyClass: "private" as const,
          retentionClass: "30d" as const,
          maxBytes: raw.length,
          runQuotaBytes: Number(consent.quota ?? 1073741824),
          expectedBytes: raw.length,
          consentVersion: consent.version,
        };
        artifacts.push(
          db
            ? await this.artifacts.putWithin(scope, raw, policy, db)
            : await this.artifacts.put(scope, bytes(raw), policy),
        );
      } else if (body !== undefined) {
        coverage = { status: "withheld", expected: "1", recorded: "0", reasons: ["CONSENT_WITHHELD"] };
        if (options.required && this.active.getStore()) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
      }
      return this.recorder.append(
        scope,
        {
          kind,
          producerKey: options.producerKey ?? randomUUID(),
          streamId: options.stream ?? kind.split(".")[0],
          parentIds: options.parents ?? [],
          attributes,
          artifacts,
          coverage,
        },
        db,
      );
    };
    if (db) {
      await db.query("SAVEPOINT research_capture");
      try {
        const result = await write();
        await db.query("RELEASE SAVEPOINT research_capture");
        return result;
      } catch {
        await db.query("ROLLBACK TO SAVEPOINT research_capture");
        this.failed.add(scope.runId);
        try {
          await this.gap(scope, "CAPTURE_FAILED", db);
        } catch {
          await db.query("ROLLBACK TO SAVEPOINT research_capture");
        }
        await db.query("RELEASE SAVEPOINT research_capture");
        return;
      }
    }
    try {
      return await write();
    } catch {
      await this.gap(scope);
      if (options.required) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
      return;
    }
  }
  async preflight(scope: RunScope) {
    if (
      this.failed.has(scope.runId) ||
      (await this.store.pool.query("SELECT capture_failed FROM research_runs WHERE run_id=$1", [scope.runId])).rows[0]
        ?.capture_failed
    )
      throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    try {
      await this.artifacts.materialize(1000, scope.runId);
    } catch {
      await this.gap(scope);
      throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    }
  }
  async detail(claim: ObservationClaim, stage: string, label: string, detail: Data, db?: PoolClient) {
    // A failed evidence lookup cannot abort settlement of a known native effect.
    if (db) await db.query("SAVEPOINT research_detail_scope");
    try {
      const scope = await this.scope(claim, db);
      let kind: EvidenceEventInput["kind"] = "observation.record";
      const attributes: NonNullable<EvidenceEventInput["attributes"]> = {};
      if (["observing", "ready", "thinking", "deciding", "reading", "acting", "result", "finished"].includes(stage))
        attributes.stage = stage as NonNullable<typeof attributes.stage>;
      if (typeof detail.commandId === "string" && uuid.test(detail.commandId)) attributes.commandId = detail.commandId;
      if (label === "Submitting game action") kind = "command.prepared";
      else if (attributes.commandId && /receipt|result|confirmed/i.test(label)) kind = "command.result";
      // Provider-bound wrappers own model units; compatibility debug stays a separate record.
      await this.emit(scope, kind, { label, detail }, attributes, { db });

      if (db) await db.query("RELEASE SAVEPOINT research_detail_scope");
    } catch {
      if (db) await db.query("ROLLBACK TO SAVEPOINT research_detail_scope");
      const runId = this.active.getStore()?.runId ?? claim.id;
      this.failed.add(runId);
      try {
        await (db ?? this.store.pool).query("UPDATE research_runs SET capture_failed=true WHERE run_id=$1", [runId]);
      } catch {
        if (db) await db.query("ROLLBACK TO SAVEPOINT research_detail_scope");
      }
      if (db) await db.query("RELEASE SAVEPOINT research_detail_scope");
    }
  }
  async model(
    claim: ObservationClaim,
    input: Parameters<ModelPort["decide"]>[0],
    port: ModelPort,
    allocationId?: string,
    purpose?: "decision" | "helper" | "correction",
  ) {
    const scope = await this.scope(claim);
    return new ObservedPorts(this, async () => scope, allocationId, purpose).wrapModel(port).decide(input);
  }
  game(agentId: string, port: GamePort) {
    let previous: RunScope | undefined;
    return new ObservedPorts(this, async (method, args) => {
      const active = this.active.getStore();
      if (active) {
        if (active.agentId !== agentId) throw new FleetError("EVIDENCE_SCOPE_MISMATCH", true);
        return active;
      }
      const first = args?.[0],
        command = typeof first === "string" ? first : object(first).commandId;
      let turn: string | undefined;
      if (typeof command === "string" && uuid.test(command))
        turn = (
          await this.store.pool.query(
            "SELECT t.id FROM turns t WHERE t.agent_id=$1 AND (t.pending_command=$2 OR EXISTS(SELECT 1 FROM command_resolutions r WHERE r.turn_id=t.id AND r.command_id=$2)) ORDER BY t.started_at DESC LIMIT 1",
            [agentId, command],
          )
        ).rows[0]?.id;
      turn ??= (
        await this.store.pool.query(
          "SELECT id FROM turns WHERE agent_id=$1 AND state IN ('running','pending','needs_owner') ORDER BY started_at DESC,id DESC LIMIT 1",
          [agentId],
        )
      ).rows[0]?.id;
      if (turn) {
        previous = await scopeForTurn(this.store, turn);
        return previous;
      }
      return method === "close" ? previous : undefined;
    }).wrapGame(port);
  }
  async usage(allocationId: string, status: string, input: number | null, output: number | null) {
    const row = (
      await this.store.pool.query(
        "SELECT t.id,t.agent_id,t.cohort_id FROM compute_ledger l JOIN turns t ON t.id=l.turn_id WHERE l.id=$1",
        [allocationId],
      )
    ).rows[0];
    if (!row) return;
    const scope = await this.scope({ id: row.id, agentId: row.agent_id, cohortId: row.cohort_id });
    await this.emit(
      scope,
      status === "late" ? "usage.late" : "usage.settled",
      { status, inputTokens: input, outputTokens: output },
      {
        allocationId,
        outcome: status === "unknown" ? "unknown" : status === "not_dispatched" ? "not_dispatched" : "ok",
      },
    );
  }
  async expire() {
    await this.artifacts.expire(this.store.now());
    await this.store.pool.query(
      "UPDATE research_embedding_jobs SET status='expired',input_digest=NULL,result_cipher=NULL,memory_id=NULL,source_version=NULL WHERE expires_at<=$1 AND status<>'expired'",
      [this.store.now()],
    );
    await this.store.pool.query("DELETE FROM research_memories WHERE expires_at<=$1", [this.store.now()]);
    await this.store.pool.query("DELETE FROM research_memory_sources WHERE expires_at<=$1", [this.store.now()]);
  }
  scoped<T extends object>(claim: ObservationClaim, services: T): T {
    const wrap = (obj: object, prefix: string): object =>
      Object.fromEntries(
        Object.entries(obj).map(([key, value]) => {
          const name = prefix ? `${prefix}.${key}` : key;
          if (
            typeof value === "function" &&
            ![
              "model.inputBytes",
              "environment.observationSemanticsFor",
              "environment.accountObjective",
              "environment.projectObservation",
              "environment.packObservation",
              "continuity.restrict",
            ].includes(name)
          )
            return [
              key,
              async (...args: unknown[]) => {
                const scope = await this.scope(claim);
                const begin = await this.emit(
                  scope,
                  name.startsWith("state") || name.startsWith("participants") ? "memory.read" : "context.prepared",
                  { port: name, input: args },
                );
                try {
                  const result = await value.apply(obj, args);
                  await this.emit(
                    scope,
                    name.startsWith("state") || name.startsWith("participants")
                      ? "memory.write"
                      : name.startsWith("skills")
                        ? "skill.invoked"
                        : "observation.record",
                    { port: name, output: result },
                    {},
                    { parents: begin ? [begin.id] : [] },
                  );
                  return result;
                } catch (error) {
                  await this.emit(
                    scope,
                    "observation.record",
                    { port: name, code: safeCode(error) },
                    { outcome: "error" },
                  );
                  throw error;
                }
              },
            ];
          if (
            value &&
            typeof value === "object" &&
            [
              "model",
              "state",
              "evidence",
              "participants",
              "skills",
              "tasks",
              "environment",
              "actions",
              "continuity",
            ].includes(name)
          )
            return [key, wrap(value, name)];
          return [key, value];
        }),
      );
    return wrap(services, "") as T;
  }
}
const wrappedModel = Symbol("observed-model"),
  wrappedGame = Symbol("observed-game");
export class ObservedPorts {
  constructor(
    private capture: CaptureSession,
    private resolve: (method?: string, args?: unknown[]) => Promise<RunScope | undefined>,
    private allocationId?: string,
    private purpose: "decision" | "helper" | "correction" = "decision",
  ) {}
  wrapModel(port: ModelPort): ModelPort {
    if ((port as ModelPort & { [wrappedModel]?: boolean })[wrappedModel]) return port;
    const self = this;
    return {
      [wrappedModel]: true,
      tracksDispatch: port.tracksDispatch,
      contextWindow: port.contextWindow?.bind(port),
      estimateInputTokens: port.estimateInputTokens?.bind(port),
      async decide(input) {
        const scope = await self.resolve();
        if (!scope) return port.decide(input);
        await self.capture.preflight(scope);
        const context = self.capture.inputForModel();
        let preparedEvent: string | undefined;
        if (context) {
          if (!port.tracksDispatch || digest({ messages: input.messages, schema: input.schema }) !== context.digest)
            throw new FleetError("CONTEXT_INPUT_MISMATCH", true);
          await self.capture.artifacts.record(scope, context.lineage.artifact!.id);
        }
        const allocationId =
          self.allocationId ??
          (
            await self.capture.store.pool.query(
              "SELECT id FROM compute_ledger WHERE turn_id=$1 AND status='reserved' ORDER BY created_at DESC,id DESC LIMIT 1",
              [scope.turnId],
            )
          ).rows[0]?.id;
        const metadata = allocationId
          ? (
              await self.capture.store.pool.query("SELECT request_metrics FROM compute_ledger WHERE id=$1", [
                allocationId,
              ])
            ).rows[0]?.request_metrics
          : undefined;
        const purpose = metadata?.decisionFeedbackCode ? ("correction" as const) : self.purpose;
        const queue = metadata?.queueDelayMs;
        const attrs = {
          ...(allocationId ? { allocationId } : {}),
          purpose,
          ...(Number.isSafeInteger(queue) && queue >= 0 ? { queueDelayMs: String(queue) } : {}),
        };
        await self.capture.emit(scope, "queue.leave", undefined, attrs);
        const request = await self.capture.emit(
          scope,
          "model.request",
          {
            model: input.model,
            messages: input.messages,
            schema: input.schema,
            outputContract: input.outputContract ?? null,
            maxOutputTokens: input.maxOutputTokens,
            ...(context
              ? {
                  contextLineageRef: { id: context.lineage.artifact!.id, kind: "context.lineage/v1" },
                  packetDigest: context.digest,
                }
              : {}),
          },
          attrs,
          { required: true, parents: context?.eventId ? [context.eventId] : [] },
        );
        let dispatched = false;
        const mark = async () => {
          if (context && !preparedEvent) throw new FleetError("CONTEXT_PREPARATION_REQUIRED", true);
          if (!dispatched) {
            dispatched = true;
            await self.capture.emit(scope, "model.dispatched", undefined, attrs, {
              required: true,
              parents: [...(request ? [request.id] : []), ...(preparedEvent ? [preparedEvent] : [])],
            });
          }
        };
        let packet = 0;
        const started = performance.now();
        try {
          if (!port.tracksDispatch) await mark();
          const result = await port.decide({
            ...input,
            onDispatch: async () => {
              await input.onDispatch?.();
              await mark();
            },
            onEvidence: async (event) => {
              if (event.kind === "prepared") {
                if (context) {
                  const messages = object(event.body).messages;
                  if (!Array.isArray(messages) || digest(messages) !== digest(context.messages))
                    throw new FleetError("CONTEXT_INPUT_MISMATCH", true);
                  const schema = (object(event.body).format ??
                    object(object(object(event.body).response_format).json_schema).schema ??
                    input.schema) as Data;
                  const actual = account(context.messages, schema);
                  if (
                    actual.totalBytes > context.limits.maxBytes ||
                    actual.inputTokens + context.limits.maxOutputTokens > context.limits.maxTokens
                  )
                    throw new FleetError("CONTEXT_CAPACITY_REQUIRED", true);
                  const prepared = await self.capture.emit(
                    scope,
                    "context.prepared",
                    {
                      wire: event.body,
                      contextLineageRef: context.lineage.artifact,
                      packetDigest: context.digest,
                      providerSchemaDigest: digest(schema),
                      accounting: actual,
                    },
                    attrs,
                    { required: true, parents: [context.eventId!] },
                  );
                  preparedEvent = prepared?.id;
                } else
                  await self.capture.emit(scope, "context.prepared", event.body, attrs, {
                    required: true,
                    parents: request ? [request.id] : [],
                  });
              } else
                await self.capture.emit(
                  scope,
                  event.kind === "unavailable" ? "recording.gap" : "observation.record",
                  { protocolPacket: packet++, kind: event.kind, body: event.body },
                  attrs,
                  { parents: request ? [request.id] : [] },
                );
              await input.onEvidence?.(event);
            },
          });
          await self.capture.emit(
            scope,
            "model.response",
            result,
            { ...attrs, durationMs: String(Math.max(0, Math.round(performance.now() - started))) },
            { parents: request ? [request.id] : [] },
          );
          return result;
        } catch (error) {
          await self.capture.emit(scope, "model.failed", { code: safeCode(error), dispatched }, attrs, {
            parents: request ? [request.id] : [],
          });
          throw error;
        }
      },
    } as ModelPort;
  }
  wrapGame(port: GamePort): GamePort {
    if ((port as GamePort & { [wrappedGame]?: boolean })[wrappedGame]) return port;
    const out = { ...port, [wrappedGame]: true } as GamePort;
    for (const method of [
      "profile",
      "tools",
      "read",
      "open",
      "submit",
      "effects",
      "submitGuarded",
      "receipt",
      "close",
    ] as const) {
      const fn = port[method];
      if (!fn) continue;
      Object.assign(out, {
        [method]: async (...args: unknown[]) => {
          const scope = await this.resolve(method, args);
          if (!scope) return (fn as (...a: unknown[]) => Promise<unknown>).apply(port, args);
          const effect = method === "submit" || method === "submitGuarded";
          if (effect) await this.capture.preflight(scope);
          const first = args[0],
            id = typeof first === "string" ? first : object(first).commandId,
            attrs = typeof id === "string" && uuid.test(id) ? { commandId: id } : {};
          const start = await this.capture.emit(
            scope,
            effect ? "command.dispatched" : "game.read.request",
            { method, args },
            attrs,
            { required: true },
          );
          try {
            const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(port, args);
            await this.capture.emit(
              scope,
              effect ? "command.result" : method === "receipt" ? "command.receipt" : "game.read.response",
              { method, result },
              attrs,
              { parents: start ? [start.id] : [] },
            );
            return result;
          } catch (error) {
            await this.capture.emit(
              scope,
              "observation.record",
              { method, code: safeCode(error) },
              { ...attrs, outcome: "error" },
              { parents: start ? [start.id] : [] },
            );
            throw error;
          }
        },
      });
    }
    return out;
  }
}
