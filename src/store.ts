import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { type Pool, transaction } from "./db.js";
import {
  Budget,
  type BudgetConfig,
  type Data,
  Draft,
  FleetError,
  ModelConfig,
  type ModelSettings,
  nextSlot,
  object,
  type Strategy,
  strategy,
} from "./domain.js";
import { Observability } from "./observability.js";
import type { Vault } from "./vault.js";

export interface AgentRow {
  id: string;
  cohort_id: string;
  ordinal: number;
  name: string;
  strategy: Strategy;
  account_id: string | null;
  kingdom_id: string | null;
  state: string;
  next_due_at: Date | null;
  last_turn_at: Date | null;
  notes: string;
  reason: string | null;
  fence: string;
  secret_cipher: string | null;
  credential_state: string;
  failure_count: number;
  read_memory_cipher: string | null;
  read_memory_updated_at: Date | null;
}
export interface CohortRow {
  id: string;
  name: string;
  count: number;
  interval_minutes: number;
  seed: string;
  state: string;
  model: ModelSettings | null;
  budget: BudgetConfig | null;
  generation: string;
  anchor_at: Date | null;
  created_at: Date;
  observation_consent: boolean;
  synthetic_owner_policy: Data | null;
}
export interface Claim {
  id: string;
  agentId: string;
  cohortId: string;
  generation: number;
  fence: number;
  worker: string;
  deadline: Date;
  dueAt: Date;
  agent: AgentRow;
  cohort: CohortRow;
}

export class Store {
  constructor(
    readonly pool: Pool,
    readonly vault: Vault,
    readonly now: () => Date = () => new Date(),
  ) {}
  async cohort(id: string, client: Pool | PoolClient = this.pool): Promise<CohortRow> {
    const r = await client.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1", [id]);
    if (!r.rows[0]) throw new FleetError("NOT_FOUND");
    return r.rows[0];
  }
  async agent(id: string, client: Pool | PoolClient = this.pool): Promise<AgentRow> {
    const r = await client.query<AgentRow>("SELECT * FROM agents WHERE id=$1", [id]);
    if (!r.rows[0]) throw new FleetError("NOT_FOUND");
    return r.rows[0];
  }
  async create(input: unknown) {
    const d = Draft.parse(input),
      id = randomUUID();
    return transaction(this.pool, async (c) => {
      await c.query("INSERT INTO cohorts(id,name,count,interval_minutes,seed) VALUES($1,$2,$3,$4,$5)", [
        id,
        d.name,
        d.count,
        d.intervalMinutes,
        d.seed,
      ]);
      for (let i = 0; i < d.count; i++)
        await c.query("INSERT INTO agents(id,cohort_id,ordinal,name,strategy) VALUES($1,$2,$3,$4,$5)", [
          randomUUID(),
          id,
          i,
          `${d.name} ${String(i + 1).padStart(2, "0")}`,
          strategy(d.strategies[i % d.strategies.length], `${d.seed}:${i}`),
        ]);
      await this.audit(c, id, "cohort.created", { count: d.count });
      return { id };
    });
  }
  async configure(id: string, input: unknown) {
    const v = object(input),
      model = ModelConfig.parse(v.model),
      budget = Budget.parse(v.budget);
    if (model.route === "codex-cli" && (!budget.executionAccountingAccepted || budget.concurrency !== 1))
      throw new FleetError("CODEX_EXECUTION_BUDGET_REQUIRED");
    if (budget.deadlineAt && new Date(budget.deadlineAt) <= this.now()) throw new FleetError("DEADLINE_PASSED");
    await transaction(this.pool, async (c) => {
      const row = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw new FleetError("NOT_FOUND");
      if (!["draft", "paused"].includes(row.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      if ((await c.query("SELECT 1 FROM compute_ledger WHERE cohort_id=$1 LIMIT 1", [id])).rowCount)
        throw new FleetError("CONSUMED_CONFIG_IMMUTABLE");
      await c.query("UPDATE cohorts SET model=$2,budget=$3,generation=generation+1 WHERE id=$1", [id, model, budget]);
      await this.audit(c, id, "cohort.configured", { route: model.route, model: model.model });
    });
  }
  async consent(id: string, enabled: boolean) {
    await transaction(this.pool, async (c) => {
      await this.cohort(id, c);
      await c.query("UPDATE cohorts SET observation_consent=$2 WHERE id=$1", [id, enabled]);
      if (!enabled) {
        await c.query("DELETE FROM communications WHERE cohort_id=$1", [id]);
        await c.query("UPDATE turn_events SET detail_cipher=NULL WHERE cohort_id=$1", [id]);
      }
      await this.audit(c, id, "observation.consent", { enabled });
    });
  }
  async setState(id: string, state: "running" | "paused" | "stopped", liveAllowed: boolean) {
    const now = this.now();
    await transaction(this.pool, async (c) => {
      const row = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw new FleetError("NOT_FOUND");
      if (["stopped", "finished"].includes(row.state)) throw new FleetError("TERMINAL_COHORT");
      if (state === "running" && !liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
      if (row.state === state) return;
      if (state === "running") {
        if (!liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
        if (!row.model || !row.budget) throw new FleetError("MODEL_AND_BUDGET_REQUIRED");
        if (row.budget.deadlineAt && new Date(row.budget.deadlineAt) <= now) throw new FleetError("DEADLINE_PASSED");
        const ready = (
          await c.query(
            "SELECT count(*)::int n FROM agents WHERE cohort_id=$1 AND account_id IS NOT NULL AND credential_state='ready'",
            [id],
          )
        ).rows[0].n;
        if (ready !== row.count) throw new FleetError("ACCOUNTS_INCOMPLETE");
        const secrets = (
          await c.query("SELECT id,secret_cipher FROM agents WHERE cohort_id=$1 AND secret_cipher IS NOT NULL", [id])
        ).rows;
        if (secrets.some((a) => this.vault.decrypt<Data>(a.secret_cipher, `agent:${a.id}`).socialPending))
          throw new FleetError("SOCIAL_DECISION_PENDING");
      }
      const anchor = row.anchor_at ?? now;
      await c.query("UPDATE cohorts SET state=$2,generation=generation+1,anchor_at=$3 WHERE id=$1", [
        id,
        state,
        anchor,
      ]);
      const agents = (await c.query<AgentRow>("SELECT * FROM agents WHERE cohort_id=$1 FOR UPDATE", [id])).rows;
      for (const a of agents) {
        const due =
          a.next_due_at && a.next_due_at > now
            ? a.next_due_at
            : new Date(
                nextSlot(
                  anchor.getTime(),
                  row.interval_minutes * 60000,
                  Math.floor((a.ordinal * row.interval_minutes * 60000) / row.count),
                  now.getTime() - 1,
                ),
              );
        await c.query(
          "UPDATE agents SET state=CASE WHEN $2='stopped' THEN 'stopped' ELSE state END,next_due_at=$3,fence=fence+1 WHERE id=$1",
          [a.id, state, due],
        );
      }
      await this.audit(c, id, `cohort.${state}`, {});
    });
  }
  async agentState(id: string, state: "ready" | "paused", liveAllowed: boolean) {
    await transaction(this.pool, async (c) => {
      const a = await this.agent(id, c),
        cohort = await this.cohort(a.cohort_id, c);
      if (["stopped", "finished"].includes(cohort.state)) throw new FleetError("TERMINAL_COHORT");
      if (state === "ready" && (!liveAllowed || a.credential_state !== "ready"))
        throw new FleetError("AGENT_NOT_READY");
      const uncertain = (
        await c.query(
          "SELECT 1 FROM turns WHERE agent_id=$1 AND (pending_command IS NOT NULL OR state='needs_owner') LIMIT 1",
          [id],
        )
      ).rowCount;
      if (state === "ready" && uncertain) throw new FleetError("RECOVERY_REQUIRED");
      await c.query("UPDATE agents SET state=$2,fence=fence+1 WHERE id=$1", [id, state]);
      await this.audit(c, a.cohort_id, `agent.${state}`, { agentId: id });
    });
  }
  async agentOverview(id?: string) {
    return (
      await this.pool.query(
        `SELECT a.id,a.cohort_id,a.ordinal,a.name,a.strategy,a.account_id,a.kingdom_id,a.state,a.next_due_at,a.last_turn_at,a.reason,a.credential_state,
         coalesce(s.total_turns,0)::int total_turns,coalesce(s.committed_actions,0)::int committed_actions,
         t.id latest_turn_id,t.summary latest_summary,t.code latest_code,t.state latest_state,t.started_at latest_started_at,
         CASE WHEN t.state='running' THEN e.stage ELSE NULL END current_stage,
         CASE WHEN t.state='running' THEN e.label ELSE NULL END current_label
         FROM agents a
         LEFT JOIN (SELECT agent_id,count(*) total_turns,sum(actions) committed_actions FROM turns GROUP BY agent_id) s ON s.agent_id=a.id
         LEFT JOIN LATERAL (SELECT id,state,summary,code,started_at FROM turns WHERE agent_id=a.id ORDER BY started_at DESC,id DESC LIMIT 1) t ON true
         LEFT JOIN LATERAL (SELECT stage,label FROM turn_events WHERE turn_id=t.id ORDER BY sequence DESC LIMIT 1) e ON true
         WHERE ($1::uuid IS NULL OR a.id=$1) ORDER BY a.cohort_id,a.ordinal`,
        [id ?? null],
      )
    ).rows;
  }
  async publicState() {
    const cohorts = (await this.pool.query<CohortRow>("SELECT * FROM cohorts ORDER BY created_at DESC,id")).rows;
    const agents = await this.agentOverview();
    const usage = (
      await this.pool.query(
        "SELECT cohort_id,count(*)::int calls,coalesce(sum(tokens),0)::text allocated_tokens,coalesce(sum(input_tokens),0)::text input_tokens,coalesce(sum(output_tokens),0)::text output_tokens,count(*) FILTER(WHERE status='unknown')::int unknown_calls,count(*) FILTER(WHERE status='reserved')::int reserved_calls FROM compute_ledger GROUP BY cohort_id",
      )
    ).rows;
    const turns = (
      await this.pool.query(
        "SELECT id,agent_id,cohort_id,state,due_at,started_at,deadline_at,finished_at,code,calls,actions,pending_command,summary,input_tokens,output_tokens,unknown_usage FROM turns ORDER BY started_at DESC,id DESC LIMIT 100",
      )
    ).rows;
    const hosts = (await this.pool.query("SELECT id,updated_at,live_enabled FROM worker_heartbeats")).rows;
    const pairs = (
      await this.pool.query(
        "SELECT owner_agent_id,peer_kingdom_id,count(*)::int events,max(occurred_at) last_at,count(*) FILTER(WHERE kind='message')::int messages FROM communications x JOIN cohorts c ON c.id=x.cohort_id WHERE c.observation_consent GROUP BY owner_agent_id,peer_kingdom_id ORDER BY last_at DESC LIMIT 200",
      )
    ).rows;
    const cohortStats = (
      await this.pool.query(
        `SELECT cohort_id,count(*)::int turns,coalesce(sum(actions),0)::text actions,
       count(*) FILTER(WHERE state='running')::int running,count(*) FILTER(WHERE state='pending')::int pending,
       count(*) FILTER(WHERE state='needs_owner' OR (code IS NOT NULL AND code NOT IN('READ','WAIT','COMMITTED','ALREADY_COMMITTED','TURN_ACTION_LIMIT','CLAIM_FENCED')))::int errors,
       count(*) FILTER(WHERE state='finished' AND actions=0 AND code='READ')::int read_only,
       count(*) FILTER(WHERE code='WAIT')::int waits FROM turns GROUP BY cohort_id`,
      )
    ).rows;
    return { cohorts, agents, usage, turns, hosts, pairs, cohortStats, asOf: this.now().toISOString() };
  }
  async heartbeat(worker: string, liveEnabled: boolean) {
    await this.pool.query(
      "INSERT INTO worker_heartbeats VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at,live_enabled=EXCLUDED.live_enabled",
      [worker, this.now(), liveEnabled],
    );
  }
  async claim(worker: string, maxConcurrency = 1): Promise<Claim | null> {
    const now = this.now();
    return transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(19281462)");
      const expired = (
        await c.query(
          "SELECT id,agent_id,cohort_id,pending_command FROM turns WHERE state='running' AND deadline_at<=$1 FOR UPDATE",
          [now],
        )
      ).rows;
      for (const t of expired) {
        await c.query(
          "UPDATE turns SET state=CASE WHEN pending_command IS NOT NULL THEN 'pending' ELSE 'needs_owner' END,code='WORKER_EXPIRED',unknown_usage=true WHERE id=$1",
          [t.id],
        );
        await c.query("UPDATE agents SET state='needs_owner',reason='WORKER_EXPIRED',fence=fence+1 WHERE id=$1", [
          t.agent_id,
        ]);
        await c.query("UPDATE compute_ledger SET status='unknown' WHERE turn_id=$1 AND status='reserved'", [t.id]);
        await c.query(
          "UPDATE cohorts SET state=CASE WHEN (budget->>'deadlineAt')::timestamptz<=$2 THEN 'finished' ELSE 'paused' END,generation=generation+1 WHERE id=$1 AND state='running' AND model->>'route'='codex-cli'",
          [t.cohort_id, now],
        );
      }
      await c.query(
        "UPDATE cohorts SET state='finished',generation=generation+1 WHERE state='running' AND (budget->>'deadlineAt')::timestamptz<=$1",
        [now],
      );
      const total = (await c.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n;
      if (total >= maxConcurrency) return null;
      const a = (
        await c.query<AgentRow>(
          "SELECT a.* FROM agents a JOIN cohorts c ON c.id=a.cohort_id WHERE c.state='running' AND a.state='ready' AND a.credential_state='ready' AND a.next_due_at<=$1 AND NOT EXISTS(SELECT 1 FROM turns t WHERE t.agent_id=a.id AND t.state IN('running','pending')) ORDER BY a.next_due_at,a.ordinal FOR UPDATE OF a SKIP LOCKED LIMIT 1",
          [now],
        )
      ).rows[0];
      if (!a) return null;
      const cohort = await this.cohort(a.cohort_id, c);
      if (!cohort.budget || !cohort.model) throw new FleetError("CONFIG_MISSING");
      const concurrent = (
        await c.query("SELECT count(*)::int n FROM turns WHERE cohort_id=$1 AND state='running'", [cohort.id])
      ).rows[0].n;
      if (concurrent >= cohort.budget.concurrency) return null;
      const fence = Number(a.fence) + 1,
        deadline = new Date(
          Math.min(now.getTime() + 120000, cohort.budget.deadlineAt ? Date.parse(cohort.budget.deadlineAt) : Infinity),
        ),
        id = randomUUID();
      await c.query("UPDATE agents SET fence=$2 WHERE id=$1", [a.id, fence]);
      await c.query(
        "INSERT INTO turns(id,agent_id,cohort_id,generation,fence,worker,state,due_at,started_at,deadline_at) VALUES($1,$2,$3,$4,$5,$6,'running',$7,$8,$9)",
        [id, a.id, cohort.id, cohort.generation, fence, worker, a.next_due_at, now, deadline],
      );
      return {
        id,
        agentId: a.id,
        cohortId: cohort.id,
        generation: Number(cohort.generation),
        fence,
        worker,
        deadline,
        dueAt: a.next_due_at ?? now,
        agent: a,
        cohort,
      };
    });
  }
  private async check(c: Pool | PoolClient, claim: Claim) {
    const r = await c.query(
      "SELECT 1 FROM turns t JOIN agents a ON a.id=t.agent_id JOIN cohorts c ON c.id=t.cohort_id WHERE t.id=$1 AND t.state='running' AND t.fence=$2 AND a.fence=$2 AND c.generation=$3 AND c.state='running' AND a.state='ready' AND t.worker=$4 AND t.deadline_at>$5",
      [claim.id, claim.fence, claim.generation, claim.worker, this.now()],
    );
    if (!r.rowCount) throw new FleetError("CLAIM_FENCED");
  }
  async active(claim: Claim, client: Pool | PoolClient = this.pool) {
    await this.check(client, claim);
  }
  async rememberReads(claim: Claim, reads: unknown[]) {
    if (reads.length > 8 || Buffer.byteLength(JSON.stringify(reads)) > 24000) throw new FleetError("READ_MEMORY_LIMIT");
    await transaction(this.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.check(c, claim);
      await c.query("UPDATE agents SET read_memory_cipher=$2,read_memory_updated_at=$3 WHERE id=$1", [
        claim.agentId,
        this.vault.encrypt(reads, `read-memory:${claim.agentId}`),
        this.now(),
      ]);
    });
  }
  async reserveCall(claim: Claim) {
    const now = this.now(),
      b = claim.cohort.budget;
    if (!b) throw new FleetError("BUDGET_REQUIRED");
    return transaction(this.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.check(c, claim);
      const turn = (await c.query("SELECT calls FROM turns WHERE id=$1 FOR UPDATE", [claim.id])).rows[0];
      if (turn.calls >= b.maxCallsPerTurn) throw new FleetError("TURN_CALL_LIMIT");
      const period = b.mode === "daily" ? now.toISOString().slice(0, 10) : "lifetime";
      if (b.mode !== "continuous") {
        const used = (
          await c.query(
            "SELECT count(*)::int calls,coalesce(sum(tokens),0)::text tokens FROM compute_ledger WHERE cohort_id=$1 AND period=$2",
            [claim.cohortId, period],
          )
        ).rows[0];
        if (used.calls >= b.callLimit || BigInt(used.tokens) + BigInt(b.perCallTokenLimit) > BigInt(b.tokenLimit))
          throw new FleetError("BUDGET_EXHAUSTED");
      }
      const id = randomUUID();
      await c.query(
        "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [id, claim.cohortId, claim.id, period, b.perCallTokenLimit, now],
      );
      await c.query("UPDATE turns SET calls=calls+1 WHERE id=$1", [claim.id]);
      return id;
    });
  }
  async recordUsage(id: string, input: number | null, output: number | null) {
    for (const n of [input, output])
      if (n !== null && (!Number.isSafeInteger(n) || n < 0)) throw new FleetError("INVALID_USAGE");
    await transaction(this.pool, async (c) => {
      const row = (await c.query("SELECT * FROM compute_ledger WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (row?.status !== "reserved") return;
      const reported = input !== null && output !== null;
      if (reported)
        await c.query("UPDATE compute_ledger SET tokens=greatest(tokens,$2) WHERE id=$1", [id, input + output]);
      await c.query("UPDATE compute_ledger SET status=$2,input_tokens=$3,output_tokens=$4 WHERE id=$1", [
        id,
        reported ? "reported" : "unknown",
        input,
        output,
      ]);
      await c.query(
        "UPDATE turns SET input_tokens=input_tokens+$2,output_tokens=output_tokens+$3,unknown_usage=unknown_usage OR $4 WHERE id=$1",
        [row.turn_id, input ?? 0, output ?? 0, !reported],
      );
      const codex =
        (await c.query("SELECT model->>'route' route FROM cohorts WHERE id=$1", [row.cohort_id])).rows[0]?.route ===
        "codex-cli";
      if ((reported && input + output > Number(row.tokens)) || (codex && !reported)) {
        if (codex)
          await c.query(
            "UPDATE cohorts SET state=CASE WHEN (budget->>'deadlineAt')::timestamptz<=$2 THEN 'finished' ELSE 'paused' END,generation=generation+1 WHERE id=$1 AND state='running'",
            [row.cohort_id, this.now()],
          );
        await c.query(
          "UPDATE agents SET state='needs_owner',reason=$2,fence=fence+1 WHERE id=(SELECT agent_id FROM turns WHERE id=$1)",
          [row.turn_id, reported ? "USAGE_EXCEEDED" : "USAGE_UNKNOWN"],
        );
      }
    });
  }
  async pending(claim: Claim, id: string, action: Data) {
    await transaction(this.pool, async (c) => {
      await this.check(c, claim);
      await c.query("UPDATE turns SET pending_command=$2,pending_action=$3 WHERE id=$1", [claim.id, id, action]);
      await new Observability(this).record(claim, "acting", "Submitting game action", { commandId: id, action }, c);
    });
  }
  private async archiveCommand(
    c: PoolClient,
    turn: { id: string; agent_id: string; cohort_id: string; pending_command: string; pending_action: Data },
    code: string,
    source: "receipt" | "explicit_rejection" | "operator_review",
    evidence: Data,
  ) {
    await c.query(
      "INSERT INTO command_resolutions(command_id,turn_id,agent_id,cohort_id,resolved_at,code,source,action_cipher,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        turn.pending_command,
        turn.id,
        turn.agent_id,
        turn.cohort_id,
        this.now(),
        code,
        source,
        this.vault.encrypt(turn.pending_action, `command-resolution:${turn.pending_command}`),
        evidence,
      ],
    );
  }
  async receipt(
    claim: Pick<Claim, "id" | "agentId" | "cohortId">,
    receipt: Data,
    source: "receipt" | "explicit_rejection" = "receipt",
    evidence: Data = {},
    terminal = false,
  ) {
    await transaction(this.pool, async (c) => {
      const row = (await c.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [claim.id])).rows[0];
      if (!row?.pending_command || receipt.commandId !== row.pending_command) throw new FleetError("RECEIPT_MISMATCH");
      if (["RECEIPT_NOT_FOUND", "NOT_FOUND", "PENDING"].includes(String(receipt.code)))
        throw new FleetError("TRANSPORT_UNCERTAIN");
      await this.archiveCommand(c, row, String(receipt.code), source, evidence);
      await c.query(
        "UPDATE turns SET pending_command=NULL,pending_action=NULL,actions=actions+$2,code=$3,state=CASE WHEN $4 THEN 'finished' ELSE state END,finished_at=CASE WHEN $4 THEN $5 ELSE finished_at END WHERE id=$1",
        [
          claim.id,
          ["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code)) ? 1 : 0,
          String(receipt.code),
          terminal,
          this.now(),
        ],
      );
      await new Observability(this).record(
        claim,
        "result",
        source === "receipt" ? "Game returned an action result" : "Game rejected the action; no commit established",
        {
          commandId: receipt.commandId,
          code: receipt.code,
          action: row.pending_action,
          committed: ["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code)),
          source,
        },
        c,
      );
    });
  }
  async finish(claim: Claim, code: string, summary = "", notes?: string) {
    const now = this.now();
    await transaction(this.pool, async (c) => {
      const t = (await c.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [claim.id])).rows[0];
      if (!t || !["running", "pending", "needs_owner"].includes(t.state)) return;
      const unknown = await c.query(
        "UPDATE compute_ledger SET status='unknown' WHERE turn_id=$1 AND status='reserved' RETURNING id",
        [claim.id],
      );
      if (unknown.rowCount) await c.query("UPDATE turns SET unknown_usage=true WHERE id=$1", [claim.id]);
      const fenced =
        (await c.query("SELECT 1 FROM agents WHERE id=$1 AND fence=$2", [claim.agentId, claim.fence])).rowCount === 0;
      const pending = Boolean(t.pending_command),
        bad = [
          "TRANSPORT_UNCERTAIN",
          "IDENTITY_MISMATCH",
          "AUTH_REQUIRED",
          "INVALID_DECISION",
          "USAGE_EXCEEDED",
          "USAGE_UNKNOWN",
          "SCHEMA_CHANGED",
        ].includes(code);
      const codexFailure = claim.cohort.model?.route === "codex-cli" && (unknown.rowCount || code.startsWith("CODEX_"));
      if (codexFailure) {
        await c.query(
          "UPDATE cohorts SET state=CASE WHEN (budget->>'deadlineAt')::timestamptz<=$2 THEN 'finished' ELSE 'paused' END,generation=generation+1 WHERE id=$1 AND state='running'",
          [claim.cohortId, now],
        );
      }
      const result = pending ? "pending" : bad || codexFailure ? "needs_owner" : fenced ? "cancelled" : "finished";
      await c.query("UPDATE turns SET state=$2,finished_at=$3,code=$4,summary=$5 WHERE id=$1", [
        claim.id,
        result,
        now,
        code,
        summary.slice(0, 400),
      ]);
      await new Observability(this).record(claim, "finished", "Turn completed", { code, summary, state: result }, c);
      if (fenced) return;
      const backoff = ["RUN_ALREADY_ACTIVE", "RATE_LIMITED"].includes(code) ? 60000 : 0;
      const anchor = claim.cohort.anchor_at ?? now,
        interval = claim.cohort.interval_minutes * 60000;
      const next = new Date(
        Math.max(
          now.getTime() + 60000 + backoff,
          nextSlot(
            anchor.getTime(),
            interval,
            Math.floor((claim.agent.ordinal * interval) / claim.cohort.count),
            now.getTime(),
          ),
        ),
      );
      await c.query(
        "UPDATE agents SET next_due_at=$2,last_turn_at=$3,reason=$4,state=CASE WHEN $5 THEN 'needs_owner' ELSE state END,notes=coalesce($6,notes),failure_count=CASE WHEN $7 THEN 0 ELSE failure_count+1 END WHERE id=$1",
        [
          claim.agentId,
          next,
          now,
          code,
          pending || bad || Boolean(codexFailure),
          notes?.slice(0, 4000) ?? null,
          ["WAIT", "COMMITTED", "ALREADY_COMMITTED"].includes(code),
        ],
      );
    });
  }
  async audit(c: Pool | PoolClient, cohortId: string, kind: string, detail: Data) {
    await c.query("INSERT INTO audit_events(cohort_id,kind,detail) VALUES($1,$2,$3)", [cohortId, kind, detail]);
  }
  async reviewTurn(id: string) {
    await transaction(this.pool, async (c) => {
      const t = (await c.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!t || t.state !== "needs_owner" || t.pending_command) throw new FleetError("RECOVERY_REQUIRED");
      await c.query("UPDATE turns SET state='cancelled' WHERE id=$1", [id]);
      await this.audit(c, t.cohort_id, "turn.reviewed", { turnId: id, originalCode: t.code });
    });
  }
  async reviewRejectedCommand(id: string, commandId: string, code: string, note: string) {
    await transaction(this.pool, async (c) => {
      const t = (await c.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!t || t.state !== "pending" || t.pending_command !== commandId || t.code !== code || note.trim().length < 20)
        throw new FleetError("RECOVERY_REQUIRED");
      const cohort = await this.cohort(t.cohort_id, c),
        agent = await this.agent(t.agent_id, c);
      if (cohort.state !== "paused" || agent.state !== "needs_owner") throw new FleetError("PAUSED_REVIEW_REQUIRED");
      if ((await c.query("SELECT 1 FROM turns WHERE cohort_id=$1 AND state='running' LIMIT 1", [t.cohort_id])).rowCount)
        throw new FleetError("QUIESCENT_REVIEW_REQUIRED");
      if (
        (
          await c.query("SELECT 1 FROM compute_ledger WHERE turn_id=$1 AND status IN ('reserved','unknown') LIMIT 1", [
            id,
          ])
        ).rowCount
      )
        throw new FleetError("USAGE_REVIEW_REQUIRED");
      await this.archiveCommand(c, t, code, "operator_review", { receipt: "RECEIPT_NOT_FOUND", note });
      await c.query(
        "UPDATE turns SET state='finished',pending_command=NULL,pending_action=NULL,summary=$2 WHERE id=$1",
        [
          id,
          "Reviewed rejection: original command retained in recovery archive; not replayed. Agent may replan within its existing authority.",
        ],
      );
      await this.audit(c, t.cohort_id, "command.rejection.reviewed", { turnId: id, commandId, code, note });
      await new Observability(this).record(
        { id, agentId: t.agent_id, cohortId: t.cohort_id },
        "result",
        "Operator reviewed the rejected command; not replayed",
        { commandId, code, source: "operator_review", action: t.pending_action, committed: false },
        c,
      );
    });
  }
}
