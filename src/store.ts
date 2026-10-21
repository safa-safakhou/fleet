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
import { legacyUndispatchedPhase } from "./engines/legacy/execution.js";
import { Observability } from "./observability.js";
import { ArchitectureRegistry } from "./platform/architecture.js";
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
  decision_feedback_cipher: string | null;
  decision_feedback_at: Date | null;
  discovery_cursor: Data | null;
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
  owner_guidance: "strategy" | "account_autonomy";
  engine_profile?: { id: string; version: string; environment: unknown } | null;
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
    readonly architectures: ArchitectureRegistry = new ArchitectureRegistry(),
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
  async create(input: unknown, client?: PoolClient) {
    const d = Draft.parse(input),
      id = randomUUID();
    const write = async (c: PoolClient) => {
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
    };
    return client ? write(client) : transaction(this.pool, write);
  }
  /** Explicit operator repair: only input space changes; quotas/model/history stay intact. */
  async increaseInputAllowance(id: string, inputByteLimit: number, reason: string) {
    if (reason.trim().length < 20 || reason.length > 1000) throw new FleetError("REVIEW_NOTE_REQUIRED");
    await transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(19281462)");
      const row = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw new FleetError("NOT_FOUND");
      if (row.state !== "paused" || !row.budget) throw new FleetError("COHORT_NOT_EDITABLE");
      const budget = Budget.parse({ ...row.budget, inputByteLimit });
      if (inputByteLimit <= row.budget.inputByteLimit) throw new FleetError("INPUT_INCREASE_REQUIRED");
      if (
        (
          await c.query(
            "SELECT 1 FROM turns WHERE cohort_id=$1 AND (state IN('running','pending','needs_owner') OR pending_command IS NOT NULL) UNION ALL SELECT 1 FROM compute_ledger WHERE cohort_id=$1 AND status IN('reserved','unknown') LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new FleetError("UNRESOLVED_EXECUTION");
      await c.query("UPDATE cohorts SET budget=$2,generation=generation+1 WHERE id=$1", [id, budget]);
      await this.audit(c, id, "cohort.input_allowance_increased", {
        previousInputByteLimit: row.budget.inputByteLimit,
        inputByteLimit,
        reason,
      });
    });
  }
  /** Explicit operator repair: more final-answer room within the same execution reservation. */
  async increaseOutputAllowance(id: string, maxOutputTokens: number, reason: string) {
    if (reason.trim().length < 20 || reason.length > 1000) throw new FleetError("REVIEW_NOTE_REQUIRED");
    await transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(19281462)");
      const row = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw new FleetError("NOT_FOUND");
      if (
        row.state !== "paused" ||
        !row.budget ||
        (row.budget.deadlineAt && Date.parse(row.budget.deadlineAt) <= this.now().getTime())
      )
        throw new FleetError("COHORT_NOT_EDITABLE");
      const budget = Budget.parse({ ...row.budget, maxOutputTokens });
      if (maxOutputTokens <= row.budget.maxOutputTokens) throw new FleetError("OUTPUT_INCREASE_REQUIRED");
      if (
        (
          await c.query(
            "SELECT 1 FROM turns WHERE cohort_id=$1 AND (state IN('running','pending','needs_owner') OR pending_command IS NOT NULL) UNION ALL SELECT 1 FROM compute_ledger WHERE cohort_id=$1 AND status IN('reserved','unknown') LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new FleetError("UNRESOLVED_EXECUTION");
      await c.query("UPDATE cohorts SET budget=$2,generation=generation+1 WHERE id=$1", [id, budget]);
      await this.audit(c, id, "cohort.output_allowance_increased", {
        previousMaxOutputTokens: row.budget.maxOutputTokens,
        maxOutputTokens,
        reason,
      });
    });
  }
  async configure(id: string, input: unknown, client?: PoolClient) {
    const v = object(input),
      model = ModelConfig.parse(v.model),
      budget = Budget.parse(v.budget);
    if (model.decisionPolicy) throw new FleetError("VW_UNUSED");
    if (model.route === "codex-cli" && (!budget.executionAccountingAccepted || budget.concurrency !== 1))
      throw new FleetError("CODEX_EXECUTION_BUDGET_REQUIRED");
    if (model.decisionPolicy && budget.concurrency !== 1) throw new FleetError("DECISION_SERIAL_REQUIRED");
    if (budget.deadlineAt && new Date(budget.deadlineAt) <= this.now()) throw new FleetError("DEADLINE_PASSED");
    const write = async (c: PoolClient) => {
      const row = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw new FleetError("NOT_FOUND");
      if (!["draft", "paused"].includes(row.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      const hasTasks = Boolean((await c.query("SELECT to_regclass('platform_tasks') AS relation")).rows[0].relation);
      if (
        (
          await c.query(
            `SELECT 1 FROM compute_ledger WHERE cohort_id=$1 UNION ALL SELECT 1 FROM turns WHERE cohort_id=$1 ${hasTasks ? "UNION ALL SELECT 1 FROM platform_tasks WHERE cohort_id=$1" : ""} LIMIT 1`,
            [id],
          )
        ).rowCount
      )
        throw new FleetError("CONSUMED_CONFIG_IMMUTABLE");
      const hasProfiles = (await c.query("SELECT to_regclass('cohort_engine_profiles') AS relation")).rows[0].relation;
      const selected = hasProfiles
        ? (
            await c.query(
              "SELECT profile_id,profile_version,architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1",
              [id],
            )
          ).rows[0]
        : undefined;
      if (selected) {
        const issues = this.architectures.validate(
          { id: selected.profile_id, version: selected.profile_version },
          selected.architecture_config ?? {},
          { model, budget },
        );
        if (issues.length) throw new FleetError(issues[0].code);
      }
      await c.query("UPDATE cohorts SET model=$2,budget=$3,generation=generation+1 WHERE id=$1", [id, model, budget]);
      await this.audit(c, id, "cohort.configured", { route: model.route, model: model.model });
    };
    return client ? write(client) : transaction(this.pool, write);
  }
  async consent(id: string, enabled: boolean) {
    await transaction(this.pool, async (c) => {
      await this.cohort(id, c);
      await c.query("UPDATE cohorts SET observation_consent=$2 WHERE id=$1", [id, enabled]);
      if (!enabled) {
        await c.query(
          "UPDATE specialist_states s SET state_cipher=NULL,support_ids=\u0027{}\u0027,version=version+1 WHERE s.binding_id IN(SELECT b.id FROM environment_bindings b JOIN agents a ON a.id=b.agent_id WHERE a.cohort_id=$1)",
          [id],
        );
        await c.query("DELETE FROM communications WHERE cohort_id=$1", [id]);
        await c.query(
          "DELETE FROM architecture_scoped_state s USING environment_bindings b,agents a WHERE s.binding_id=b.id AND b.agent_id=a.id AND a.cohort_id=$1",
          [id],
        );
        await c.query(
          "DELETE FROM architecture_scoped_evidence e USING environment_bindings b,agents a WHERE e.binding_id=b.id AND b.agent_id=a.id AND a.cohort_id=$1",
          [id],
        );
        await c.query("UPDATE turn_events SET detail_cipher=NULL WHERE cohort_id=$1", [id]);
      }
      await this.audit(c, id, "observation.consent", { enabled });
    });
  }
  async guidance(id: string, mode: "strategy" | "account_autonomy", note: string) {
    if (!["strategy", "account_autonomy"].includes(mode) || note.trim().length < 20 || note.length > 1000)
      throw new FleetError("INVALID_GUIDANCE");
    await transaction(this.pool, async (c) => {
      const cohort = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!cohort) throw new FleetError("NOT_FOUND");
      if (!["draft", "paused"].includes(cohort.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      if ((await c.query("SELECT 1 FROM turns WHERE cohort_id=$1 AND state='running' LIMIT 1", [id])).rowCount)
        throw new FleetError("QUIESCENT_BOUNDARY_REQUIRED");
      await c.query("UPDATE cohorts SET owner_guidance=$2,generation=generation+1 WHERE id=$1", [id, mode]);
      await this.audit(c, id, "owner.guidance.changed", {
        previous: cohort.owner_guidance,
        mode,
        note,
        historicalStrategiesRetained: true,
      });
    });
  }
  async discoveryCursor(claim: Claim, cursor: Data) {
    if (Buffer.byteLength(JSON.stringify(cursor)) > 1024) throw new FleetError("DISCOVERY_CURSOR_LIMIT");
    await transaction(this.pool, async (c) => {
      await this.check(c, claim);
      await c.query("UPDATE agents SET discovery_cursor=$2 WHERE id=$1", [claim.agentId, cursor]);
    });
  }
  async setState(id: string, state: "running" | "paused" | "stopped", liveAllowed: boolean) {
    return this.setStates([id], state, liveAllowed);
  }
  async setStates(
    ids: string[],
    state: "running" | "paused" | "stopped",
    liveAllowed: boolean,
    initialOnly = false,
    client?: PoolClient,
  ) {
    const now = this.now();
    const write = async (c: PoolClient) => {
      for (const id of [...new Set(ids)].sort()) {
        const row = (await c.query<CohortRow>("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!row) throw new FleetError("NOT_FOUND");
        if (initialOnly && row.anchor_at !== null) throw new FleetError("COMPARISON_ALREADY_STARTED");
        if (["stopped", "finished"].includes(row.state)) throw new FleetError("TERMINAL_COHORT");
        if (state === "running" && !liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
        if (row.state === state) continue;
        if (state === "running") {
          if (!liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
          if (!row.model || !row.budget) throw new FleetError("MODEL_AND_BUDGET_REQUIRED");
          if (row.budget.deadlineAt && new Date(row.budget.deadlineAt) <= now) throw new FleetError("DEADLINE_PASSED");
          let ready = (
            await c.query(
              "SELECT count(*)::int n FROM agents WHERE cohort_id=$1 AND account_id IS NOT NULL AND credential_state='ready'",
              [id],
            )
          ).rows[0].n;
          let bound = (
            await c.query("SELECT count(*)::int n FROM agents WHERE cohort_id=$1 AND account_id IS NOT NULL", [id])
          ).rows[0].n;
          if (
            bound !== row.count &&
            (await c.query("SELECT to_regclass('cohort_engine_profiles') AS relation")).rows[0].relation
          ) {
            const counts = (
              await c.query(
                "SELECT count(*)::int bound,count(*) FILTER(WHERE credential_state='ready')::int ready FROM agents WHERE cohort_id=$1 AND (account_id IS NOT NULL OR (EXISTS(SELECT 1 FROM cohort_engine_profiles p WHERE p.cohort_id=agents.cohort_id) AND EXISTS(SELECT 1 FROM environment_bindings b WHERE b.agent_id=agents.id AND b.state='active')))",
                [id],
              )
            ).rows[0];
            ready = counts.ready;
            bound = counts.bound;
          }
          if (bound !== row.count || (!row.anchor_at && ready !== row.count))
            throw new FleetError("ACCOUNTS_INCOMPLETE");
          const secrets = (
            await c.query("SELECT id,secret_cipher FROM agents WHERE cohort_id=$1 AND secret_cipher IS NOT NULL", [id])
          ).rows;
          for (const a of secrets)
            if (this.vault.decrypt<Data>(a.secret_cipher, `agent:${a.id}`).socialPending) {
              if (!row.anchor_at) throw new FleetError("SOCIAL_DECISION_PENDING");
              await c.query(
                "INSERT INTO agent_blockers(agent_id,kind,reason,updated_at) VALUES($1,'configuration','CONFIGURATION_RECEIPT_REQUIRED',$2) ON CONFLICT(agent_id,kind) DO NOTHING",
                [a.id, now],
              );
              await c.query(
                "UPDATE agents SET state=CASE WHEN state IN('paused','stopped') THEN state ELSE 'needs_owner' END,reason='CONFIGURATION_RECEIPT_REQUIRED' WHERE id=$1",
                [a.id],
              );
            }
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
      }
    };
    return client ? write(client) : transaction(this.pool, write);
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
      const held = (await c.query("SELECT 1 FROM agent_blockers WHERE agent_id=$1 LIMIT 1", [id])).rowCount;
      if (state === "ready" && (uncertain || held)) throw new FleetError("RECOVERY_REQUIRED");
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
         CASE WHEN t.state='running' THEN e.label ELSE NULL END current_label,
         CASE WHEN g.label='Game needs owner recovery' THEN g.label ELSE NULL END game_attention_label
         FROM agents a
         LEFT JOIN (SELECT agent_id,count(*) total_turns,sum(actions) committed_actions FROM turns GROUP BY agent_id) s ON s.agent_id=a.id
         LEFT JOIN LATERAL (SELECT id,state,summary,code,started_at FROM turns WHERE agent_id=a.id ORDER BY started_at DESC,id DESC LIMIT 1) t ON true
         LEFT JOIN LATERAL (SELECT stage,label FROM turn_events WHERE turn_id=t.id ORDER BY sequence DESC LIMIT 1) e ON true
         LEFT JOIN LATERAL (SELECT label FROM turn_events WHERE agent_id=a.id AND label IN('Game needs owner recovery','Game blockers checked') ORDER BY sequence DESC LIMIT 1) g ON true
         WHERE ($1::uuid IS NULL OR a.id=$1) ORDER BY a.cohort_id,a.ordinal`,
        [id ?? null],
      )
    ).rows;
  }
  async publicState() {
    const cohorts = (
      await this.pool.query<CohortRow>(
        "SELECT c.*,CASE WHEN p.cohort_id IS NULL THEN NULL ELSE json_build_object('id',p.profile_id,'version',p.profile_version,'environment',p.environment_ref) END engine_profile FROM cohorts c LEFT JOIN cohort_engine_profiles p ON p.cohort_id=c.id ORDER BY c.created_at DESC,c.id",
      )
    ).rows;
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
    await this.recoverExpired();
    return transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(19281462)");
      await c.query(
        "UPDATE cohorts SET state='finished',generation=generation+1 WHERE state='running' AND (budget->>'deadlineAt')::timestamptz<=$1",
        [now],
      );
      const total = (await c.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n;
      if (total >= maxConcurrency) return null;
      const a = (
        await c.query<AgentRow>(
          "SELECT a.* FROM agents a JOIN cohorts c ON c.id=a.cohort_id WHERE c.state='running' AND NOT EXISTS(SELECT 1 FROM cohort_engine_profiles p WHERE p.cohort_id=c.id) AND a.state='ready' AND a.credential_state='ready' AND a.next_due_at<=$1 AND NOT EXISTS(SELECT 1 FROM agent_blockers b WHERE b.agent_id=a.id) AND NOT EXISTS(SELECT 1 FROM turns t WHERE t.agent_id=a.id AND t.state IN('running','pending','needs_owner')) AND NOT EXISTS(SELECT 1 FROM maintenance_holds h WHERE h.cohort_id=c.id AND h.released_at IS NULL) AND (SELECT count(*) FROM turns x WHERE x.cohort_id=c.id AND x.state='running') < (c.budget->>'concurrency')::int ORDER BY a.next_due_at,a.ordinal FOR UPDATE OF a SKIP LOCKED LIMIT 1",
          [now],
        )
      ).rows[0];
      if (!a) return null;
      return this.admitAgent(c, a, worker, now);
    });
  }
  async admitAgent(c: PoolClient, a: AgentRow, worker: string, now: Date, dueAt?: Date): Promise<Claim | null> {
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
      [id, a.id, cohort.id, cohort.generation, fence, worker, dueAt ?? a.next_due_at, now, deadline],
    );
    await c.query(
      "UPDATE recovery_operations SET status='complete',phase='retry_admitted',next_attempt_at=NULL,updated_at=$2 WHERE agent_id=$1 AND status='retry'",
      [a.id, now],
    );
    await c.query("INSERT INTO recovery_operations(turn_id,agent_id,cohort_id,updated_at) VALUES($1,$2,$3,$4)", [
      id,
      a.id,
      cohort.id,
      now,
    ]);
    return {
      id,
      agentId: a.id,
      cohortId: cohort.id,
      generation: Number(cohort.generation),
      fence,
      worker,
      deadline,
      dueAt: dueAt ?? a.next_due_at ?? now,
      agent: a,
      cohort,
    };
  }
  async restoreEligibility(id: string, c: Pool | PoolClient = this.pool) {
    const a = await this.agent(id, c),
      cohort = await this.cohort(a.cohort_id, c),
      now = this.now();
    const interval = cohort.interval_minutes * 60000;
    const due =
      a.next_due_at && a.next_due_at > now
        ? a.next_due_at
        : new Date(
            nextSlot(
              (cohort.anchor_at ?? now).getTime(),
              interval,
              Math.floor((a.ordinal * interval) / cohort.count),
              now.getTime(),
            ),
          );
    await c.query(
      `UPDATE agents a SET state='ready',reason='RECOVERED',fence=fence+1,next_due_at=$2
      WHERE a.id=$1 AND a.state='needs_owner' AND a.credential_state='ready'
      AND NOT EXISTS(SELECT 1 FROM agent_blockers b WHERE b.agent_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM turns t WHERE t.agent_id=a.id AND (t.state IN('running','pending','needs_owner') OR t.pending_command IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM recovery_operations o WHERE o.agent_id=a.id AND o.status IN('owner','reconcile','executing'))`,
      [id, due],
    );
  }
  async phase(claim: Claim, phase: string) {
    await transaction(this.pool, async (c) => {
      await c.query("SELECT id FROM turns WHERE id=$1 FOR UPDATE", [claim.id]);
      await this.check(c, claim);
      await c.query("UPDATE recovery_operations SET phase=$2,updated_at=$3 WHERE turn_id=$1", [
        claim.id,
        phase,
        this.now(),
      ]);
    });
  }
  async notDispatched(id: string) {
    // Retain allocation/call counters; this is execution evidence, never fabricated zero usage.
    await transaction(this.pool, async (c) => {
      await c.query("UPDATE compute_ledger SET status='not_dispatched' WHERE id=$1 AND status='reserved'", [id]);
      await c.query(
        "UPDATE architecture_allocations SET dispatch_state='not_dispatched',updated_at=$2 WHERE allocation_id=$1 AND EXISTS(SELECT 1 FROM compute_ledger WHERE id=$1 AND status='not_dispatched')",
        [id, this.now()],
      );
    });
  }
  async beginMaintenance(cohortId: string, reason: string) {
    if (reason.trim().length < 10 || reason.length > 400) throw new FleetError("MAINTENANCE_REASON_REQUIRED");
    const cohort = await this.cohort(cohortId);
    if (["stopped", "finished"].includes(cohort.state)) throw new FleetError("TERMINAL_COHORT");
    const id = randomUUID(),
      owner = randomUUID(),
      now = this.now();
    await this.pool.query(
      "INSERT INTO maintenance_holds(id,cohort_id,owner,reason,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [id, cohortId, owner, reason, now, new Date(now.getTime() + 300000)],
    );
    return { id, owner, expiresAt: new Date(now.getTime() + 300000) };
  }
  async maintenance(id: string, owner: string, release: boolean) {
    const now = this.now();
    const result = await this.pool.query(
      `UPDATE maintenance_holds h SET expires_at=$3::timestamptz+interval '5 minutes',released_at=CASE WHEN $4 THEN $3 ELSE NULL END
      WHERE h.id=$1 AND h.owner=$2 AND h.released_at IS NULL AND h.expires_at>$3
      AND (NOT $4 OR (NOT EXISTS(SELECT 1 FROM turns t WHERE t.cohort_id=h.cohort_id AND t.state='running') AND NOT EXISTS(SELECT 1 FROM agents a WHERE a.cohort_id=h.cohort_id AND a.credential_state='refreshing') AND NOT EXISTS(SELECT 1 FROM oauth_attempts o JOIN agents a ON a.id=o.agent_id WHERE a.cohort_id=h.cohort_id AND o.phase='exchanging'))) RETURNING h.id`,
      [id, owner, now, release],
    );
    if (!result.rowCount) throw new FleetError("MAINTENANCE_NOT_QUIESCENT_OR_FENCED");
  }
  private async settleModernUndispatched(c: PoolClient, turnId: string) {
    const present = Boolean(
      (await c.query("SELECT 1 FROM architecture_operations WHERE turn_id=$1", [turnId])).rowCount,
    );
    if (!present) return false;
    await c.query(
      "UPDATE compute_ledger l SET status='not_dispatched' FROM architecture_allocations a WHERE l.id=a.allocation_id AND a.turn_id=$1 AND a.dispatch_state='prepared' AND l.status='reserved'",
      [turnId],
    );
    await c.query(
      "UPDATE architecture_allocations a SET dispatch_state='not_dispatched',updated_at=$2 FROM compute_ledger l WHERE a.allocation_id=l.id AND a.turn_id=$1 AND l.status='not_dispatched'",
      [turnId, this.now()],
    );
    return true;
  }
  async recoverExpired() {
    const now = this.now();
    return transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(19281462)");
      await c.query(
        "UPDATE maintenance_holds h SET released_at=$1 WHERE h.released_at IS NULL AND h.expires_at<=$1 AND NOT EXISTS(SELECT 1 FROM turns t WHERE t.cohort_id=h.cohort_id AND t.state='running') AND NOT EXISTS(SELECT 1 FROM agents a WHERE a.cohort_id=h.cohort_id AND a.credential_state='refreshing') AND NOT EXISTS(SELECT 1 FROM oauth_attempts o JOIN agents a ON a.id=o.agent_id WHERE a.cohort_id=h.cohort_id AND o.phase='exchanging')",
        [now],
      );
      const expired = (await c.query("SELECT * FROM turns WHERE state='running' AND deadline_at<=$1 FOR UPDATE", [now]))
        .rows;
      for (const t of expired) {
        const a = await this.agent(t.agent_id, c),
          cohort = await this.cohort(t.cohort_id, c);
        const interval = cohort.interval_minutes * 60000;
        const due = new Date(
          nextSlot(
            (cohort.anchor_at ?? now).getTime(),
            interval,
            Math.floor((a.ordinal * interval) / cohort.count),
            now.getTime() + 60000 - 1,
          ),
        );
        await this.settleUndispatched(c, t);
        const operation = (
          await c.query(
            "SELECT o.phase,p.profile_id FROM recovery_operations o LEFT JOIN platform_task_claims p ON p.turn_id=o.turn_id WHERE o.turn_id=$1",
            [t.id],
          )
        ).rows[0];
        const modern = await this.settleModernUndispatched(c, t.id);
        if (!modern && legacyUndispatchedPhase(operation))
          await c.query("UPDATE compute_ledger SET status='not_dispatched' WHERE turn_id=$1 AND status='reserved'", [
            t.id,
          ]);
        await c.query("UPDATE compute_ledger SET status='unknown' WHERE turn_id=$1 AND status='reserved'", [t.id]);
        await c.query(
          "UPDATE architecture_allocations a SET dispatch_state='unknown',updated_at=$2 FROM compute_ledger l WHERE a.allocation_id=l.id AND a.turn_id=$1 AND l.status='unknown'",
          [t.id, now],
        );
        const unknown = Boolean(
          (await c.query("SELECT 1 FROM compute_ledger WHERE turn_id=$1 AND status='unknown' LIMIT 1", [t.id]))
            .rowCount,
        );
        const state = t.pending_command ? "pending" : unknown ? "needs_owner" : "finished";
        await c.query(
          "UPDATE turns SET state=$2,code='WORKER_EXPIRED',unknown_usage=unknown_usage OR $3,finished_at=$4 WHERE id=$1",
          [t.id, state, unknown, now],
        );
        await c.query(
          "UPDATE recovery_operations SET status=$2,failed_phase=phase,phase=$3,code='WORKER_EXPIRED',next_attempt_at=$4,updated_at=$5 WHERE turn_id=$1",
          [
            t.id,
            t.pending_command ? "reconcile" : unknown ? "owner" : "complete",
            t.pending_command ? "command_uncertain" : unknown ? "usage_uncertain" : "settled",
            t.pending_command ? now : null,
            now,
          ],
        );
        await c.query(
          "UPDATE agents SET state=CASE WHEN state IN('paused','stopped','unconnected') THEN state WHEN $2 THEN 'needs_owner' ELSE state END,reason='WORKER_EXPIRED',fence=fence+1,next_due_at=greatest(next_due_at,$3::timestamptz) WHERE id=$1",
          [t.agent_id, unknown || Boolean(t.pending_command), due],
        );
        await this.audit(c, t.cohort_id, "operation.expired", {
          turnId: t.id,
          unknownUsage: unknown,
          pendingCommand: Boolean(t.pending_command),
          scope: "agent",
        });
      }
      await c.query(
        "UPDATE cohorts SET state='finished',generation=generation+1 WHERE state='running' AND (budget->>'deadlineAt')::timestamptz<=$1",
        [now],
      );
    });
  }
  async recoveryCandidate(worker: string) {
    return (
      await this.pool.query<{ turn_id: string }>(
        `WITH candidate AS (
      SELECT o.turn_id FROM recovery_operations o JOIN cohorts c ON c.id=o.cohort_id
      JOIN agents a ON a.id=o.agent_id WHERE o.status='reconcile' AND c.state='running'
      AND a.state NOT IN('paused','stopped') AND o.next_attempt_at<=$1 AND (o.lease_until IS NULL OR o.lease_until<=$1)
      ORDER BY o.next_attempt_at FOR UPDATE OF o SKIP LOCKED LIMIT 1)
      UPDATE recovery_operations o SET lease_owner=$2,lease_until=$1::timestamptz+interval '45 seconds',attempts=attempts+1
      FROM candidate x WHERE o.turn_id=x.turn_id RETURNING o.turn_id`,
        [this.now(), worker],
      )
    ).rows[0];
  }
  async deferRecovery(id: string, worker: string, code: string) {
    await this.pool.query(
      `UPDATE recovery_operations SET lease_owner=NULL,lease_until=NULL,code=$3,
      next_attempt_at=$4::timestamptz+least(300,5*power(2,least(attempts,6)))*interval '1 second',updated_at=$4
      WHERE turn_id=$1 AND lease_owner=$2 AND status='reconcile'`,
      [id, worker, code, this.now()],
    );
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
  async rememberDecisionFeedback(claim: Claim, feedback: Data | null) {
    if (feedback && Buffer.byteLength(JSON.stringify(feedback)) > 8000) throw new FleetError("FEEDBACK_LIMIT");
    await transaction(this.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.check(c, claim);
      await c.query("UPDATE agents SET decision_feedback_cipher=$2,decision_feedback_at=$3 WHERE id=$1", [
        claim.agentId,
        feedback ? this.vault.encrypt(feedback, `decision-feedback:${claim.agentId}`) : null,
        feedback ? this.now() : null,
      ]);
    });
  }
  private async architectureMetadataAvailable(c: PoolClient) {
    const row = (
      await c.query(
        "SELECT to_regclass('architecture_operations') AS operations,to_regclass('architecture_allocations') AS allocations",
      )
    ).rows[0];
    if (Boolean(row.operations) !== Boolean(row.allocations)) throw new FleetError("ARCHITECTURE_MIGRATION_INCOMPLETE");
    return Boolean(row.operations);
  }
  async reserveCall(claim: Claim, reserveCalls = 0) {
    if (!Number.isSafeInteger(reserveCalls) || reserveCalls < 0 || reserveCalls > 2)
      throw new FleetError("MODEL_RETRY_BUDGET", true);
    const now = this.now(),
      b = claim.cohort.budget;
    if (!b) throw new FleetError("BUDGET_REQUIRED");
    return transaction(this.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.check(c, claim);
      if (
        claim.cohort.model?.route === "codex-cli" &&
        b.mode !== "continuous" &&
        (
          await c.query(
            "SELECT 1 FROM compute_ledger l JOIN turns t ON t.id=l.turn_id WHERE l.cohort_id=$1 AND l.status='unknown' AND t.state IN('needs_owner','pending') LIMIT 1",
            [claim.cohortId],
          )
        ).rowCount
      )
        throw new FleetError("USAGE_EXPOSURE_GATE");
      const turn = (await c.query("SELECT calls FROM turns WHERE id=$1 FOR UPDATE", [claim.id])).rows[0];
      if (turn.calls >= b.maxCallsPerTurn - reserveCalls)
        throw new FleetError(reserveCalls ? "MODEL_RETRY_BUDGET" : "TURN_CALL_LIMIT", true);
      const period = b.mode === "daily" ? now.toISOString().slice(0, 10) : "lifetime";
      if (b.mode !== "continuous") {
        const used = (
          await c.query(
            "SELECT count(*)::int calls,coalesce(sum(tokens),0)::text tokens FROM compute_ledger WHERE cohort_id=$1 AND period=$2",
            [claim.cohortId, period],
          )
        ).rows[0];
        if (
          used.calls >= b.callLimit - reserveCalls ||
          BigInt(used.tokens) + BigInt(b.perCallTokenLimit) * BigInt(1 + reserveCalls) > BigInt(b.tokenLimit)
        )
          throw new FleetError(reserveCalls ? "MODEL_RETRY_BUDGET" : "BUDGET_EXHAUSTED", true);
      }
      const id = randomUUID();
      await c.query(
        "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [id, claim.cohortId, claim.id, period, b.perCallTokenLimit, now],
      );
      if (await this.architectureMetadataAvailable(c))
        await c.query(
          "INSERT INTO architecture_allocations(allocation_id,turn_id,updated_at) SELECT $1,turn_id,$3 FROM architecture_operations WHERE turn_id=$2",
          [id, claim.id, now],
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
      if (row?.status === "unknown" && input !== null && output !== null)
        await c.query(
          "INSERT INTO usage_observations(allocation_id,input_tokens,output_tokens,observed_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [id, input, output, this.now()],
        );
      if (row?.status !== "reserved") return;
      if (await this.architectureMetadataAvailable(c))
        await c.query("UPDATE architecture_allocations SET dispatch_state=$2,updated_at=$3 WHERE allocation_id=$1", [
          id,
          input === null || output === null ? "unknown" : "settled",
          this.now(),
        ]);
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
      if (reported && input + output > Number(row.tokens)) {
        await c.query(
          "UPDATE agents SET state='needs_owner',reason=$2,fence=fence+1 WHERE id=(SELECT agent_id FROM turns WHERE id=$1)",
          [row.turn_id, reported ? "USAGE_EXCEEDED" : "USAGE_UNKNOWN"],
        );
      }
    });
  }
  async pending(claim: Claim, id: string, action: Data, tracked = false, client?: PoolClient) {
    const write = async (c: PoolClient) => {
      await this.check(c, claim);
      await c.query("UPDATE turns SET pending_command=$2,pending_action=$3 WHERE id=$1", [claim.id, id, action]);
      if (tracked)
        await c.query("UPDATE recovery_operations SET phase='command_prepared',updated_at=$2 WHERE turn_id=$1", [
          claim.id,
          this.now(),
        ]);
      await new Observability(this).record(claim, "acting", "Submitting game action", { commandId: id, action }, c);
    };
    return client ? write(client) : transaction(this.pool, write);
  }
  private async archiveCommand(
    c: PoolClient,
    turn: { id: string; agent_id: string; cohort_id: string; pending_command: string; pending_action: Data },
    code: string,
    source: "receipt" | "explicit_rejection" | "operator_review" | "not_dispatched",
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
  private async settleUndispatched(
    c: PoolClient,
    t: { id: string; agent_id: string; cohort_id: string; pending_command: string | null; pending_action: Data | null },
  ) {
    if (!t.pending_command || !t.pending_action) return;
    const op = (await c.query("SELECT phase FROM recovery_operations WHERE turn_id=$1", [t.id])).rows[0];
    if (op?.phase !== "command_prepared") return;
    await this.archiveCommand(
      c,
      { ...t, pending_command: t.pending_command, pending_action: t.pending_action },
      "COMMAND_NOT_DISPATCHED",
      "not_dispatched",
      { phase: "command_prepared", policy: "scoped-recovery-v1", replayed: false },
    );
    await c.query("UPDATE turns SET pending_command=NULL,pending_action=NULL WHERE id=$1", [t.id]);
    t.pending_command = null;
    t.pending_action = null;
  }
  async receipt(
    claim: Pick<Claim, "id" | "agentId" | "cohortId">,
    receipt: Data,
    source: "receipt" | "explicit_rejection" = "receipt",
    evidence: Data = {},
    terminal = false,
    client?: PoolClient,
  ) {
    const write = async (c: PoolClient) => {
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
      if (terminal) {
        const unknown = (
          await c.query("SELECT 1 FROM compute_ledger WHERE turn_id=$1 AND status IN('reserved','unknown') LIMIT 1", [
            claim.id,
          ])
        ).rowCount;
        if (unknown) await c.query("UPDATE turns SET state='needs_owner' WHERE id=$1", [claim.id]);
        await c.query(
          "UPDATE recovery_operations SET status=$2,phase=$3,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,updated_at=$4 WHERE turn_id=$1",
          [claim.id, unknown ? "owner" : "complete", unknown ? "usage_uncertain" : "settled", this.now()],
        );
        await this.restoreEligibility(claim.agentId, c);
      }
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
    };
    return client ? write(client) : transaction(this.pool, write);
  }
  async finish(claim: Claim, code: string, summary = "", notes?: string, onlyRunning = false) {
    const now = this.now();
    await transaction(this.pool, async (c) => {
      const t = (await c.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [claim.id])).rows[0];
      if (!t || !(onlyRunning ? ["running"] : ["running", "pending", "needs_owner"]).includes(t.state)) return;
      await this.settleUndispatched(c, t);
      await this.settleModernUndispatched(c, claim.id);
      const unknown = await c.query(
        "UPDATE compute_ledger SET status='unknown' WHERE turn_id=$1 AND status='reserved' RETURNING id",
        [claim.id],
      );
      if (unknown.rowCount) {
        await c.query("UPDATE turns SET unknown_usage=true WHERE id=$1", [claim.id]);
        await c.query(
          "UPDATE architecture_allocations a SET dispatch_state='unknown',updated_at=$2 FROM compute_ledger l WHERE a.allocation_id=l.id AND a.turn_id=$1 AND l.status='unknown'",
          [claim.id, this.now()],
        );
      }
      const fenced =
        (await c.query("SELECT 1 FROM agents WHERE id=$1 AND fence=$2", [claim.agentId, claim.fence])).rowCount === 0;
      const pending = Boolean(t.pending_command),
        bad = ["IDENTITY_MISMATCH", "AUTH_REQUIRED", "USAGE_EXCEEDED", "USAGE_UNKNOWN"].includes(code);
      const unresolvedUsage = (
        await c.query("SELECT 1 FROM compute_ledger WHERE turn_id=$1 AND status='unknown' LIMIT 1", [claim.id])
      ).rowCount;
      const result = pending ? "pending" : bad || unresolvedUsage ? "needs_owner" : fenced ? "cancelled" : "finished";
      await c.query("UPDATE turns SET state=$2,finished_at=$3,code=$4,summary=$5 WHERE id=$1", [
        claim.id,
        result,
        now,
        code,
        summary.slice(0, 400),
      ]);
      await new Observability(this).record(claim, "finished", "Turn completed", { code, summary, state: result }, c);
      await c.query(
        `UPDATE recovery_operations SET status=$2,code=$3,failed_phase=phase,phase=$4,next_attempt_at=$5,updated_at=$6 WHERE turn_id=$1`,
        [
          claim.id,
          pending ? "reconcile" : bad || unresolvedUsage ? "owner" : "complete",
          code,
          pending
            ? "command_uncertain"
            : unresolvedUsage
              ? "usage_uncertain"
              : bad
                ? "authorization_or_exposure"
                : "settled",
          pending ? new Date(now.getTime() + 5000) : null,
          now,
        ],
      );
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
      if (code === "BUDGET_EXHAUSTED") {
        const b = claim.cohort.budget;
        const wake =
          b?.mode === "daily"
            ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
            : b?.deadlineAt
              ? new Date(b.deadlineAt)
              : next;
        next.setTime(
          Math.max(
            next.getTime(),
            nextSlot(
              anchor.getTime(),
              interval,
              Math.floor((claim.agent.ordinal * interval) / claim.cohort.count),
              wake.getTime() - 1,
            ),
          ),
        );
        await c.query(
          "UPDATE recovery_operations SET status='retry',phase='budget_wait',next_attempt_at=$2 WHERE turn_id=$1",
          [claim.id, next],
        );
      }
      if (!pending && !bad && !unresolvedUsage && !["WAIT", "COMMITTED", "ALREADY_COMMITTED"].includes(code))
        await c.query("UPDATE recovery_operations SET status='retry',phase=$2,next_attempt_at=$3 WHERE turn_id=$1", [
          claim.id,
          code === "CONTEXT_LIMIT" ? "input_wait" : "dependency_wait",
          next,
        ]);
      const unresolvedFeedback = (
        await c.query(
          "SELECT decision_feedback_cipher IS NOT NULL AND decision_feedback_at > $2 AS present FROM agents WHERE id=$1",
          [claim.agentId, new Date(now.getTime() - 24 * 3600000)],
        )
      ).rows[0]?.present;
      await c.query(
        "UPDATE agents SET next_due_at=$2,last_turn_at=$3,reason=$4,state=CASE WHEN $5 THEN 'needs_owner' ELSE state END,notes=coalesce($6,notes),failure_count=CASE WHEN $7 THEN 0 ELSE failure_count+1 END WHERE id=$1",
        [
          claim.agentId,
          next,
          now,
          code,
          pending || bad || Boolean(unresolvedUsage),
          notes?.slice(0, 4000) ?? null,
          ["COMMITTED", "ALREADY_COMMITTED"].includes(code) || (code === "WAIT" && !unresolvedFeedback),
        ],
      );
    });
  }
  async audit(c: Pool | PoolClient, cohortId: string, kind: string, detail: Data) {
    await c.query("INSERT INTO audit_events(cohort_id,kind,detail) VALUES($1,$2,$3)", [cohortId, kind, detail]);
  }
  async reviewTurn(
    id: string,
    note = "Owner reviewed this interrupted execution; historical usage and full allocations retained, without replay.",
  ) {
    if (note.trim().length < 20 || note.length > 1000) throw new FleetError("REVIEW_NOTE_REQUIRED");
    await transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(19281462)");
      const t = (await c.query("SELECT * FROM turns WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!t || t.state !== "needs_owner" || t.pending_command) throw new FleetError("RECOVERY_REQUIRED");
      const cohort = await this.cohort(t.cohort_id, c);
      const prospective = (await c.query("SELECT 1 FROM recovery_operations WHERE turn_id=$1", [id])).rowCount;
      if (cohort.state !== "paused" && !prospective) throw new FleetError("PAUSED_REVIEW_REQUIRED");
      if ((await c.query("SELECT 1 FROM turns WHERE agent_id=$1 AND state='running' LIMIT 1", [t.agent_id])).rowCount)
        throw new FleetError("QUIESCENT_REVIEW_REQUIRED");
      const usage = (
        await c.query(
          "SELECT status,count(*)::int calls,sum(tokens)::text allocated_tokens FROM compute_ledger WHERE turn_id=$1 GROUP BY status",
          [id],
        )
      ).rows;
      if (usage.some((u) => u.status === "reserved")) throw new FleetError("EXECUTION_IN_FLIGHT");
      await c.query("UPDATE turns SET state='cancelled' WHERE id=$1", [id]);
      await c.query(
        "UPDATE recovery_operations SET status='complete',phase='owner_reviewed',updated_at=$2 WHERE turn_id=$1",
        [id, this.now()],
      );
      await this.restoreEligibility(t.agent_id, c);
      const detail = {
        turnId: id,
        originalCode: t.code,
        originalState: t.state,
        note,
        usage,
        replayed: false,
        allocationRetained: true,
      };
      await this.audit(c, t.cohort_id, "turn.reviewed", detail);
      await new Observability(this).record(
        { id, agentId: t.agent_id, cohortId: t.cohort_id },
        "result",
        "Owner reviewed interruption; history and allocation retained",
        detail,
        c,
      );
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
