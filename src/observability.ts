import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "./db.js";
import { type Data, FleetError, object } from "./domain.js";
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
const secretKey = /password|secret|token$|(^|[_-])(token|tokens)([_-]|$)|cookie|authorization|credential|api[_-]?key/i;
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, secretKey.test(k) ? "[redacted]" : scrub(v)]));
  return value;
}
function bounded(data: Data): Data {
  const clean = object(scrub(data));
  const bytes = Buffer.byteLength(JSON.stringify(clean));
  return bytes <= 8192 ? clean : { omitted: true, bytes, explanation: "Detail exceeded the observation size limit." };
}
export class Observability {
  constructor(private store: Store) {}
  async record(claim: Claim, stage: Stage, label: string, detail: Data = {}, client?: PoolClient): Promise<void> {
    if (!client) return transaction(this.store.pool, (c) => this.record(claim, stage, label, detail, c));
    const db = client ?? this.store.pool,
      id = randomUUID();
    const consent = (await db.query("SELECT observation_consent FROM cohorts WHERE id=$1 FOR SHARE", [claim.cohortId]))
      .rows[0]?.observation_consent;
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
        consent ? this.store.vault.encrypt(bounded(detail), `turn-event:${id}`) : null,
      ],
    );
  }
  async history(cohortId: string, agentId?: string, cursor: HistoryCursor = {}) {
    await this.store.cohort(cohortId);
    if (agentId && (await this.store.agent(agentId)).cohort_id !== cohortId)
      throw new FleetError("AGENT_COHORT_MISMATCH");
    if (Boolean(cursor.beforeAt) !== Boolean(cursor.beforeId)) throw new FleetError("INVALID_CURSOR");
    const { rows } = await this.store.pool.query<TurnRow>(
      `SELECT t.id,t.agent_id,t.cohort_id,t.state,t.due_at,t.started_at,t.deadline_at,t.finished_at,t.code,t.calls,t.actions,t.pending_command,t.summary,t.input_tokens,t.output_tokens,t.unknown_usage,
       CASE WHEN c.observation_consent THEN t.pending_action ELSE NULL END pending_action
       FROM turns t JOIN cohorts c ON c.id=t.cohort_id WHERE t.cohort_id=$1 AND ($2::uuid IS NULL OR t.agent_id=$2)
       AND ($3::timestamptz IS NULL OR (t.started_at,t.id)<($3::timestamptz,$4::uuid))
       ORDER BY t.started_at DESC,t.id DESC LIMIT 51`,
      [cohortId, agentId ?? null, cursor.beforeAt ?? null, cursor.beforeId ?? null],
    );
    const more = rows.length > 50,
      turns = rows.slice(0, 50);
    const { rows: events } = await this.store.pool.query<EventRow>(
      "SELECT e.*,c.observation_consent FROM turn_events e JOIN cohorts c ON c.id=e.cohort_id WHERE turn_id=ANY($1::uuid[]) ORDER BY sequence",
      [turns.map((t) => t.id)],
    );
    const last = turns.at(-1);
    return {
      turns: turns.map((t) => ({
        ...t,
        pending_action: t.pending_action ? bounded(t.pending_action) : null,
        events: events
          .filter((e) => e.turn_id === t.id)
          .map((e) => ({
            id: e.id,
            sequence: e.sequence,
            at: e.occurred_at,
            stage: e.stage,
            label: e.label,
            detail:
              e.observation_consent && e.detail_cipher
                ? this.store.vault.decrypt<Data>(e.detail_cipher, `turn-event:${e.id}`)
                : null,
          })),
      })),
      next: more && last ? { beforeAt: last.started_at.toISOString(), beforeId: last.id } : null,
      coverage:
        "Detailed steps are captured from the observability release and retained for 30 days. Older turns retain their recorded summary and counters; missing steps are not reconstructed.",
    };
  }
  async inspect(agentId: string, cursor: HistoryCursor = {}) {
    const a = await this.store.agent(agentId),
      cohort = await this.store.cohort(a.cohort_id);
    const history = await this.history(a.cohort_id, agentId, cursor);
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
        observation: cohort.observation_consent,
      },
      usage: usage[0],
      notes: cohort.observation_consent ? a.notes : null,
      memory: {
        reads,
        updatedAt: cohort.observation_consent ? a.read_memory_updated_at : null,
        coverage: "Read checkpoint metadata only; current gameplay facts are refreshed by the scheduled turn.",
      },
      ...history,
    };
  }
}
