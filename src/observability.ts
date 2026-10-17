import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Cognition } from "./cognition.js";
import { Continuation } from "./continuation.js";
import { transaction } from "./db.js";
import { type Data, FleetError, object } from "./domain.js";
import { evidenceChain } from "./platform/evidence.js";
import { inferredLegacyExecution, legacyExecutionFor, retainedLegacyExecution } from "./platform/profiles.js";
import { recoveryPlan } from "./recovery.js";
import type { Claim, Store } from "./store.js";

export type Stage = "observing" | "ready" | "thinking" | "deciding" | "reading" | "acting" | "result" | "finished";
export type HistoryCursor = { beforeAt?: string; beforeId?: string };
interface TurnRow {
  id: string;
  agent_id: string;
  cohort_id: string;
  state: string;
  due_at: Date;
  started_at: Date;
  deadline_at: Date;
  finished_at: Date | null;
  code: string | null;
  calls: number;
  actions: number;
  pending_command: string | null;
  pending_action: Data | null;
  summary: string | null;
  input_tokens: string;
  output_tokens: string;
  unknown_usage: boolean;
}
interface EventRow {
  id: string;
  sequence: string;
  turn_id: string;
  occurred_at: Date;
  stage: Stage;
  label: string;
  detail_cipher: string | null;
  observation_consent: boolean;
}
interface ResolutionRow {
  command_id: string;
  turn_id: string;
  resolved_at: Date;
  code: string;
  source: string;
  action_cipher: string;
}
const secretKey = /password|secret|token$|(^|[_-])(token|tokens)([_-]|$)|cookie|authorization|credential|api[_-]?key/i;
export function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") return JSON.stringify(scrub(parsed));
    } catch {
      /* Plain text remains text. */
    }
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, secretKey.test(k) ? "[redacted]" : scrub(v)]));
  return value;
}
function bounded(data: Data, limit = 8192): Data {
  const clean = object(scrub(data));
  const bytes = Buffer.byteLength(JSON.stringify(clean));
  return bytes <= limit ? clean : { omitted: true, bytes, explanation: "Detail exceeded the observation size limit." };
}
export class Observability {
  constructor(private store: Store) {}
  async record(
    claim: Pick<Claim, "id" | "agentId" | "cohortId">,
    stage: Stage,
    label: string,
    detail: Data = {},
    client?: PoolClient,
    detailLimit = 8192,
  ): Promise<void> {
    if (!client) return transaction(this.store.pool, (c) => this.record(claim, stage, label, detail, c, detailLimit));
    const db = client ?? this.store.pool,
      id = randomUUID();
    const consent = (await db.query("SELECT observation_consent FROM cohorts WHERE id=$1 FOR SHARE", [claim.cohortId]))
      .rows[0]?.observation_consent;
    const engine =
      stage === "observing" && label === "Reading current game state" ? legacyExecutionFor(claim.id) : undefined;
    const recordedDetail = engine ? { ...detail, engine } : detail;
    await db.query(
      "INSERT INTO turn_events(id,turn_id,agent_id,cohort_id,occurred_at,stage,label,detail_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        claim.id,
        claim.agentId,
        claim.cohortId,
        this.store.now(),
        stage,
        label.slice(0, 200),
        consent ? this.store.vault.encrypt(bounded(recordedDetail, detailLimit), `turn-event:${id}`) : null,
      ],
    );
  }
  async recordDebug(claim: Pick<Claim, "id" | "agentId" | "cohortId">, stage: Stage, title: string, detail: Data) {
    await this.record(claim, stage, `Debug: ${title}`, detail, undefined, 262144);
  }
  async run(turnId: string) {
    const row = (await this.store.pool.query("SELECT cohort_id,agent_id FROM turns WHERE id=$1", [turnId])).rows[0];
    if (!row) throw new FleetError("NOT_FOUND");
    const page = await this.history(row.cohort_id, row.agent_id, {}, turnId);
    const agent = await this.store.agent(row.agent_id);
    const executions = (
      await this.store.pool.query(
        "SELECT id,created_at,status,tokens::text allocated_tokens,input_tokens::text,output_tokens::text FROM compute_ledger WHERE turn_id=$1 ORDER BY created_at,id",
        [turnId],
      )
    ).rows;
    const engine = page.turns[0]?.events.find(
      (event) =>
        event.stage === "observing" && event.label === "Reading current game state" && object(event.detail).engine,
    )?.detail?.engine;
    const taskEngine = (
      await this.store.pool.query(
        "SELECT tc.task_id,tc.profile_id,tc.profile_version,t.task_key,t.revision,t.deadline,b.id binding_id,b.environment_id,b.environment_version,b.instance_id FROM platform_task_claims tc JOIN platform_tasks t ON t.id=tc.task_id JOIN environment_bindings b ON b.id=t.binding_id WHERE tc.turn_id=$1",
        [turnId],
      )
    ).rows[0];
    const retainedTask = page.turns[0]?.events.find(
      (event) => event.label === "Task observation delivered" && object(event.detail).profile,
    )?.detail;
    const taskProfile = object(retainedTask?.profile);
    const taskExecution = taskEngine
      ? {
          provenance:
            taskProfile.id === taskEngine.profile_id && taskProfile.version === taskEngine.profile_version
              ? ("recorded" as const)
              : ("unavailable" as const),
          profile:
            taskProfile.id === taskEngine.profile_id && taskProfile.version === taskEngine.profile_version
              ? { id: taskEngine.profile_id as string, version: taskEngine.profile_version as string }
              : null,
          baseline: null,
          configurationDigest: null,
          continuity: null,
          coverage:
            "Task engine reference is recorded independently of legacy manifests. Exact build provenance is not claimed; missing/withheld/expired observation detail remains unavailable.",
        }
      : undefined;
    return {
      turn: page.turns[0],
      agent: { id: agent.id, name: agent.name },
      executions,
      engine: retainedLegacyExecution(engine) ?? taskExecution ?? inferredLegacyExecution(),
      platform: taskEngine
        ? {
            taskId: taskEngine.task_id,
            bindingId: taskEngine.binding_id,
            profile: { id: taskEngine.profile_id, version: taskEngine.profile_version },
            environment: {
              id: taskEngine.environment_id,
              version: taskEngine.environment_version,
              instanceId: taskEngine.instance_id,
            },
            trigger: retainedTask
              ? {
                  sourceRefs: retainedTask.sourceRefs,
                  sourceCount: retainedTask.sourceCount,
                  sourceRefsOmitted: retainedTask.sourceRefsOmitted,
                }
              : null,
            coverage:
              "Claim identifiers retained; source triggers require consented detail. Task current state is not a historical observation.",
          }
        : null,
      evidence: evidenceChain(page.turns[0]?.events ?? []),
      coverage: page.coverage,
    };
  }
  async history(cohortId: string, agentId?: string, cursor: HistoryCursor = {}, turnId?: string) {
    await this.store.cohort(cohortId);
    if (agentId && (await this.store.agent(agentId)).cohort_id !== cohortId)
      throw new FleetError("AGENT_COHORT_MISMATCH");
    if (Boolean(cursor.beforeAt) !== Boolean(cursor.beforeId)) throw new FleetError("INVALID_CURSOR");
    const { rows } = await this.store.pool.query<TurnRow>(
      `SELECT t.id,t.agent_id,t.cohort_id,t.state,t.due_at,t.started_at,t.deadline_at,t.finished_at,t.code,t.calls,t.actions,t.pending_command,t.summary,t.input_tokens,t.output_tokens,t.unknown_usage,
       CASE WHEN c.observation_consent THEN t.pending_action ELSE NULL END pending_action
       FROM turns t JOIN cohorts c ON c.id=t.cohort_id WHERE t.cohort_id=$1 AND ($2::uuid IS NULL OR t.agent_id=$2)
       AND ($3::timestamptz IS NULL OR (t.started_at,t.id)<($3::timestamptz,$4::uuid))
       AND ($5::uuid IS NULL OR t.id=$5) ORDER BY t.started_at DESC,t.id DESC LIMIT 51`,
      [cohortId, agentId ?? null, cursor.beforeAt ?? null, cursor.beforeId ?? null, turnId ?? null],
    );
    const more = rows.length > 50,
      turns = rows.slice(0, 50);
    const { rows: events } = await this.store.pool.query<EventRow>(
      "SELECT e.*,c.observation_consent FROM turn_events e JOIN cohorts c ON c.id=e.cohort_id WHERE turn_id=ANY($1::uuid[]) AND ($2::boolean OR e.label NOT LIKE 'Debug:%') ORDER BY sequence",
      [turns.map((t) => t.id), Boolean(turnId)],
    );
    const last = turns.at(-1);
    const consent = (await this.store.cohort(cohortId)).observation_consent;
    const resolutions = (
      await this.store.pool.query<ResolutionRow>(
        "SELECT command_id,turn_id,resolved_at,code,source,action_cipher FROM command_resolutions WHERE turn_id=ANY($1::uuid[]) ORDER BY resolved_at,command_id",
        [turns.map((t) => t.id)],
      )
    ).rows;
    return {
      turns: turns.map((t) => ({
        ...t,
        pending_action: t.pending_action ? bounded(t.pending_action, turnId ? 262144 : 8192) : null,
        resolutions: resolutions
          .filter((r) => r.turn_id === t.id)
          .map((r) => ({
            commandId: r.command_id,
            at: r.resolved_at,
            code: r.code,
            source: r.source,
            action:
              consent && new Date(r.resolved_at).getTime() >= this.store.now().getTime() - 30 * 86400000
                ? bounded(
                    this.store.vault.decrypt<Data>(r.action_cipher, `command-resolution:${r.command_id}`),
                    turnId ? 262144 : 8192,
                  )
                : null,
          })),
        events: events
          .filter((e) => e.turn_id === t.id)
          .map((e) => ({
            id: e.id,
            sequence: e.sequence,
            at: e.occurred_at,
            stage: e.stage,
            label: e.label,
            detail:
              e.observation_consent &&
              new Date(e.occurred_at).getTime() >= this.store.now().getTime() - 30 * 86400000 &&
              e.detail_cipher
                ? this.store.vault.decrypt<Data>(e.detail_cipher, `turn-event:${e.id}`)
                : null,
          })),
      })),
      next: more && last ? { beforeAt: last.started_at.toISOString(), beforeId: last.id } : null,
      coverage:
        "Detailed steps are captured from the observability release and retained for 30 days. Full debug payloads appear in individual run details from the debugging release, up to 256 KiB per payload; larger payloads are explicitly omitted. Older turns retain their recorded summary and counters; missing steps are not reconstructed.",
    };
  }
  async inspect(agentId: string, cursor: HistoryCursor = {}) {
    const a = await this.store.agent(agentId),
      cohort = await this.store.cohort(a.cohort_id);
    const history = await this.history(a.cohort_id, agentId, cursor);
    const blockers = (
      await this.store.pool.query(
        "SELECT id,state,code,pending_command FROM turns WHERE agent_id=$1 AND (state IN('running','pending','needs_owner') OR pending_command IS NOT NULL) ORDER BY started_at",
        [agentId],
      )
    ).rows;
    const { rows: usage } = await this.store.pool.query(
      `SELECT count(*)::int executions,coalesce(sum(l.input_tokens),0)::text input_tokens,
       coalesce(sum(l.output_tokens),0)::text output_tokens,coalesce(sum(l.tokens),0)::text allocated_tokens,
       count(*) FILTER(WHERE l.status='reserved')::int reserved_calls,count(*) FILTER(WHERE l.status='unknown')::int unknown_calls
       FROM compute_ledger l JOIN turns t ON t.id=l.turn_id WHERE t.agent_id=$1`,
      [agentId],
    );
    const reads =
      cohort.observation_consent && a.read_memory_cipher
        ? this.store.vault.decrypt<Data[]>(a.read_memory_cipher, `read-memory:${a.id}`).map((r) => ({
            id: createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 16),
            tool: typeof r.tool === "string" ? r.tool : "Unknown read",
            observedAt: typeof r.observedAt === "string" ? r.observedAt : null,
          }))
        : [];
    return {
      agent: (await this.store.agentOverview(agentId))[0],
      cohort: {
        id: cohort.id,
        name: cohort.name,
        state: cohort.state,
        model: cohort.model,
        ownerGuidance: cohort.owner_guidance,
        observation: cohort.observation_consent,
      },
      recovery: recoveryPlan(cohort.state, a.credential_state, a.state, blockers, a.reason),
      usage: usage[0],
      notes: cohort.observation_consent ? a.notes : null,
      cognition: await new Cognition(this.store).inspect(agentId),
      decisionState: await new Continuation(this.store).inspect(agentId),
      memory: {
        reads,
        updatedAt: cohort.observation_consent ? a.read_memory_updated_at : null,
        coverage: "Read checkpoint metadata only; current gameplay facts are refreshed by the scheduled turn.",
      },
      ...history,
    };
  }
}
