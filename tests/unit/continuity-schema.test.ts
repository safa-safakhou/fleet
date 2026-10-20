import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { FleetError } from "../../src/domain.js";
import { ContinuityEngine } from "../../src/engines/continuity/engine.js";
import type { ContinuityModule } from "../../src/engines/continuity/state.js";
import { reactiveProbe } from "../reactive-probe-context.js";

const first = "2a4e4abb-b710-48c3-b742-128300cbdcc3";
const invented = "2a4e4abb-97ac-4117-9c2f-4c857b79c787";
const ids = [first, ...Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`)];
const decision = { kind: "wait", summary: "Wait" };

it.each([false, true, "empty"] as const)(
  "binds citations to final fitted delivery (%s) without constraining decision IDs",
  async (fit) => {
    const evidence = fit === "empty" ? [] : [...ids, first].map((id) => ({ id }));
    const ctx = reactiveProbe(async (_claim, input) => {
      const payload = JSON.parse(input.messages[1].content);
      const delivered = payload.continuity.evidence.map((e: { id: string }) => e.id);
      const check = new Ajv({ strict: false, validateFormats: false }).compile(input.schema);
      expect(check({ decision })).toBe(true);
      expect(
        check({ decision, continuity: { beliefs: [], predictions: [], plan: null, memories: [], reflections: [] } }),
      ).toBe(true);
      const update = (ref: string) => ({
        decision,
        continuity: {
          beliefs: [
            {
              id: "subjective",
              subject: "peer",
              hypothesis: "May help",
              alternative: "May decline",
              confidence: "low",
              evidenceRefs: [ref],
            },
          ],
          predictions: [
            {
              id: "next",
              subject: "self",
              predicate: "position",
              expected: "a4",
              dueBy: { clockId: "ply", value: "2" },
              evidenceRefs: [ref],
            },
          ],
          plan: { text: "Consider options", evidenceRefs: [ref] },
          memories: [{ text: "Observed", evidenceRefs: [ref] }],
          reflections: [{ text: "Uncertain", evidenceRefs: [ref] }],
        },
      });
      expect(check(update(invented))).toBe(false);
      for (const [key, value] of Object.entries(update(invented).continuity))
        expect(check({ decision, continuity: { [key]: value } })).toBe(false);
      for (const id of new Set(ids)) expect(check(update(id))).toBe(delivered.includes(id));
      expect(
        check({
          decision: { kind: "action", schemaId: "board.move.v1", payload: { targetId: invented }, summary: "Act" },
        }),
      ).toBe(true);
      if (fit === true) expect(delivered).toHaveLength(4);
      expect(
        Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
      ).toBeLessThanOrEqual(ctx.claim.turn.cohort.budget?.inputByteLimit ?? 0);
      return { decision: { decision }, inputTokens: 10, outputTokens: 2 };
    });
    ctx.observation.continuity = {} as never;
    if (fit === true) {
      ctx.observation.payload = { position: "a2", optionalHistory: "x".repeat(40000) };
      ctx.packObservation = (o) => ({
        ...o,
        payload: { position: o.payload.position },
        coverage: { omitted: ["optionalHistory"] },
      });
    }
    const module = {
      context: async () => ({
        version: 0,
        evidence,
        memories: [],
        reflections: [],
        beliefs: [],
        predictions: [],
        self: {},
        plan: null,
      }),
      restrict: (_claim: unknown, payload: { evidence: unknown[] }) =>
        expect(payload.evidence).toHaveLength(fit === true ? 4 : evidence.length),
    } as unknown as ContinuityModule;
    await new ContinuityEngine(module).run(ctx);
  },
);

it.each(["correct", "reject-again", "no-budget", "turn-limit", "fenced", "unknown"])(
  "bounds known rejected-update correction and stops unsafe failures: %s",
  async (mode) => {
    let calls = 0,
      contexts = 0,
      applied = 0,
      submitted = 0;
    const traces: unknown[] = [];
    const ctx = reactiveProbe(async (_claim, input) => {
      calls++;
      const payload = JSON.parse(input.messages[1].content);
      if (calls === 2) {
        expect(payload.previousDecision).toMatchObject({
          code: "CONTINUITY_STALE_VERSION",
          submitted: false,
          committed: false,
        });
        expect(payload.continuity.version).toBe(1);
      }
      if (mode === "unknown") throw new FleetError("TRANSPORT_UNCERTAIN");
      return {
        decision: {
          decision: { kind: "action", schemaId: "board.move.v1", payload: {}, summary: "Move" },
          continuity: { memories: [{ text: "Observed", evidenceRefs: [first] }] },
        },
        inputTokens: 10,
        outputTokens: 2,
      };
    });
    ctx.observation.continuity = {} as never;
    if (mode === "turn-limit" && ctx.claim.turn.cohort.budget) ctx.claim.turn.cohort.budget.maxCallsPerTurn = 1;
    ctx.model.remainingCalls = async () => (mode === "no-budget" ? 0 : 2);
    ctx.trace = async (_stage, _label, detail) => {
      traces.push(detail);
    };
    ctx.commands = {
      submit: async () => {
        submitted++;
        return {};
      },
    } as never;
    const module = {
      context: async () => ({ version: contexts++, evidence: [{ id: first }] }),
      restrict: () => {},
      apply: async () => {
        applied++;
        if (mode === "fenced") throw new FleetError("STALE_TASK");
        return { accepted: mode === "correct" && applied === 2, code: "STALE_VERSION" };
      },
      recordCommand: async () => {},
    } as unknown as ContinuityModule;
    const run = new ContinuityEngine(module).run(ctx);
    if (mode === "correct") await run;
    else
      await expect(run).rejects.toThrow(
        mode === "fenced" ? "STALE_TASK" : mode === "unknown" ? "TRANSPORT_UNCERTAIN" : "CONTINUITY_STALE_VERSION",
      );
    expect(calls).toBe(["correct", "reject-again"].includes(mode) ? 2 : 1);
    expect(submitted).toBe(mode === "correct" ? 1 : 0);
    expect(traces).toHaveLength(mode === "fenced" || mode === "unknown" ? 0 : mode === "correct" ? 1 : calls);
  },
);
it("withholds citations and subjective entries whose evidence is removed by adaptive pressure", async () => {
  const evidence = ids.slice(0, 4).map((id) => ({ id, fact: { value: "f".repeat(5000) } }));
  const ctx = reactiveProbe(async (_claim, input) => {
    const packet = JSON.parse(input.messages[1].content);
    const kept = packet.continuity.evidence.map((e: { id: string }) => e.id);
    expect(kept.length).toBeLessThan(evidence.length);
    expect(
      packet.continuity.memories.every((m: { evidenceRefs: string[] }) =>
        m.evidenceRefs.every((id) => kept.includes(id)),
      ),
    ).toBe(true);
    const check = new Ajv({ strict: false }).compile(input.schema);
    for (const e of evidence)
      expect(check({ decision, continuity: { memories: [{ text: "Observed", evidenceRefs: [e.id] }] } })).toBe(
        kept.includes(e.id),
      );
    return { decision: { decision }, inputTokens: 1, outputTokens: 1 };
  });
  const budget = ctx.claim.turn.cohort.budget;
  if (!budget) throw Error("Fixture budget required");
  budget.inputByteLimit = 48000;
  ctx.observation.continuity = {} as never;
  ctx.observation.payload = { core: "current authority and resources ".repeat(800), optional: "x".repeat(50000) };
  ctx.packObservation = (o, n) => {
    const v = { ...o, payload: { core: o.payload.core } };
    if (Buffer.byteLength(JSON.stringify(v)) > n) throw new FleetError("CONTEXT_LIMIT", true);
    return v;
  };
  await new ContinuityEngine({
    context: async () => ({
      version: 0,
      self: {},
      evidence,
      beliefs: [],
      predictions: [],
      reflections: [],
      plan: null,
      memories: evidence.map((e) => ({ text: "Grounded", evidenceRefs: [e.id] })),
    }),
    restrict: () => {},
  } as never).run(ctx);
});
