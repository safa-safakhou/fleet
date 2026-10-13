import { randomInt } from "node:crypto";
import { z } from "zod";
import { transaction } from "./db.js";
import { type Data, FleetError } from "./domain.js";
import { jsonRequest } from "./http.js";
import { Observability } from "./observability.js";
import type { Claim, Store } from "./store.js";

export const policyVersion = "vw-focus-v1";
export const focusNames = ["development", "trade", "relationships", "resilience", "observe"] as const;
const featureName = /^[a-z][a-z0-9_]{0,49}$/;
const features = z.record(z.string().regex(featureName), z.number().finite().min(-100).max(100));
export const Observation = z
  .object({
    features,
    metrics: z
      .object({
        buildings: z.number().nonnegative(),
        contacts: z.number().nonnegative(),
        contracts: z.number().nonnegative(),
      })
      .strict(),
    choices: z.array(z.enum(focusNames)).min(1).max(5),
  })
  .strict()
  .refine((o) => new Set(o.choices).size === o.choices.length && Object.keys(o.features).length <= 40);
export type DecisionObservation = z.infer<typeof Observation>;
export type TrainingExample = {
  features: Record<string, number>;
  choices: string[];
  chosen: number;
  probability: number;
  reward: number;
};
export interface DecisionPort {
  predict(
    features: Record<string, number>,
    choices: string[],
    history: TrainingExample[],
    signal: AbortSignal,
  ): Promise<number[]>;
}
export class VwDecision implements DecisionPort {
  constructor(private url?: string) {}
  async predict(features: Record<string, number>, choices: string[], history: TrainingExample[], signal: AbortSignal) {
    if (!this.url) throw new FleetError("DECISION_MODEL_UNCONFIGURED");
    try {
      const { data } = await jsonRequest(
        `${this.url}/predict`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ policy: policyVersion, features, choices, history }),
        },
        signal,
      );
      if (data.policy !== policyVersion || data.version !== "9.11.9" || data.trained !== history.length)
        throw new FleetError("DECISION_MODEL_MISMATCH");
      return probabilities(data.probabilities, choices.length);
    } catch (error) {
      if (error instanceof FleetError && error.code.startsWith("DECISION_")) throw error;
      throw new FleetError("DECISION_MODEL_UNAVAILABLE");
    }
  }
}
export function probabilities(value: unknown, count: number): number[] {
  const parsed = z.array(z.number().finite().positive().max(1)).length(count).safeParse(value);
  if (!parsed.success || Math.abs(parsed.data.reduce((a, b) => a + b, 0) - 1) > 0.00001)
    throw new FleetError("DECISION_INVALID_PROBABILITIES");
  return parsed.data;
}
export function sample(p: number[], draw = randomInt(0, 2 ** 47) / 2 ** 47) {
  if (draw < 0 || draw >= 1) throw new FleetError("DECISION_INVALID_DRAW");
  let mass = 0;
  for (let i = 0; i < p.length; i++) {
    mass += p[i];
    if (draw < mass) return i;
  }
  return p.length - 1;
}
export function progressReward(before: DecisionObservation["metrics"], after: DecisionObservation["metrics"]) {
  const clip = (n: number) => Math.max(-1, Math.min(1, n));
  // Stock growth is deliberately absent: passive production and spending on
  // upgrades would otherwise reward doing nothing and penalize development.
  return (
    0.5 * clip((after.buildings - before.buildings) / 2) +
    0.25 * clip(after.contacts - before.contacts) +
    0.25 * clip(after.contracts - before.contracts)
  );
}
type Choice = {
  observation: DecisionObservation;
  chosen: number;
  probability: number;
  probabilities: number[];
  trained: number;
};
type Row = {
  turn_id: string;
  created_at: Date;
  detail_cipher: string;
  feedback_cipher: string;
  status: string;
  state: string;
  calls: number;
  unknown_usage: boolean;
  pending_command: string | null;
  code: string | null;
};
const guidance: Record<string, string> = {
  development: "Assess useful, affordable development and prerequisites; construction can require waiting.",
  trade: "Assess actual counterparties and mutually useful, affordable trade; re-read terms before commitments.",
  relationships: "Assess useful contact and conversation opportunities with observed identities; no forced greetings.",
  resilience: "Assess supply, obligations, threats and downside risk; use authoritative decision support where needed.",
  observe: "Assess whether additional information or waiting is best; avoid speculative commitments.",
};
export class DecisionSupport {
  constructor(
    private store: Store,
    private model: DecisionPort,
  ) {}
  async begin(claim: Claim, raw: DecisionObservation): Promise<Data> {
    await this.store.active(claim);
    const observation = Observation.parse(raw);
    const existing = (
      await this.store.pool.query("SELECT detail_cipher FROM decision_choices WHERE turn_id=$1", [claim.id])
    ).rows[0];
    if (existing) return this.hint(this.store.vault.decrypt<Choice>(existing.detail_cipher, `decision:${claim.id}`));
    await this.feedback(claim, observation);
    const history = await this.history(claim.cohortId);
    const context = {
      ...observation.features,
      [`profile_${claim.agent.strategy.profile}`]: 1,
      risk: claim.agent.strategy.riskTolerance,
    };
    observation.features = context;
    await this.store.active(claim);
    const p = probabilities(
      await this.model.predict(
        context,
        observation.choices,
        history,
        AbortSignal.timeout(Math.max(1, Math.min(5000, claim.deadline.getTime() - this.store.now().getTime()))),
      ),
      observation.choices.length,
    );
    const chosen = sample(p),
      choice: Choice = { observation, chosen, probability: p[chosen], probabilities: p, trained: history.length };
    await transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      await c.query(
        "INSERT INTO decision_choices(turn_id,cohort_id,agent_id,policy,created_at,detail_cipher) VALUES($1,$2,$3,$4,$5,$6)",
        [
          claim.id,
          claim.cohortId,
          claim.agentId,
          policyVersion,
          this.store.now(),
          this.store.vault.encrypt(choice, `decision:${claim.id}`),
        ],
      );
      await new Observability(this.store).record(
        claim,
        "ready",
        "Decision model selected a strategic focus",
        {
          policy: policyVersion,
          focus: observation.choices[chosen],
          probability: p[chosen],
          distribution: Object.fromEntries(observation.choices.map((f, i) => [f, p[i]])),
          trainedExamples: history.length,
          metrics: observation.metrics,
          feedback: "Next eligible scheduled observation; progress proxy, not a causal game score.",
        },
        c,
      );
    });
    return this.hint(choice);
  }
  private hint(choice: Choice): Data {
    const focus = choice.observation.choices[choice.chosen];
    return {
      policy: policyVersion,
      focus,
      guidance: guidance[focus],
      trainedExamples: choice.trained,
      coverage:
        "Experimental learned focus, not an instruction to act. Owner values, current facts and permissions take priority. Choose read, wait or any permitted action when warranted. Untrained choices explore.",
    };
  }
  private async history(cohort: string): Promise<TrainingExample[]> {
    const rows = (
      await this.store.pool.query<Row>(
        "SELECT * FROM (SELECT * FROM decision_choices WHERE cohort_id=$1 AND policy=$2 AND status='learned' AND created_at>$3 ORDER BY sequence DESC LIMIT 2000) x ORDER BY sequence",
        [cohort, policyVersion, new Date(this.store.now().getTime() - 30 * 86400000)],
      )
    ).rows;
    return rows.map((r) => {
      const choice = this.store.vault.decrypt<Choice>(r.detail_cipher, `decision:${r.turn_id}`);
      const feedback = this.store.vault.decrypt<{ reward: number }>(
        r.feedback_cipher,
        `decision-feedback:${r.turn_id}`,
      );
      return {
        features: choice.observation.features,
        choices: choice.observation.choices,
        chosen: choice.chosen,
        probability: choice.probability,
        reward: feedback.reward,
      };
    });
  }
  private async feedback(claim: Claim, after: DecisionObservation) {
    await transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      const rows = (
        await c.query<Row>(
          "SELECT d.*,t.state,t.calls,t.unknown_usage,t.pending_command,t.code FROM decision_choices d JOIN turns t ON t.id=d.turn_id WHERE d.agent_id=$1 AND d.status='awaiting' AND d.turn_id<>$2 ORDER BY d.sequence DESC FOR UPDATE OF d",
          [claim.agentId, claim.id],
        )
      ).rows;
      for (const [index, row] of rows.entries()) {
        const elapsed = this.store.now().getTime() - row.created_at.getTime();
        const eligible =
          index === 0 &&
          elapsed >= 60000 &&
          elapsed <= 45 * 60000 &&
          row.state === "finished" &&
          row.calls > 0 &&
          !row.unknown_usage &&
          !row.pending_command &&
          ["COMMITTED", "ALREADY_COMMITTED", "WAIT", "READ", "TURN_ACTION_LIMIT"].includes(row.code ?? "");
        const before = this.store.vault.decrypt<Choice>(row.detail_cipher, `decision:${row.turn_id}`).observation
          .metrics;
        const feedback = eligible
          ? {
              reward: progressReward(before, after.metrics),
              before,
              after: after.metrics,
              observedByTurn: claim.id,
              elapsedMs: elapsed,
            }
          : {
              reason:
                "Uncertain, interrupted, rejected, unused, superseded or outside the 1–45 minute feedback window.",
              observedByTurn: claim.id,
            };
        await c.query(
          "UPDATE decision_choices SET status=$2,feedback_cipher=$3,feedback_at=$4 WHERE turn_id=$1 AND status='awaiting'",
          [
            row.turn_id,
            eligible ? "learned" : "censored",
            this.store.vault.encrypt(feedback, `decision-feedback:${row.turn_id}`),
            this.store.now(),
          ],
        );
        await new Observability(this.store).record(
          claim,
          "ready",
          eligible ? "Decision model received observed progress feedback" : "Decision feedback excluded from learning",
          { priorTurn: row.turn_id, ...feedback },
          c,
        );
      }
    });
  }
  async summary(cohortId: string) {
    const cohort = await this.store.cohort(cohortId);
    const rows = (
      await this.store.pool.query(
        "SELECT status,count(*)::int n FROM decision_choices WHERE cohort_id=$1 GROUP BY status",
        [cohortId],
      )
    ).rows;
    return {
      policy: cohort.model?.decisionPolicy ?? null,
      counts: Object.fromEntries(rows.map((r) => [r.status, r.n])),
      trainingWindow: "Latest 2,000 learned observations in 30 days, cohort-local; no cross-cohort training.",
      reward:
        "0.5 × clipped building-level change / 2 + 0.25 × clipped contact change + 0.25 × clipped active-contract change. Range −1 to 1.",
      coverage:
        "Observed progress proxy includes other players and game-clock effects. It is not a causal estimate, victory score or proof of stronger play.",
    };
  }
}
