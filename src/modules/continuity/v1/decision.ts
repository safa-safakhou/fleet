import { z } from "zod";
import { type Data, object } from "../../../domain.js";
import type { DecisionContext } from "../../decision-step/v1/context.js";
import { BoundedDecisionStep, ReactiveDecision, RejectedDecision } from "../../decision-step/v1/engine.js";
import { ContinuityUpdateSchema, type ContinuityV1 } from "./state.js";

const Envelope = z.object({ decision: ReactiveDecision, continuity: ContinuityUpdateSchema.optional() }).strict();
/** Full continuity/planning/reflection/belief bundle. No additional model calls or action authority. */
export class ContinuityDecisionStep extends BoundedDecisionStep {
  protected formatInstructions() {
    return (
      super.formatInstructions() +
      ' For this profile wrap that decision as {"decision":<the outer decision>,"continuity":<optional supported update>}. Omit continuity when no grounded change is needed.'
    );
  }
  protected additionalInstructions() {
    return " Continuity is optional subjective memory/planning/reflection/belief, never owner intent/authority. Fresh facts override stale assumptions. Cite delivered IDs; citation!=truth. Accepted proposal!=consent/delivery. Give belief alternatives; missing evidence unresolved. Prediction concerns the next later subject/predicate fact before dueBy, not exhaustive history. Omit unchanged/empty updates; no memory/chat quota. Retain only grounded changes useful to future decisions.";
  }
  protected decisionSchema: Data = z.toJSONSchema(Envelope, { target: "draft-7" });
  constructor(private continuity: ContinuityV1) {
    super();
  }
  async runContext(ctx: DecisionContext) {
    const observation = ctx.observation.continuity ? ctx.observation : await ctx.observe({ continuity: true });
    return super.runContext({ ...ctx, observation, observe: (q) => ctx.observe({ ...q, continuity: true }) });
  }
  protected async extension(_ctx: DecisionContext, observation: DecisionContext["observation"]) {
    return { continuity: await this.continuity.context(observation) };
  }
  protected modelObservation(observation: DecisionContext["observation"]) {
    const { continuity: _continuity, ...current } = observation;
    return { ...current, coverage: { ...current.coverage, continuityDeliveredSeparately: true } };
  }
  protected fitExtension(payload: Data) {
    const c = object(payload.continuity);
    let omitted = 0;
    // Bound older context before spending the input allowance on current authorized state.
    for (const key of ["memories", "reflections", "beliefs", "predictions", "evidence"]) {
      const items = Array.isArray(c[key]) ? (c[key] as unknown[]) : [];
      const keep = key === "evidence" ? 4 : 3;
      omitted += Math.max(0, items.length - keep);
      c[key] = items.slice(0, keep);
    }
    const self = object(c.self);
    for (const key of ["needs", "dependencies"]) {
      const section = { ...object(self[key]) };
      for (const [name, value] of Object.entries(section))
        if (Array.isArray(value) && value.length > 3) {
          omitted += value.length - 3;
          section[name] = value.slice(0, 3);
        }
      self[key] = section;
    }
    c.self = self;
    const retained = new Set((c.evidence as { id: string }[]).map((e) => e.id));
    for (const key of ["beliefs", "predictions", "memories", "reflections"]) {
      const items = c[key] as { evidenceRefs: string[] }[];
      const grounded = items.filter((e) => e.evidenceRefs.every((ref) => retained.has(ref)));
      omitted += items.length - grounded.length;
      c[key] = grounded;
    }
    if (c.plan && !(object(c.plan).evidenceRefs as string[]).every((ref) => retained.has(ref))) {
      c.plan = null;
      omitted++;
    }
    c.coverage = {
      ...object(c.coverage),
      budgetOmittedEntries: Number(object(c.coverage).budgetOmittedEntries ?? 0) + omitted,
    };
    payload.continuity = c;
  }
  protected reduceExtension(payload: Data): boolean {
    const c = object(payload.continuity),
      self = object(c.self);
    const candidates: { path: string; items: unknown[] }[] = [];
    for (const section of ["needs", "dependencies"])
      for (const [key, value] of Object.entries(object(self[section])))
        if (Array.isArray(value) && value.length) candidates.push({ path: `self.${section}.${key}`, items: value });
    for (const key of ["memories", "reflections", "beliefs", "predictions", "evidence"])
      if (Array.isArray(c[key]) && c[key].length) candidates.push({ path: key, items: c[key] });
    candidates.sort(
      (a, b) => Buffer.byteLength(JSON.stringify(b.items.at(-1))) - Buffer.byteLength(JSON.stringify(a.items.at(-1))),
    );
    const selected = candidates[0];
    if (!selected) return false;
    selected.items.pop();
    const coverage = object(c.coverage);
    c.coverage = {
      ...coverage,
      budgetOmittedEntries: Number(coverage.budgetOmittedEntries ?? 0) + 1,
      budgetOmittedPaths: [
        ...new Set([...(Array.isArray(coverage.budgetOmittedPaths) ? coverage.budgetOmittedPaths : []), selected.path]),
      ],
    };
    // Removing evidence also withholds every subjective update that loses a source.
    this.fitExtension(payload);
    return true;
  }
  protected beforeRequest(_ctx: DecisionContext, payload: Data) {
    this.continuity.restrict(object(payload.continuity));
  }
  protected generationSchema(payload: Data, base: Data): Data {
    const schema = structuredClone(base);
    const continuity = object(object(schema.properties).continuity);
    const evidence = object(payload.continuity).evidence;
    const ids = [...new Set((Array.isArray(evidence) ? evidence : []).map((e) => object(e).id))].filter(
      (id): id is string => typeof id === "string",
    );
    if (!ids.length) {
      // No empty enums or impossible reference arrays: keep optional abstention and empty updates valid.
      const properties = object(continuity.properties);
      for (const key of ["beliefs", "predictions", "memories", "reflections"])
        properties[key] = { ...object(properties[key]), maxItems: 0 };
      properties.plan = { type: "null" };
    } else {
      const bind = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const properties = object(object(node).properties);
        if (properties.evidenceRefs)
          properties.evidenceRefs = {
            ...object(properties.evidenceRefs),
            items: { type: "string", enum: ids },
          };
        for (const value of Object.values(node)) bind(value);
      };
      bind(continuity);
    }
    return schema;
  }
  protected async afterCommand(_ctx: DecisionContext, result: import("../../../platform/contracts.js").ActionOutcome) {
    await this.continuity.recordCommand(result);
  }
  protected async decode(_ctx: DecisionContext, raw: unknown, payload: Data) {
    const envelope = Envelope.safeParse(raw);
    if (!envelope.success) return ReactiveDecision.safeParse(null);
    if (envelope.data.continuity) {
      const result = await this.continuity.apply(Number(object(payload.continuity).version), envelope.data.continuity);
      if (!result.accepted)
        throw new RejectedDecision(
          `CONTINUITY_${result.code}`,
          "The continuity update was rejected without saving it or preparing its command. Reconsider from the fresh continuity version and delivered evidence IDs. You may correct or omit the optional update, read, act or wait. Never invent evidence, claim fulfilment or replay uncertain commands.",
        );
    }
    return ReactiveDecision.safeParse(envelope.data.decision);
  }
}
