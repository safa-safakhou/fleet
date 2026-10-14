import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "./db.js";
import { Budget, type Data, Draft, FleetError, ModelConfig, object, strategy } from "./domain.js";
import type { Store } from "./store.js";

// Templates contain configuration only. Accounts, credentials and history never travel with them.
export const ComparisonTemplate = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(2).max(60),
    countPerArm: z.number().int().min(1).max(500).default(5),
    intervalMinutes: Draft.shape.intervalMinutes,
    seed: Draft.shape.seed,
    strategies: Draft.shape.strategies,
    model: ModelConfig.refine(
      (m) => !m.cognition && !m.recallAssist && !m.decisionPolicy,
      "Select the shared LLM; the comparison assigns cognition modes",
    ),
    budget: Budget,
    recallAssist: z.enum(["laya-recall-v1"]).optional(),
  })
  .strict();
export type ComparisonConfig = z.infer<typeof ComparisonTemplate>;
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

export function comparisonPreview(input: unknown) {
  const template = ComparisonTemplate.parse(input);
  if (
    template.model.route === "codex-cli" &&
    (!template.budget.executionAccountingAccepted || template.budget.concurrency !== 1)
  )
    throw new FleetError("CODEX_EXECUTION_BUDGET_REQUIRED");
  return {
    template,
    arms: [
      { key: "llm", name: `${template.name} · LLM only`, model: template.model },
      {
        key: "cognition",
        name: `${template.name} · Cognition`,
        model: {
          ...template.model,
          cognition: "llm-centered-v1" as const,
          ...(template.recallAssist ? { recallAssist: template.recallAssist } : {}),
        },
      },
    ],
    totalAgents: template.countPerArm * 2,
    totalCallLimit: template.budget.callLimit === null ? null : template.budget.callLimit * 2,
    totalTokenLimit: template.budget.tokenLimit === null ? null : template.budget.tokenLimit * 2,
    coverage:
      "Equal independent allowances per arm, shared LLM and matched strategy pairs. Drafts only; account setup, consent and start are separate. Laya orders recall with visible fallback; the LLM decides. Basic controller notes and read cache remain in both arms. No intelligence score or game-state equivalence is implied.",
  };
}

export class Comparisons {
  constructor(private store: Store) {}
  async create(input: unknown) {
    const request = z.object({ requestId: z.uuid(), template: ComparisonTemplate }).strict().parse(input),
      preview = comparisonPreview(request.template),
      digest = createHash("sha256").update(canonical(preview.template)).digest("hex");
    return transaction(this.store.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [request.requestId]);
      const prior = (
        await c.query("SELECT id,digest,llm_cohort_id,cognition_cohort_id FROM comparisons WHERE id=$1", [
          request.requestId,
        ])
      ).rows[0];
      if (prior) {
        if (prior.digest !== digest) throw new FleetError("COMPARISON_REQUEST_CONFLICT");
        return { id: prior.id, cohortIds: [prior.llm_cohort_id, prior.cognition_cohort_id] };
      }
      if (preview.template.budget.deadlineAt && new Date(preview.template.budget.deadlineAt) <= this.store.now())
        throw new FleetError("DEADLINE_PASSED");
      const ids = [randomUUID(), randomUUID()];
      for (const [index, arm] of preview.arms.entries()) {
        await c.query(
          "INSERT INTO cohorts(id,name,count,interval_minutes,seed,model,budget) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            ids[index],
            arm.name,
            preview.template.countPerArm,
            preview.template.intervalMinutes,
            preview.template.seed,
            arm.model,
            preview.template.budget,
          ],
        );
        for (let ordinal = 0; ordinal < preview.template.countPerArm; ordinal++)
          await c.query("INSERT INTO agents(id,cohort_id,ordinal,name,strategy) VALUES($1,$2,$3,$4,$5)", [
            randomUUID(),
            ids[index],
            ordinal,
            `${arm.name} ${String(ordinal + 1).padStart(2, "0")}`,
            strategy(
              preview.template.strategies[ordinal % preview.template.strategies.length],
              `${preview.template.seed}:${ordinal}`,
            ),
          ]);
        await this.store.audit(c, ids[index], "comparison.draft.created", {
          comparisonId: request.requestId,
          arm: arm.key,
          count: preview.template.countPerArm,
        });
      }
      await c.query(
        "INSERT INTO comparisons(id,name,template,digest,llm_cohort_id,cognition_cohort_id) VALUES($1,$2,$3,$4,$5,$6)",
        [request.requestId, preview.template.name, preview.template, digest, ...ids],
      );
      return { id: request.requestId, cohortIds: ids };
    });
  }
  async list() {
    return (
      await this.store.pool.query(
        "SELECT id,name,created_at,llm_cohort_id,cognition_cohort_id FROM comparisons ORDER BY created_at DESC,id DESC LIMIT 100",
      )
    ).rows;
  }
  async start(id: string, liveAllowed: boolean) {
    const row = (
      await this.store.pool.query("SELECT llm_cohort_id,cognition_cohort_id FROM comparisons WHERE id=$1", [id])
    ).rows[0];
    if (!row) throw new FleetError("NOT_FOUND");
    const ids = [row.llm_cohort_id, row.cognition_cohort_id];
    // Initial paired launch only: resumption must retain each group's original anchor.
    await this.store.setStates(ids, "running", liveAllowed, true);
    return { started: true };
  }
  async inspect(id: string) {
    return transaction(this.store.pool, async (c) => {
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const row = (await c.query("SELECT * FROM comparisons WHERE id=$1", [id])).rows[0];
      if (!row) throw new FleetError("NOT_FOUND");
      const preview = comparisonPreview(row.template),
        arms = [];
      for (const [index, cohortId] of [row.llm_cohort_id, row.cognition_cohort_id].entries()) {
        const cohort = await this.store.cohort(cohortId, c),
          agents = (
            await c.query(
              "SELECT id,ordinal,strategy,account_id,credential_state,state FROM agents WHERE cohort_id=$1 ORDER BY ordinal",
              [cohortId],
            )
          ).rows;
        const matchesTemplate =
          canonical(cohort.model) === canonical(preview.arms[index].model) &&
          canonical(cohort.budget) === canonical(preview.template.budget) &&
          cohort.interval_minutes === preview.template.intervalMinutes &&
          agents.length === preview.template.countPerArm &&
          agents.every(
            (a, ordinal) =>
              a.ordinal === ordinal &&
              canonical(a.strategy) ===
                canonical(
                  strategy(
                    preview.template.strategies[ordinal % preview.template.strategies.length],
                    `${preview.template.seed}:${ordinal}`,
                  ),
                ),
          );
        const turns = (
          await c.query(
            "SELECT count(*)::int turns,count(*) FILTER(WHERE state='finished')::int finished,coalesce(sum(actions),0)::int committed_actions,count(*) FILTER(WHERE pending_command IS NOT NULL)::int pending_commands,count(*) FILTER(WHERE code='WAIT')::int waits FROM turns WHERE cohort_id=$1",
            [cohortId],
          )
        ).rows[0];
        const usage = (
          await c.query(
            "SELECT count(*)::int calls,count(*) FILTER(WHERE status='unknown')::int unknown_calls,count(*) FILTER(WHERE status='reserved')::int reserved_calls,coalesce(sum(tokens),0)::text allocated_tokens,coalesce(sum(input_tokens),0)::text input_tokens,coalesce(sum(output_tokens),0)::text output_tokens FROM compute_ledger WHERE cohort_id=$1",
            [cohortId],
          )
        ).rows[0];
        const messages = (
          await c.query(
            "SELECT count(*) FILTER(WHERE kind='message' AND direction='incoming')::int incoming,count(*) FILTER(WHERE kind='message' AND direction='outgoing')::int outgoing FROM communications WHERE cohort_id=$1",
            [cohortId],
          )
        ).rows[0];
        const cognition = cohort.observation_consent
          ? {
              decisionsWithRecall: 0,
              layaAccepted: 0,
              layaDelivered: 0,
              layaAbstained: 0,
              layaUnavailable: 0,
              beliefsRevised: 0,
              reflectionsAdded: 0,
              duplicateReflectionsSkipped: 0,
            }
          : null;
        if (cognition) {
          const events = (
            await c.query(
              "SELECT id,label,detail_cipher FROM turn_events WHERE cohort_id=$1 AND detail_cipher IS NOT NULL AND label=ANY($2::text[])",
              [
                cohortId,
                [
                  "LLM continuity delivered",
                  "LLM revised memory, plan or social hypotheses",
                  "LLM reviewed continuity without a revision",
                ],
              ],
            )
          ).rows;
          for (const event of events) {
            const detail = this.store.vault.decrypt<Data>(event.detail_cipher, `turn-event:${event.id}`);
            if (event.label === "LLM continuity delivered") {
              cognition.decisionsWithRecall++;
              const recall = object(detail.recallAcceptance);
              if (recall.route === "laya-recall-v1") cognition.layaAccepted++;
              if (detail.recallPairDelivered === true) cognition.layaDelivered++;
              if (recall.assist === "abstained") cognition.layaAbstained++;
              if (recall.assist === "unavailable") cognition.layaUnavailable++;
            } else {
              cognition.beliefsRevised += Number(detail.beliefsRevised ?? 0);
              cognition.reflectionsAdded += Number(detail.reflections ?? 0);
              cognition.duplicateReflectionsSkipped += Number(detail.duplicateReflectionsSkipped ?? 0);
            }
          }
        }
        arms.push({
          key: preview.arms[index].key,
          cohortId,
          name: cohort.name,
          state: cohort.state,
          model: cohort.model,
          anchorAt: cohort.anchor_at,
          observationConsent: cohort.observation_consent,
          matchesTemplate,
          connected: agents.filter((a) => a.account_id).length,
          ready: agents.filter((a) => a.credential_state === "ready" && a.state === "ready").length,
          metrics: { ...turns, ...usage, ...messages },
          cognition,
        });
      }
      return {
        id,
        template: preview.template,
        asOf: this.store.now().toISOString(),
        arms,
        matchesTemplate: arms.every((a) => a.matchesTemplate),
        coverage:
          preview.coverage +
          " Usage/action counters are lifetime observations, not intelligence measurements. Start times, authority, initial game states and exposure must be reviewed; shared game interaction can confound results. Dialogue/cognition telemetry requires consent and is retained for 30 days; older or unconsented decisions are not reconstructed. Accepted revisions and recall delivery do not establish quality or causal benefit. Inspect actual agent evidence.",
      };
    });
  }
}
