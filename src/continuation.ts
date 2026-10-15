import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Pool } from "./db.js";
import { transaction } from "./db.js";
import { type Data, FleetError, object } from "./domain.js";
import type { Claim, Store } from "./store.js";

const key = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const conditionBase = { kind: key, referenceId: z.string().min(1).max(100) };
const condition = z.discriminatedUnion("operator", [
  z
    .object({
      ...conditionBase,
      operator: z.literal("equals"),
      value: z.union([z.string().max(100), z.number().finite(), z.boolean()]),
    })
    .strict(),
  z.object({ ...conditionBase, operator: z.literal("at_least"), value: z.number().finite() }).strict(),
]);
const step = z
  .object({
    id: key,
    intent: z.string().trim().min(1).max(180),
    dependsOn: z.array(key).max(8),
    postcondition: condition,
  })
  .strict();
export const ContinuationUpdate = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    goal: z
      .object({ id: key, title: z.string().trim().min(1).max(240) })
      .strict()
      .nullable(),
    steps: z.array(step).max(8),
    nextStepId: key.nullable(),
    wait: z
      .object({ reason: z.string().trim().min(1).max(180), until: condition })
      .strict()
      .nullable(),
  })
  .strict();
export type Signal = { kind: string; referenceId: string; value: string | number | boolean; asOfGameTimeMs?: number };
type Proposal = z.infer<typeof ContinuationUpdate>;
type State = {
  version: number;
  goal: Proposal["goal"];
  steps: (Proposal["steps"][number] & { status?: string })[];
  nextStepId: string | null;
  wait: Proposal["wait"];
  ownerIntentFingerprint?: string;
  goalStatus?: string;
  reconsideration?: string;
  outcomes: Data[];
  proposalKeys: Record<string, string>;
};
const blank = (): State => ({
  version: 0,
  goal: null,
  steps: [],
  nextStepId: null,
  wait: null,
  outcomes: [],
  proposalKeys: {},
});
export function intentFingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}
function observed(c: z.infer<typeof condition>, signals: Signal[]): boolean | undefined {
  const fact = signals.find((s) => s.kind === c.kind && s.referenceId === c.referenceId);
  if (!fact) return undefined;
  return c.operator === "equals"
    ? fact.value === c.value
    : typeof fact.value === "number" && typeof c.value === "number"
      ? fact.value >= c.value
      : undefined;
}
export function reconcileContinuation(state: State, signals: Signal[], fingerprint: string): State {
  const next = structuredClone(state);
  if (!next.goal) return next;
  if (next.ownerIntentFingerprint !== fingerprint) {
    next.goalStatus = "needs_review";
    next.reconsideration = "Current owner intent changed; this stored goal is history, not a substitute instruction.";
    return next;
  }
  for (const s of next.steps) {
    const met = observed(s.postcondition, signals);
    s.status = met === true ? "observed_complete" : met === false ? "not_met" : "unknown";
  }
  for (const s of next.steps)
    if (
      s.status !== "observed_complete" &&
      s.dependsOn.some((id) => next.steps.find((d) => d.id === id)?.status !== "observed_complete")
    )
      s.status = "blocked_by_dependency";
  if (next.wait && observed(next.wait.until, signals) === true) {
    next.wait = null;
    next.reconsideration = "Fresh facts satisfy the old wait condition; reconsider the next step.";
  }
  next.goalStatus =
    next.steps.length && next.steps.every((s) => s.status === "observed_complete")
      ? "observed_complete"
      : next.wait
        ? "waiting"
        : "active";
  return next;
}
function validatePlan(p: Proposal) {
  const ids = new Set(p.steps.map((s) => s.id));
  if (
    ids.size !== p.steps.length ||
    (p.nextStepId !== null && !ids.has(p.nextStepId)) ||
    p.steps.some((s) => s.dependsOn.some((id) => !ids.has(id)))
  )
    throw new FleetError("CONTINUATION_DEPENDENCY_INVALID");
  const visit = (id: string, path = new Set<string>()) => {
    if (path.has(id)) throw new FleetError("CONTINUATION_DEPENDENCY_CYCLE");
    const next = new Set([...path, id]);
    for (const dep of p.steps.find((s) => s.id === id)?.dependsOn ?? []) visit(dep, next);
  };
  for (const id of ids) visit(id);
  if (!p.goal && (p.steps.length || p.wait || p.nextStepId)) throw new FleetError("CONTINUATION_GOAL_REQUIRED");
}
export class Continuation {
  constructor(private store: Store) {}
  async load(agentId: string, client: Pool | PoolClient = this.store.pool): Promise<State> {
    const row = (await client.query("SELECT * FROM decision_states WHERE agent_id=$1", [agentId])).rows[0];
    if (!row) return blank();
    const state = this.store.vault.decrypt<State>(row.detail_cipher, `continuation:${agentId}`);
    if (row.updated_at.getTime() <= this.store.now().getTime() - 30 * 86400000)
      return {
        ...blank(),
        version: row.version,
        reconsideration: "Stored continuation expired; prior history was not certified current.",
      };
    return { ...state, version: row.version };
  }
  private async change(claim: Claim, operation: (state: State) => State, advanceVersion = true) {
    return transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      await c.query("SELECT agent_id FROM decision_states WHERE agent_id=$1 FOR UPDATE", [claim.agentId]);
      const state = await this.load(claim.agentId, c),
        next = operation(state);
      if (JSON.stringify(state) === JSON.stringify(next)) return state;
      next.version = state.version + (advanceVersion ? 1 : 0);
      if (Buffer.byteLength(JSON.stringify(next)) > 16000) throw new FleetError("CONTINUATION_LIMIT");
      await c.query(
        "INSERT INTO decision_states(agent_id,cohort_id,version,updated_at,detail_cipher) VALUES($1,$2,$3,$4,$5) ON CONFLICT(agent_id) DO UPDATE SET version=EXCLUDED.version,updated_at=EXCLUDED.updated_at,detail_cipher=EXCLUDED.detail_cipher",
        [
          claim.agentId,
          claim.cohortId,
          next.version,
          this.store.now(),
          this.store.vault.encrypt(next, `continuation:${claim.agentId}`),
        ],
      );
      return next;
    });
  }
  async reconcile(claim: Claim, signals: Signal[], fingerprint: string) {
    return this.change(claim, (state) => reconcileContinuation(state, signals, fingerprint));
  }
  async apply(claim: Claim, decision: number, raw: unknown, signals: Signal[], fingerprint: string) {
    const result = ContinuationUpdate.safeParse(raw);
    if (!result.success || Buffer.byteLength(JSON.stringify(raw)) > 5000)
      throw new FleetError("CONTINUATION_INVALID_UPDATE");
    const proposal = result.data;
    validatePlan(proposal);
    return this.change(claim, (state) => {
      const key = `${claim.id}:${decision}`,
        digest = intentFingerprint(raw),
        prior = state.proposalKeys[key];
      if (prior) {
        if (prior !== digest) throw new FleetError("CONTINUATION_UPDATE_CONFLICT");
        return state;
      }
      if (proposal.expectedVersion !== state.version) throw new FleetError("CONTINUATION_STALE_VERSION");
      const { expectedVersion: _version, ...fields } = proposal;
      return reconcileContinuation(
        {
          ...state,
          ...fields,
          ownerIntentFingerprint: fingerprint,
          reconsideration: undefined,
          proposalKeys: Object.fromEntries([...Object.entries(state.proposalKeys), [key, digest]].slice(-8)),
        },
        signals,
        fingerprint,
      );
    });
  }
  async outcome(claim: Claim, decision: number, value: Data) {
    const clean = object(value),
      key = `${claim.id}:${decision}:${String(clean.category)}`;
    return this.change(
      claim,
      (state) =>
        state.outcomes.some((o) => o.key === key)
          ? state
          : {
              ...state,
              outcomes: [
                ...state.outcomes,
                {
                  ...clean,
                  key,
                  turnId: claim.id,
                  decision,
                  recordedAt: this.store.now().toISOString(),
                  meaning: "Recorded controller outcome, not hidden reasoning or command authority.",
                },
              ].slice(-8),
            },
      false,
    );
  }
  context(state: State): Data {
    const failure = [...state.outcomes]
      .reverse()
      .find((o) => ["not_submitted", "rejected", "ordinary_read_failure", "uncertain"].includes(String(o.category)));
    const recent = state.outcomes.slice(-3);
    if (failure && !recent.includes(failure)) recent.unshift(failure);
    return {
      schemaVersion: "fleet.continuation.v1",
      version: state.version,
      goal: state.goal,
      goalStatus: state.goalStatus ?? "absent",
      steps: state.steps.map((s) =>
        s.id === state.nextStepId
          ? s
          : { id: s.id, status: s.status, dependsOn: s.dependsOn, postcondition: s.postcondition },
      ),
      nextStepId: state.nextStepId,
      wait: state.wait,
      reconsideration: state.reconsideration,
      outcomes: recent,
      coverage:
        "Bounded structured continuation and recent outcomes. Other step prose/history remains stored; schema lookup returns the complete current plan. Neither WAIT nor a queue receipt proves goal completion.",
    };
  }
  async schema(agentId: string) {
    const state = await this.load(agentId);
    return z.toJSONSchema(ContinuationUpdate.extend({ expectedVersion: z.literal(state.version) }), {
      target: "draft-7",
    }) as Data;
  }
  async inspect(agentId: string) {
    const agent = await this.store.agent(agentId),
      cohort = await this.store.cohort(agent.cohort_id);
    return cohort.observation_consent ? this.load(agentId) : { withheld: true };
  }
  async prune() {
    await this.store.pool.query("DELETE FROM decision_states WHERE updated_at<$1", [
      new Date(this.store.now().getTime() - 30 * 86400000),
    ]);
  }
}
