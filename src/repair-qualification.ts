import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { RecallPort } from "./cognition.js";
import { transaction } from "./db.js";
import { FleetError, type ModelPort, safeCode } from "./domain.js";
import { qualifyOutput } from "./qualification.js";
import {
  type PreparedQualification,
  type QualificationFixtures,
  type QualificationLedger,
  qualificationProfiles,
} from "./qualification-run.js";

const InitialRepairApproval = z
  .object({
    schemaVersion: z.literal("fleet.repair-qualification.v1"),
    id: z.uuid(),
    authorizationRef: z.string().min(5).max(200),
    approved: z.literal(true),
    predecessor: z.uuid(),
    parentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    startsAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    scope: z.literal("synthetic_retry_fixtures_only"),
    executionLimit: z.literal(37),
    tokenLimit: z.literal(1480000),
    thinkingExecutionLimit: z.literal(19),
    nonThinkingExecutionLimit: z.literal(18),
    helperLimit: z.literal(16),
    baselineExecutions: z.literal(67),
    baselineReservedTokens: z.literal(2680000),
  })
  .strict();
export const RepairApproval = z.discriminatedUnion("schemaVersion", [
  InitialRepairApproval,
  InitialRepairApproval.extend({
    schemaVersion: z.literal("fleet.repair-qualification.v2"),
    executionLimit: z.literal(19),
    tokenLimit: z.literal(760000),
    thinkingExecutionLimit: z.literal(10),
    nonThinkingExecutionLimit: z.literal(9),
    helperLimit: z.literal(8),
    baselineExecutions: z.literal(85),
    baselineReservedTokens: z.literal(3400000),
  }),
]);
// Explicit fixed journal names keep the completed v1 attempt immutable.
function repairSql(version: string, sql: string) {
  return version === "fleet.repair-qualification.v2"
    ? sql
        .replaceAll("qualification_repairs", "qualification_rechecks")
        .replaceAll("qualification_repair_", "qualification_recheck_")
    : sql;
}
function casesFor(version: string) {
  return version === "fleet.repair-qualification.v2"
    ? repairCases.filter((_, index) => [0, 3, 4, 5].includes(index))
    : repairCases;
}
export const repairCases = [
  ["legacy-loop", "threat-help"],
  ["legacy-loop", "scarcity-trade"],
  ["reactive-basic", "scarcity-trade"],
  ["reactive-basic", "stale-receipt"],
  ["reactive-cognition", "scarcity-trade"],
  ["legacy-cognition", "scarcity-trade"],
  ["legacy-cognition", "untrusted-peer"],
  ["reactive-cognition", "multiple-events"],
] as const;
export class RepairQualification {
  private constructor(
    readonly ledger: QualificationLedger,
    readonly parent: PreparedQualification,
    readonly approval: z.infer<typeof RepairApproval>,
  ) {}
  static async create(ledger: QualificationLedger, parent: PreparedQualification, raw: unknown) {
    const plan = RepairApproval.parse(raw),
      digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    if (
      plan.parentDigest !== parent.digest ||
      Date.parse(plan.startsAt) < Date.parse(parent.plan.startsAt) ||
      Date.parse(plan.deadlineAt) - Date.parse(plan.startsAt) > 60 * 60000 ||
      Date.parse(plan.deadlineAt) <= Date.parse(plan.startsAt)
    )
      throw new FleetError("REPAIR_SCOPE");
    await ledger.pool.query(
      repairSql(
        plan.schemaVersion,
        `CREATE TABLE IF NOT EXISTS qualification_repairs(id uuid PRIMARY KEY,run_id uuid UNIQUE NOT NULL REFERENCES qualification_runs(id),authorization_ref text UNIQUE NOT NULL,digest text NOT NULL,plan jsonb NOT NULL,state text NOT NULL DEFAULT 'active',code text,created_at timestamptz NOT NULL DEFAULT now());
   CREATE TABLE IF NOT EXISTS qualification_repair_calls(recovery_id uuid NOT NULL REFERENCES qualification_repairs(id),call_id uuid PRIMARY KEY REFERENCES qualification_calls(id),thinking boolean NOT NULL);
   CREATE TABLE IF NOT EXISTS qualification_repair_helpers(recovery_id uuid NOT NULL REFERENCES qualification_repairs(id),helper_id uuid PRIMARY KEY REFERENCES qualification_helpers(id),thinking boolean NOT NULL);
   CREATE TABLE IF NOT EXISTS qualification_repair_trials(recovery_id uuid NOT NULL REFERENCES qualification_repairs(id),thinking boolean NOT NULL,profile text NOT NULL,trial text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(recovery_id,thinking,profile,trial));`,
      ),
    );
    await transaction(ledger.pool, async (db) => {
      const row = (
        await db.query(
          repairSql(
            plan.schemaVersion,
            "SELECT *,now()>=$2::timestamptz AND now()<$3::timestamptz timely FROM qualification_runs WHERE id=$1 FOR UPDATE",
          ),
          [parent.plan.id, plan.startsAt, plan.deadlineAt],
        )
      ).rows[0];
      if (
        row?.digest !== parent.digest ||
        row.state !== "blocked" ||
        row.code !== "QUALIFICATION_CALIBRATION_FAILED" ||
        !row.timely
      )
        throw new FleetError("REPAIR_PARENT_NOT_READY");
      const predecessorTable =
        plan.schemaVersion === "fleet.repair-qualification.v2" ? "qualification_repairs" : "qualification_recoveries";
      const predecessorQuery = `SELECT state,run_id,plan FROM ${predecessorTable} WHERE id=$1`;
      const previous = (await db.query(predecessorQuery, [plan.predecessor])).rows[0];
      if (
        plan.schemaVersion === "fleet.repair-qualification.v2" &&
        Date.parse(plan.deadlineAt) > Date.parse(previous?.plan?.deadlineAt)
      )
        throw new FleetError("REPAIR_SCOPE");
      if (previous?.state !== "done" || previous.run_id !== parent.plan.id)
        throw new FleetError("REPAIR_PREDECESSOR_NOT_CLOSED");
      const old = (
        await db.query(repairSql(plan.schemaVersion, "SELECT * FROM qualification_repairs WHERE run_id=$1"), [
          parent.plan.id,
        ])
      ).rows[0];
      if (old) {
        if (old.id !== plan.id) throw new FleetError("REPAIR_AUTHORIZATION_REUSED");
        if (old.digest !== digest) throw new FleetError("REPAIR_PLAN_CHANGED");
        return;
      }
      const usage = (
        await db.query(
          repairSql(
            plan.schemaVersion,
            "SELECT count(*)::int n,coalesce(sum(tokens),0)::int tokens,count(*) FILTER(WHERE state IN('prepared','dispatched','unknown'))::int unresolved FROM qualification_calls WHERE run_id=$1",
          ),
          [parent.plan.id],
        )
      ).rows[0];
      if (usage.n !== plan.baselineExecutions || usage.tokens !== plan.baselineReservedTokens || usage.unresolved)
        throw new FleetError("REPAIR_BASELINE_CHANGED");
      try {
        await db.query(
          repairSql(
            plan.schemaVersion,
            "INSERT INTO qualification_repairs(id,run_id,authorization_ref,digest,plan) VALUES($1,$2,$3,$4,$5)",
          ),
          [plan.id, parent.plan.id, plan.authorizationRef, digest, plan],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new FleetError("REPAIR_AUTHORIZATION_REUSED");
        throw error;
      }
    });
    return new RepairQualification(ledger, parent, plan);
  }
  private async check(db: PoolClient) {
    const parent = (
      await db.query(
        repairSql(
          this.approval.schemaVersion,
          "SELECT digest,state,code FROM qualification_runs WHERE id=$1 FOR UPDATE",
        ),
        [this.parent.plan.id],
      )
    ).rows[0];
    const row = (
      await db.query(
        repairSql(
          this.approval.schemaVersion,
          "SELECT *,now()>=(plan->>'startsAt')::timestamptz AND now()<(plan->>'deadlineAt')::timestamptz timely FROM qualification_repairs WHERE id=$1 FOR UPDATE",
        ),
        [this.approval.id],
      )
    ).rows[0];
    if (
      parent?.digest !== this.parent.digest ||
      parent.state !== "blocked" ||
      parent.code !== "QUALIFICATION_CALIBRATION_FAILED" ||
      row?.state !== "active" ||
      !row.timely ||
      row.digest !== createHash("sha256").update(JSON.stringify(this.approval)).digest("hex")
    )
      throw new FleetError("REPAIR_NOT_ACTIVE");
    if (
      (
        await db.query(
          repairSql(
            this.approval.schemaVersion,
            "SELECT 1 FROM qualification_calls WHERE run_id=$1 AND state IN('prepared','dispatched','unknown') LIMIT 1",
          ),
          [this.parent.plan.id],
        )
      ).rowCount
    )
      throw new FleetError("QUALIFICATION_UNRESOLVED_DISPATCH");
  }
  private async reserve(thinking: boolean, profile: string, trial: string) {
    if (![...qualificationProfiles, "recovery-calibration"].includes(profile) || !trial || trial.length > 140)
      throw new FleetError("REPAIR_SCOPE", true);
    const key = `${this.approval.id}:${thinking}:${trial}`;
    return transaction(this.ledger.pool, async (db) => {
      await this.check(db);
      const total = (
        await db.query(
          repairSql(
            this.approval.schemaVersion,
            "SELECT count(*)::int n,coalesce(sum(tokens),0)::int tokens FROM qualification_calls WHERE run_id=$1",
          ),
          [this.parent.plan.id],
        )
      ).rows[0];
      const used = (
        await db.query(
          repairSql(
            this.approval.schemaVersion,
            "SELECT count(*)::int n,coalesce(sum(c.tokens),0)::int tokens,count(*) FILTER(WHERE x.thinking=$2)::int mode,count(*) FILTER(WHERE c.profile=$3 AND c.trial=$4)::int trial FROM qualification_repair_calls x JOIN qualification_calls c ON c.id=x.call_id WHERE x.recovery_id=$1",
          ),
          [this.approval.id, thinking, profile, key],
        )
      ).rows[0];
      if (
        total.n >= 104 ||
        total.tokens + 40000 > 4160000 ||
        used.n >= this.approval.executionLimit ||
        used.tokens + 40000 > this.approval.tokenLimit ||
        used.mode >= (thinking ? this.approval.thinkingExecutionLimit : this.approval.nonThinkingExecutionLimit) ||
        used.trial >= 2
      )
        throw new FleetError("REPAIR_BUDGET", true);
      const id = randomUUID();
      await db.query(
        repairSql(
          this.approval.schemaVersion,
          "INSERT INTO qualification_calls(id,run_id,profile,trial,state) VALUES($1,$2,$3,$4,'prepared')",
        ),
        [id, this.parent.plan.id, profile, key],
      );
      await db.query(
        repairSql(
          this.approval.schemaVersion,
          "INSERT INTO qualification_repair_calls(recovery_id,call_id,thinking) VALUES($1,$2,$3)",
        ),
        [this.approval.id, id, thinking],
      );
      return { id, deadline: new Date(this.approval.deadlineAt) };
    });
  }
  async block(code: string) {
    await this.ledger.pool.query(
      repairSql(this.approval.schemaVersion, "UPDATE qualification_repairs SET state='blocked',code=$2 WHERE id=$1"),
      [this.approval.id, code],
    );
  }
  model(provider: ModelPort, thinking: boolean, profile: string, trial: string): ModelPort {
    return this.ledger.model(this.parent, provider, profile, `${this.approval.id}:${thinking}:${trial}`, undefined, {
      reserve: (actual) => {
        if (actual !== thinking) throw new FleetError("REPAIR_MODEL_MISMATCH", true);
        return this.reserve(thinking, profile, trial);
      },
      block: (code) => this.block(code),
    });
  }
  recall(helper: RecallPort, thinking: boolean, profile: string, trial: string): RecallPort {
    return this.ledger.recall(this.parent, helper, profile, `${this.approval.id}:${thinking}:${trial}`, () =>
      transaction(this.ledger.pool, async (db) => {
        await this.check(db);
        if (profile !== "legacy-cognition") throw new FleetError("REPAIR_HELPER_SCOPE");
        const total = (
          await db.query(
            repairSql(this.approval.schemaVersion, "SELECT count(*)::int n FROM qualification_helpers WHERE run_id=$1"),
            [this.parent.plan.id],
          )
        ).rows[0].n;
        const used = (
          await db.query(
            repairSql(
              this.approval.schemaVersion,
              "SELECT count(*)::int n,count(*) FILTER(WHERE thinking=$2)::int mode FROM qualification_repair_helpers WHERE recovery_id=$1",
            ),
            [this.approval.id, thinking],
          )
        ).rows[0];
        if (total >= 48 || used.n >= this.approval.helperLimit || used.mode >= this.approval.helperLimit / 2)
          throw new FleetError("REPAIR_HELPER_BUDGET");
        const id = randomUUID();
        await db.query(
          repairSql(
            this.approval.schemaVersion,
            "INSERT INTO qualification_helpers(id,run_id,profile,trial,state) VALUES($1,$2,$3,$4,'prepared')",
          ),
          [id, this.parent.plan.id, profile, trial],
        );
        await db.query(
          repairSql(this.approval.schemaVersion, "INSERT INTO qualification_repair_helpers VALUES($1,$2,$3)"),
          [this.approval.id, id, thinking],
        );
        return id;
      }),
    );
  }
  async trial(thinking: boolean, profile: string, trial: string, operation: () => Promise<Record<string, unknown>>) {
    await this.ledger.pool.query(
      repairSql(this.approval.schemaVersion, "INSERT INTO qualification_repair_trials VALUES($1,$2,$3,$4,$5)"),
      [this.approval.id, thinking, profile, trial, { state: "running" }],
    );
    let result: Record<string, unknown>;
    try {
      result = await operation();
    } catch (error) {
      result = { code: safeCode(error), calls: 0 };
    }
    await this.ledger.pool.query(
      repairSql(
        this.approval.schemaVersion,
        "UPDATE qualification_repair_trials SET result=$5 WHERE recovery_id=$1 AND thinking=$2 AND profile=$3 AND trial=$4",
      ),
      [this.approval.id, thinking, profile, trial, { ...result, state: "complete" }],
    );
    const aggregate = await this.ledger.summary(this.parent);
    if (
      aggregate.unknown ||
      aggregate.unresolved ||
      (
        await this.ledger.pool.query(
          repairSql(this.approval.schemaVersion, "SELECT state FROM qualification_repairs WHERE id=$1"),
          [this.approval.id],
        )
      ).rows[0].state !== "active"
    )
      throw new FleetError("REPAIR_STOPPED");
    return result;
  }
  async summary() {
    const row = (
      await this.ledger.pool.query(
        repairSql(this.approval.schemaVersion, "SELECT state,code FROM qualification_repairs WHERE id=$1"),
        [this.approval.id],
      )
    ).rows[0];
    const modes: {
      thinking: boolean;
      executions: number;
      reserved: number;
      invalid: number;
      unknown: number;
      reported: number;
      trials: number;
      failures: number;
      recoveredOutputs: number;
      recoveryPassed: boolean;
      rawPassed: boolean;
      results: { profile: string; trial: string; result: Record<string, unknown> }[];
    }[] = [];
    for (const thinking of [true, false]) {
      const calls = (
        await this.ledger.pool.query(
          repairSql(
            this.approval.schemaVersion,
            "SELECT count(*)::int executions,count(*)::int*40000 AS reserved,count(*) FILTER(WHERE NOT c.valid)::int invalid,count(*) FILTER(WHERE c.state='unknown')::int unknown,coalesce(sum(c.input_tokens+c.output_tokens),0)::int reported FROM qualification_repair_calls x JOIN qualification_calls c ON c.id=x.call_id WHERE x.recovery_id=$1 AND x.thinking=$2",
          ),
          [this.approval.id, thinking],
        )
      ).rows[0];
      const trials = (
        await this.ledger.pool.query(
          repairSql(
            this.approval.schemaVersion,
            "SELECT profile,trial,result FROM qualification_repair_trials WHERE recovery_id=$1 AND thinking=$2 ORDER BY profile,trial",
          ),
          [this.approval.id, thinking],
        )
      ).rows;
      const failures = trials.filter(
        (t) =>
          t.result.state !== "complete" ||
          !t.result.calls ||
          t.result.pending ||
          t.result.scopeViolation ||
          t.result.invalidActions ||
          !["WAIT", "READ", "QUALIFICATION_COMMAND_WITHHELD", "TURN_ACTION_LIMIT"].includes(t.result.code),
      ).length;
      const recovered = (
        await this.ledger.pool.query(
          repairSql(
            this.approval.schemaVersion,
            "SELECT count(*)::int n FROM (SELECT c.profile,c.trial FROM qualification_repair_calls x JOIN qualification_calls c ON c.id=x.call_id WHERE x.recovery_id=$1 AND x.thinking=$2 GROUP BY c.profile,c.trial HAVING bool_or(c.valid=false) AND (array_agg(c.valid ORDER BY c.created_at DESC,c.id DESC))[1] IS TRUE) t",
          ),
          [this.approval.id, thinking],
        )
      ).rows[0].n;
      modes.push({
        thinking,
        ...calls,
        trials: trials.length,
        failures,
        recoveredOutputs: recovered,
        recoveryPassed:
          row.state === "done" &&
          trials.length === casesFor(this.approval.schemaVersion).length + 1 &&
          !failures &&
          !calls.unknown,
        rawPassed:
          row.state === "done" &&
          trials.length === casesFor(this.approval.schemaVersion).length + 1 &&
          !failures &&
          !calls.invalid &&
          !calls.unknown &&
          !trials.some((t) => Number(t.result.proposalRejections) > 0),
        results: trials,
      });
    }
    return {
      state: String(row.state),
      code: row.code as string | null,
      modes,
      aggregate: await this.ledger.summary(this.parent),
    };
  }
  async finish() {
    await this.ledger.pool.query(
      repairSql(
        this.approval.schemaVersion,
        "UPDATE qualification_repairs SET state='done' WHERE id=$1 AND state='active'",
      ),
      [this.approval.id],
    );
  }
}
/** Targeted retest, not a replacement for the original full qualification protocol. */
export async function runRepairQualification(
  repair: RepairQualification,
  ports: {
    model: ModelPort;
    recall: RecallPort;
    fixtures: (thinking: boolean) => Promise<QualificationFixtures>;
    progress?: (event: Record<string, unknown>) => void;
  },
) {
  const schema = {
    type: "object",
    required: ["kind", "summary"],
    properties: { kind: { const: "wait" }, summary: { type: "string", maxLength: 400 } },
    additionalProperties: false,
  };
  for (const thinking of [true, false]) {
    await repair.trial(thinking, "recovery-calibration", "canary", async () => {
      const messages = [
        { role: "system", content: "Local calibration. Return a complete final JSON wait decision with summary." },
        { role: "user", content: "Wait for authorized observations." },
      ];
      const result = await repair.model(ports.model, thinking, "recovery-calibration", "canary").decide({
        model: { ...repair.parent.plan.model, thinking },
        messages,
        schema,
        maxOutputTokens: 2000,
        signal: AbortSignal.timeout(90000),
      });
      return {
        code:
          !result.decisionError && qualifyOutput(schema, messages, result.decision).valid
            ? "WAIT"
            : (result.decisionError ?? "INVALID_MODEL_OUTPUT"),
        calls: 1,
      };
    });
  }
  const fixtures = new Map<boolean, QualificationFixtures>();
  for (const thinking of [true, false]) fixtures.set(thinking, await ports.fixtures(thinking));
  for (const [profile, scenario] of casesFor(repair.approval.schemaVersion))
    for (const thinking of [true, false]) {
      const trial = `${scenario}:repair:${repair.approval.id}:${thinking}`;
      const fixture = fixtures.get(thinking);
      if (!fixture) throw new FleetError("REPAIR_FIXTURE_REQUIRED");
      await repair.trial(thinking, profile, trial, () =>
        fixture.run(
          profile,
          trial,
          repair.model(ports.model, thinking, profile, trial),
          repair.recall(ports.recall, thinking, profile, trial),
        ),
      );
      ports.progress?.({ thinking, profile, scenario, ...(await repair.summary()) });
    }
  await repair.finish();
  return repair.summary();
}
