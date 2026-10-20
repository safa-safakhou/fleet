import { createHash } from "node:crypto";
import type { Cognition } from "../cognition.js";
import { intentFingerprint, reconcileContinuation, validateContinuationPlan } from "../continuation.js";
import { transaction } from "../db.js";
import { type Data, FleetError } from "../domain.js";
import {
  ContinuityObservationSchema,
  ContinuityUpdateSchema,
  empty,
  factSchema,
  later,
  lifetime,
  type Saved,
  type State,
} from "../modules/continuity/v1/state.js";
import { Observability } from "../observability.js";
import type { Bindings } from "../platform/bindings.js";
import type { BindingRef, ContinuityFact, DomainTime, Observation } from "../platform/contracts.js";
import type { TaskClaim, TaskStore } from "../platform/tasks.js";
export class ContinuityV1Repository {
  private delivered = new Map<string, { version: number; ids: string[]; time: DomainTime; fingerprint: string }>();
  constructor(
    private tasks: TaskStore,
    private bindings: Bindings,
    private cognition: Cognition,
    private profile: { id: "reactive-cognition" | "specialist-coordinator"; version: "1" } = {
      id: "reactive-cognition",
      version: "1",
    },
  ) {}
  private get namespace() {
    return `${this.profile.id}@${this.profile.version}`;
  }
  private key(task: TaskClaim) {
    return `${task.turn.id}:${task.fence}`;
  }
  private async authorized(binding: BindingRef, task: TaskClaim) {
    if (
      binding.id !== task.bindingId ||
      task.profile.id !== this.profile.id ||
      task.profile.version !== this.profile.version
    )
      throw new FleetError("CONTINUITY_BINDING_MISMATCH");
    if ((await this.bindings.agentFor(binding)) !== task.turn.agentId)
      throw new FleetError("CONTINUITY_BINDING_MISMATCH");
    await this.tasks.check(task);
  }
  async context(binding: BindingRef, task: TaskClaim, observation: Observation): Promise<Data> {
    const namespace = this.namespace;
    await this.authorized(binding, task);
    const parsed = ContinuityObservationSchema.safeParse(observation.continuity);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data)) > 100000)
      throw new FleetError("CONTINUITY_OBSERVATION_REQUIRED");
    if (
      !Number.isFinite(Date.parse(observation.observedAt)) ||
      Date.parse(observation.observedAt) > this.tasks.store.now().getTime()
    )
      throw new FleetError("INVALID_EVIDENCE_TIME");
    const facts = parsed.data.facts;
    if (facts.some((f) => !observation.sourceRefs.includes(f.sourceRef))) throw new FleetError("UNSCOPED_EVIDENCE");
    const currentIds: string[] = [];
    for (const fact of facts)
      currentIds.push(
        await this.cognition.capture(
          task.turn,
          "observation",
          `${namespace}:${binding.id}:${fact.kind === "state" ? observation.revision : "event"}:${JSON.stringify(fact)}`,
          {
            namespace,
            bindingId: binding.id,
            fact,
            link: { sourceRef: fact.sourceRef, observedAt: observation.observedAt, taskId: task.taskId },
            environmentTime: observation.environmentTime,
          },
        ),
      );
    const db = this.tasks.store.pool;
    const row = (await db.query("SELECT * FROM continuity_states WHERE binding_id=$1", [binding.id])).rows[0];
    if (row && row.namespace !== namespace) throw new FleetError("CONTINUITY_NAMESPACE_MISMATCH");
    const state: State = row
      ? this.tasks.store.vault.decrypt<State>(row.detail_cipher, `${namespace}:${binding.id}`)
      : empty();
    const fresh = (entry: { recordedAt: string }) =>
      Date.parse(entry.recordedAt) > this.tasks.store.now().getTime() - lifetime;
    state.beliefs = state.beliefs.filter(fresh);
    state.predictions = state.predictions.filter(fresh);
    state.memories = state.memories.filter(fresh);
    state.reflections = state.reflections.filter(fresh);
    if (state.plan && !fresh(state.plan)) state.plan = null;
    const rows = (
      await db.query(
        "SELECT id FROM cognitive_episodes WHERE agent_id=$1 AND occurred_at>$2 ORDER BY occurred_at DESC,sequence DESC LIMIT 200",
        [task.turn.agentId, new Date(this.tasks.store.now().getTime() - lifetime)],
      )
    ).rows;
    const owned = (
      await this.cognition.retainedEvidence(
        task.turn.agentId,
        rows.map((r) => r.id),
      )
    ).filter(
      (e) =>
        e.detail.namespace === namespace &&
        e.detail.bindingId === binding.id &&
        factSchema.safeParse(e.detail.fact).success,
    );
    // Protect retained anchors before filling recent evidence; omitted originals cannot support a new update.
    const anchors = new Set(
      [
        ...state.beliefs,
        ...state.predictions,
        ...state.memories,
        ...state.reflections,
        ...(state.plan ? [state.plan] : []),
      ].flatMap((x) => x.evidenceRefs),
    );
    const selected = [
      ...owned.filter((e) => currentIds.includes(e.id)),
      ...owned.filter((e) => anchors.has(e.id)),
      ...owned,
    ]
      .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
      .slice(0, 12);
    const available = new Set(owned.map((e) => e.id));
    const grounded = <T extends { evidenceRefs: string[] }>(entries: T[]) =>
      entries.filter((e) => e.evidenceRefs.every((ref) => available.has(ref)));
    const evidence = selected.map((e) => ({
      id: e.id,
      fact: e.detail.fact,
      link: e.detail.link,
      environmentTime: e.detail.environmentTime,
    }));
    const predictions = grounded(state.predictions).map((p) => {
      const outcomes = owned.filter((e) => {
        const f = e.detail.fact as ContinuityFact;
        const at = f.occurredAt ?? (e.detail.environmentTime as DomainTime);
        return (
          f.subject === p.subject &&
          f.predicate === p.predicate &&
          f.kind !== "statement" &&
          (f.kind === "state" || !!f.occurredAt) &&
          Date.parse(e.at) > Date.parse(p.recordedAt) &&
          later(at, p.environmentTime) &&
          at.clockId === p.dueBy.clockId &&
          !later(at, p.dueBy)
        );
      });
      const latest = outcomes.at(-1),
        actual = latest?.detail.fact as ContinuityFact | undefined;
      return {
        ...p,
        status: actual ? (actual.value === p.expected ? "matched" : "contradicted") : "unresolved",
        observed: actual?.value ?? null,
        outcomeRef: latest?.id ?? null,
      };
    });
    const fingerprint = intentFingerprint(parsed.data.self.ownerValues);
    const progress = state.plan
      ? reconcileContinuation(
          {
            version: row?.version ?? 0,
            goal: { id: "continuity", title: state.plan.text },
            steps: state.plan.steps ?? [],
            nextStepId: state.plan.nextStepId ?? null,
            wait: state.plan.wait ?? null,
            ownerIntentFingerprint: state.plan.ownerIntentFingerprint,
            outcomes: [],
            proposalKeys: {},
          },
          facts
            .filter((f) => f.kind !== "statement")
            .map((f) => ({ kind: f.predicate, referenceId: f.subject, value: f.value })),
          fingerprint,
        )
      : null;
    const context: Data = {
      schemaVersion: "fleet.continuity.v1",
      version: row?.version ?? 0,
      self: parsed.data.self,
      evidence,
      beliefs: grounded(state.beliefs).map((b) => ({ ...b, interpretation: true, motiveProven: false })),
      predictions,
      plan: state.plan && grounded([state.plan]).length ? { ...state.plan, progress } : null,
      memories: grounded(state.memories),
      reflections: grounded(state.reflections),
      coverage: {
        retentionDays: 30,
        evidenceLimit: 12,
        evidenceOmitted: Math.max(0, owned.length - selected.length),
        stateWithMissingSourcesWithheld: true,
        meaning:
          "Owner values and current facts are separate from subjective hypotheses, plans and predictions. Peer statements are not delivery or motive. Missing evidence remains unresolved; no update is required. Predictions test the next later observed fact of the named subject/predicate within their stated horizon, not all possible world events. Historical commitments/outcomes require authoritative occurrence time.",
      },
    };
    this.delivered.set(this.key(task), {
      version: Number(context.version),
      ids: selected.map((e) => e.id),
      time: observation.environmentTime,
      fingerprint,
    });
    if (this.delivered.size > 1000) {
      const oldest = this.delivered.keys().next().value;
      if (oldest) this.delivered.delete(oldest);
    }
    return context;
  }
  /** Restrict citations to the actual final fitted model input. */
  restrict(task: TaskClaim, context: Data) {
    const delivered = this.delivered.get(this.key(task));
    if (!delivered) throw new FleetError("CONTINUITY_CONTEXT_REQUIRED");
    const ids = (context.evidence as { id: string }[]).map((e) => e.id);
    delivered.ids = delivered.ids.filter((id) => ids.includes(id));
  }
  async apply(
    binding: BindingRef,
    task: TaskClaim,
    expectedVersion: number,
    raw: unknown,
  ): Promise<{ accepted: boolean; version: number; code: string }> {
    const namespace = this.namespace;
    await this.authorized(binding, task);
    const reject = (code: string, version = expectedVersion) => ({ accepted: false, version, code });
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return reject("INVALID_VERSION", 0);
    const update = ContinuityUpdateSchema.safeParse(raw);
    if (!update.success || Buffer.byteLength(JSON.stringify(raw)) > 5000) return reject("INVALID_UPDATE");
    for (const key of ["beliefs", "predictions"] as const) {
      const items = update.data[key] ?? [];
      if (new Set(items.map((x) => x.id)).size !== items.length) return reject("DUPLICATE_ID");
    }
    if (update.data.plan) {
      const p = update.data.plan;
      try {
        validateContinuationPlan({
          expectedVersion,
          goal: { id: "continuity", title: p.text },
          steps: p.steps ?? [],
          nextStepId: p.nextStepId ?? null,
          wait: p.wait ?? null,
        });
      } catch (error) {
        if (error instanceof FleetError) return reject(error.code);
        throw error;
      }
    }
    const delivery = this.delivered.get(this.key(task));
    if (!delivery) return reject("CONTEXT_REQUIRED");
    const refs = [
      ...(update.data.beliefs ?? []),
      ...(update.data.predictions ?? []),
      ...(update.data.memories ?? []),
      ...(update.data.reflections ?? []),
      ...(update.data.plan ? [update.data.plan] : []),
    ].flatMap((e) => e.evidenceRefs);
    if (refs.some((ref) => !delivery.ids.includes(ref))) return reject("EVIDENCE_NOT_DELIVERED");
    const result = await transaction(this.tasks.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [task.turn.cohortId]);
      await this.tasks.check(task, c);
      const row = (await c.query("SELECT * FROM continuity_states WHERE binding_id=$1 FOR UPDATE", [binding.id]))
          .rows[0],
        version = row?.version ?? 0;
      const digest = createHash("sha256").update(JSON.stringify(update.data)).digest("hex");
      const prior = (
        await c.query("SELECT * FROM continuity_updates WHERE turn_id=$1 AND expected_version=$2", [
          task.turn.id,
          expectedVersion,
        ])
      ).rows[0];
      if (prior?.update_digest === digest) return { accepted: true, version: prior.version, code: "ALREADY_APPLIED" };
      if (version !== expectedVersion || delivery.version !== expectedVersion) return reject("STALE_VERSION", version);
      const sources = await this.cognition.retainedEvidence(task.turn.agentId, [...new Set(refs)], c);
      if (
        refs.some(
          (id) =>
            !sources.some(
              (e) =>
                e.id === id &&
                e.detail.namespace === namespace &&
                e.detail.bindingId === binding.id &&
                factSchema.safeParse(e.detail.fact).success,
            ),
        )
      )
        return reject("EVIDENCE_EXPIRED", version);
      for (const b of update.data.beliefs ?? [])
        if (
          !sources.some((e) => b.evidenceRefs.includes(e.id) && (e.detail.fact as ContinuityFact).subject === b.subject)
        )
          return reject("SUBJECT_NOT_OBSERVED", version);
      for (const b of update.data.beliefs ?? [])
        if (
          b.confidence === "medium" &&
          new Set(
            sources
              .filter(
                (e) =>
                  b.evidenceRefs.includes(e.id) &&
                  (e.detail.fact as ContinuityFact).subject === b.subject &&
                  (e.detail.fact as ContinuityFact).kind !== "statement",
              )
              .map((e) => e.id),
          ).size < 2
        )
          return reject("CONFIDENCE_NEEDS_CORROBORATION", version);
      for (const p of update.data.predictions ?? [])
        if (
          !sources.some((e) => p.evidenceRefs.includes(e.id) && (e.detail.fact as ContinuityFact).subject === p.subject)
        )
          return reject("SUBJECT_NOT_OBSERVED", version);
      for (const p of update.data.predictions ?? [])
        if (!later(p.dueBy, delivery.time)) return reject("INVALID_PREDICTION_HORIZON", version);
      const state: State = row
          ? this.tasks.store.vault.decrypt<State>(row.detail_cipher, `${namespace}:${binding.id}`)
          : empty(),
        at = this.tasks.store.now().toISOString();
      const save = <T>(e: T): Saved<T> => ({
        ...e,
        recordedAt: at,
        environmentTime: delivery.time,
        ownerIntentFingerprint: delivery.fingerprint,
      });
      const merge = <T extends { id: string }>(old: Saved<T>[], next: T[] | undefined, limit: number) =>
        [...(next ?? []).map(save), ...old.filter((e) => !next?.some((n) => n.id === e.id))].slice(0, limit);
      state.beliefs = merge(state.beliefs, update.data.beliefs, 20);
      state.predictions = merge(state.predictions, update.data.predictions, 20);
      // Reusing a prediction id to rewrite its expectation would erase the prior test.
      if (
        (update.data.predictions ?? []).some(
          (p) =>
            row &&
            this.tasks.store.vault
              .decrypt<State>(row.detail_cipher, `${namespace}:${binding.id}`)
              .predictions.some((old) => old.id === p.id),
        )
      )
        return reject("PREDICTION_IMMUTABLE", version);
      if (update.data.plan !== undefined) state.plan = update.data.plan ? save(update.data.plan) : null;
      for (const key of ["memories", "reflections"] as const)
        state[key] = [...(update.data[key] ?? []).map(save), ...state[key]]
          .filter((e, i, a) => a.findIndex((x) => x.text === e.text) === i)
          .slice(0, 20);
      await c.query(
        "INSERT INTO continuity_states(binding_id,cohort_id,namespace,version,updated_at,detail_cipher) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(binding_id) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at,detail_cipher=excluded.detail_cipher",
        [
          binding.id,
          task.turn.cohortId,
          namespace,
          version + 1,
          this.tasks.store.now(),
          this.tasks.store.vault.encrypt(state, `${namespace}:${binding.id}`),
        ],
      );
      await c.query(
        "INSERT INTO continuity_updates(turn_id,expected_version,cohort_id,recorded_at,update_digest,version) VALUES($1,$2,$3,$4,$5,$6)",
        [task.turn.id, expectedVersion, task.turn.cohortId, this.tasks.store.now(), digest, version + 1],
      );
      return { accepted: true, version: version + 1, code: "APPLIED" };
    });
    await new Observability(this.tasks.store).record(task.turn, "thinking", "Continuity update checked", {
      bindingId: binding.id,
      namespace,
      expectedVersion,
      ...result,
      update: update.data,
    });
    return result;
  }
  async recordCommand(binding: BindingRef, task: TaskClaim, result: import("../platform/contracts.js").ActionOutcome) {
    const namespace = this.namespace;
    await this.authorized(binding, task);
    const delivery = this.delivered.get(this.key(task));
    if (!delivery) return;
    const sourceRef = result.sourceRefs[0] ?? `local-command:${result.commandId}`;
    await this.cognition.capture(
      task.turn,
      "receipt",
      `${namespace}:${binding.id}:command:${result.commandId}:${result.status}`,
      {
        namespace,
        bindingId: binding.id,
        fact: {
          sourceRef,
          kind: "state",
          subject: "self",
          predicate: `command-admission:${result.commandId}`,
          value: result.status,
        },
        link: { sourceRef, observedAt: this.tasks.store.now().toISOString(), taskId: task.taskId },
        environmentTime: delivery.time,
        code: result.code,
        meaning: "Command admission only; material fulfilment unknown.",
      },
    );
  }
  async inspect(binding: BindingRef) {
    const namespace = this.namespace;
    const agent = await this.tasks.store.agent(await this.bindings.agentFor(binding)),
      cohort = await this.tasks.store.cohort(agent.cohort_id);
    if (!cohort.observation_consent) return { available: false, code: "OBSERVATION_CONSENT_REQUIRED" };
    const row = (await this.tasks.store.pool.query("SELECT * FROM continuity_states WHERE binding_id=$1", [binding.id]))
      .rows[0];
    return row
      ? {
          available: true,
          namespace,
          version: row.version,
          state: this.tasks.store.vault.decrypt<State>(row.detail_cipher, `${namespace}:${binding.id}`),
        }
      : { available: true, namespace, version: 0, state: empty() };
  }
}
