import { afterEach, expect, it } from "vitest";
import { Cognition } from "../../src/cognition.js";
import { ContinuityEngine } from "../../src/engines/continuity/engine.js";
import { ContinuityModule } from "../../src/engines/continuity/state.js";
import type { Observation } from "../../src/platform/contracts.js";
import { FakeModel } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await platformFixture();
  cleanup = () => f.pool.end();
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, { id: "reactive-cognition", version: "1" });
  f.board.adapter.capabilities.events = "poll";
  f.board.adapter.capabilities.continuity = true;
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    events: async (c) => ({ events: [], nextCursor: c, resyncRequired: false }),
  });
  await f.store.setState(f.group.id, "running", true);
  await f.enqueue();
  const claim = await f.claim(),
    binding = f.group.bindings[0];
  const module = new ContinuityModule(f.tasks, f.bindings, new Cognition(f.store));
  return { ...f, claim, binding, module };
}
function observation(f: Awaited<ReturnType<typeof setup>>, facts: unknown[] = [], time = "0"): Observation {
  return {
    schemaId: "board.position.v1",
    revision: time,
    observedAt: f.now().toISOString(),
    environmentTime: { clockId: "board.ply", value: time },
    sourceRefs: ["board:current"],
    payload: {},
    coverage: {},
    continuity: {
      schemaVersion: "fleet.continuity-observation.v1",
      self: {
        capabilities: ["move"],
        needs: { position: "legal" },
        dependencies: {},
        ownerValues: { objective: "finish" },
      },
      facts,
    },
  } as Observation;
}
const fact = (value: string, kind = "state", subject = "self", predicate = "position") => ({
  sourceRef: "board:current",
  kind,
  subject,
  predicate,
  value,
});
it("delivers an optional source-linked memory to a later engine turn of the same binding", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  let round = 0,
    savedRef = "",
    calls = 0;
  f.board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    observe: async () => observation(f, [fact(round ? "a4" : "a2")], String(round)),
  });
  const model = {
    decide: async (input: { messages: { content: string }[] }) => {
      calls++;
      const context = JSON.parse(input.messages[1].content).continuity;
      if (calls === 1) {
        savedRef = context.evidence[0].id;
        return {
          decision: {
            decision: { kind: "wait", summary: "Remember the earlier position" },
            continuity: { memories: [{ text: "Previously observed a2", evidenceRefs: [savedRef] }] },
          },
          inputTokens: 500,
          outputTokens: 50,
        };
      }
      expect(context.version).toBe(1);
      expect(context.memories).toMatchObject([{ text: "Previously observed a2", evidenceRefs: [savedRef] }]);
      expect(context.evidence.some((e: { id: string }) => e.id === savedRef)).toBe(true);
      expect(context.evidence.some((e: { fact: { value: string } }) => e.fact.value === "a4")).toBe(true);
      return {
        decision: { decision: { kind: "wait", summary: "Current position differs from remembered position" } },
        inputTokens: 500,
        outputTokens: 50,
      };
    },
  };
  const h = f.host(model);
  h.engines.register(new ContinuityEngine());
  await h.host.run(f.claim);
  round = 1;
  f.advance(16 * 60000);
  await f.tasks.upsertFromEvent(
    f.binding,
    {
      id: "later-position",
      type: "changed",
      sourceRef: "board:current",
      observedAt: f.now().toISOString(),
      environmentTime: { clockId: "board.ply", value: "1" },
      metadata: {},
    },
    "later-position",
  );
  const next = await f.tasks.claim("memory-followup", f.now());
  if (!next) throw Error("FOLLOWUP_CLAIM_REQUIRED");
  expect(next.bindingId).toBe(f.binding.id);
  await h.host.run(next);
  expect(calls).toBe(2);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
  ]);
});
it("persists a prediction before a future fact and keeps absent evidence unresolved", async () => {
  const f = await setup(),
    c = await f.module.context(f.binding, f.claim, observation(f, [fact("a2")]));
  const update = {
    predictions: [
      {
        id: "next",
        subject: "self",
        predicate: "position",
        expected: "a4",
        dueBy: { clockId: "board.ply", value: "3" },
        evidenceRefs: [(c.evidence as { id: string }[])[0].id],
      },
    ],
  };
  expect(await f.module.apply(f.binding, f.claim, 0, update)).toMatchObject({ accepted: true, version: 1 });
  f.advance(1000);
  let context = await new ContinuityModule(f.tasks, f.bindings, new Cognition(f.store)).context(
    f.binding,
    f.claim,
    observation(f, [], "1"),
  );
  expect(context.predictions).toMatchObject([{ status: "unresolved" }]);
  context = await f.module.context(f.binding, f.claim, observation(f, [fact("a4")], "2"));
  expect(context.predictions).toMatchObject([{ status: "matched" }]);
});
it("rejects retrospective tests, exposes contradictions and keeps statements distinct from outcomes", async () => {
  const f = await setup(),
    context = await f.module.context(f.binding, f.claim, observation(f, [fact("a2")]));
  const evidence = (context.evidence as { id: string }[])[0].id;
  expect(
    await f.module.apply(f.binding, f.claim, 0, {
      predictions: [
        {
          id: "next",
          subject: "self",
          predicate: "position",
          expected: "a4",
          dueBy: { clockId: "board.ply", value: "3" },
          evidenceRefs: [evidence],
        },
      ],
      beliefs: [
        {
          id: "b",
          subject: "peer:opaque",
          hypothesis: "May help",
          alternative: "May decline",
          confidence: "low",
          evidenceRefs: [evidence],
        },
      ],
    }),
  ).toMatchObject({ accepted: false, code: "SUBJECT_NOT_OBSERVED" });
  await f.module.apply(f.binding, f.claim, 0, {
    predictions: [
      {
        id: "next",
        subject: "self",
        predicate: "position",
        expected: "a4",
        dueBy: { clockId: "board.ply", value: "3" },
        evidenceRefs: [evidence],
      },
    ],
  });
  expect((await f.module.context(f.binding, f.claim, observation(f, [fact("a4")]))).predictions).toMatchObject([
    { status: "unresolved" },
  ]);
  f.advance(1000);
  expect((await f.module.context(f.binding, f.claim, observation(f, [fact("a3")], "1"))).predictions).toMatchObject([
    { status: "contradicted" },
  ]);
});
it("records fulfilled help and a lost battle separately without attributing motives", async () => {
  const f = await setup(),
    c = await f.module.context(
      f.binding,
      f.claim,
      observation(f, [fact("fulfilled", "commitment", "peer:one", "help"), fact("lost", "outcome", "self", "battle")]),
    );
  expect(c.evidence).toHaveLength(2);
  expect(c.beliefs).toEqual([]);
  expect(c.self).toMatchObject({ capabilities: ["move"] });
  const refs = (c.evidence as { id: string; fact: { subject: string } }[])
    .filter((e) => e.fact.subject === "peer:one")
    .map((e) => e.id);
  expect(
    await f.module.apply(f.binding, f.claim, 0, {
      beliefs: [
        {
          id: "ally",
          subject: "peer:one",
          hypothesis: "May honor help",
          alternative: "One fulfilled agreement may be exceptional",
          confidence: "low",
          evidenceRefs: [refs[0]],
        },
      ],
    }),
  ).toMatchObject({ accepted: true });
  expect(
    await f.module.apply(f.binding, f.claim, 0, { memories: [{ text: "different", evidenceRefs: refs }] }),
  ).toMatchObject({ accepted: false, code: "STALE_VERSION" });
});
it("rejects foreign, evicted, expired and undelivered sources and fences stale tasks", async () => {
  const f = await setup(),
    c = await f.module.context(f.binding, f.claim, observation(f, [fact("a2")])),
    ref = (c.evidence as { id: string }[])[0].id;
  expect(
    await f.module.apply(f.binding, f.claim, 0, {
      memories: [{ text: "fake", evidenceRefs: ["00000000-0000-4000-8000-000000000000"] }],
    }),
  ).toMatchObject({ accepted: false, code: "EVIDENCE_NOT_DELIVERED" });
  await f.pool.query("DELETE FROM cognitive_episodes WHERE id=$1", [ref]);
  expect(
    await f.module.apply(f.binding, f.claim, 0, { memories: [{ text: "gone", evidenceRefs: [ref] }] }),
  ).toMatchObject({ accepted: false, code: "EVIDENCE_EXPIRED" });
  await f.tasks.finish(f.claim, "WAIT");
  await expect(f.module.context(f.binding, f.claim, observation(f))).rejects.toThrow();
});
it("runs the complete profile in a non-social environment with optional abstention and unchanged shared accounting", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({ ...(await connect(b)), observe: async () => observation(f, [fact("a2")]) });
  const model = new FakeModel([{ decision: { kind: "wait", summary: "Wait" } }]),
    h = f.host(model);
  h.engines.register(new ContinuityEngine());
  await h.host.run(f.claim);
  expect(model.inputs).toHaveLength(1);
  expect(JSON.stringify(model.inputs)).toContain("fleet.continuity");
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
});

it("keeps encrypted state across restart, detects owner-intent changes and withholds inspection after consent revocation", async () => {
  const f = await setup(),
    c = await f.module.context(f.binding, f.claim, observation(f, [fact("a2")])),
    ref = (c.evidence as { id: string }[])[0].id;
  const update = {
    plan: {
      text: "Reach a4",
      evidenceRefs: [ref],
      steps: [
        {
          id: "move",
          intent: "Reach a4",
          dependsOn: [],
          postcondition: { kind: "position", referenceId: "self", operator: "equals", value: "a4" },
        },
      ],
      nextStepId: "move",
      wait: null,
    },
    memories: [{ text: "Private fixture memory", evidenceRefs: [ref] }],
    reflections: [{ text: "Current position alone proves no victory", evidenceRefs: [ref] }],
  };
  expect(await f.module.apply(f.binding, f.claim, 0, update)).toMatchObject({ accepted: true, version: 1 });
  expect(await f.module.apply(f.binding, f.claim, 0, update)).toMatchObject({
    accepted: true,
    code: "ALREADY_APPLIED",
  });
  const reloaded = new ContinuityModule(f.tasks, f.bindings, new Cognition(f.store));
  const next = observation(f, [fact("a4")], "1");
  const context = await reloaded.context(f.binding, f.claim, next);
  expect(context.plan).toMatchObject({ progress: { steps: [{ status: "observed_complete" }] } });
  next.continuity!.self.ownerValues = { objective: "different" };
  expect((await reloaded.context(f.binding, f.claim, next)).plan).toMatchObject({
    progress: { goalStatus: "needs_review" },
  });
  expect(await reloaded.inspect(f.binding)).toMatchObject({ available: false });
  await f.store.consent(f.group.id, true);
  expect(await reloaded.inspect(f.binding)).toMatchObject({ available: true, version: 1 });
  const row = (await f.pool.query("SELECT detail_cipher FROM continuity_states")).rows[0];
  expect(row.detail_cipher).not.toContain("Private fixture");
  await f.store.consent(f.group.id, false);
  expect(await reloaded.inspect(f.binding)).toMatchObject({ available: false });
  expect((await f.pool.query("SELECT detail_cipher FROM turn_events WHERE detail_cipher IS NOT NULL")).rowCount).toBe(
    0,
  );
});
it("validates retained source age, actual delivery and binding scope at apply time", async () => {
  const f = await setup(),
    c = await f.module.context(f.binding, f.claim, observation(f, [fact("a2")])),
    ref = (c.evidence as { id: string }[])[0].id;
  await expect(f.module.context(f.group.bindings[1], f.claim, observation(f))).rejects.toThrow(
    "CONTINUITY_BINDING_MISMATCH",
  );
  f.module.restrict(f.claim, { evidence: [] });
  expect(
    await f.module.apply(f.binding, f.claim, 0, { memories: [{ text: "evicted", evidenceRefs: [ref] }] }),
  ).toMatchObject({ code: "EVIDENCE_NOT_DELIVERED" });
  await f.module.context(f.binding, f.claim, observation(f, [fact("a2")]));
  await f.pool.query("UPDATE cognitive_episodes SET occurred_at=$2 WHERE id=$1", [
    ref,
    new Date(f.now().getTime() - 31 * 86400000),
  ]);
  expect(
    await f.module.apply(f.binding, f.claim, 0, { memories: [{ text: "expired", evidenceRefs: [ref] }] }),
  ).toMatchObject({ code: "EVIDENCE_EXPIRED" });
  await new Cognition(f.store).prune();
  expect((await f.pool.query("SELECT * FROM cognitive_episodes")).rowCount).toBe(0);
});
it("updates a subjective relationship with contradictory new evidence and never treats a statement as fulfilment", async () => {
  const f = await setup(),
    c = await f.module.context(
      f.binding,
      f.claim,
      observation(f, [fact("Will help", "statement", "peer:opaque", "claim")]),
    ),
    ref = (c.evidence as { id: string }[])[0].id;
  const belief = {
    id: "ally",
    subject: "peer:opaque",
    hypothesis: "May help",
    alternative: "May change plans",
    confidence: "low" as const,
    evidenceRefs: [ref],
  };
  expect(await f.module.apply(f.binding, f.claim, 0, { beliefs: [{ ...belief, confidence: "medium" }] })).toMatchObject(
    { code: "CONFIDENCE_NEEDS_CORROBORATION" },
  );
  await f.module.apply(f.binding, f.claim, 0, { beliefs: [belief] });
  f.advance(1000);
  const next = await f.module.context(
    f.binding,
    f.claim,
    observation(f, [fact("Decline", "statement", "peer:opaque", "claim")], "1"),
  );
  const fresh = (next.evidence as { id: string; fact: { value: string } }[]).find((e) => e.fact.value === "Decline")!;
  expect(
    await f.module.apply(f.binding, f.claim, 1, {
      beliefs: [
        {
          ...belief,
          hypothesis: "Help now seems less likely",
          alternative: "The decline may be temporary",
          evidenceRefs: [fresh.id],
        },
      ],
    }),
  ).toMatchObject({ accepted: true, version: 2 });
  const again = await f.module.context(f.binding, f.claim, observation(f, [], "2"));
  expect(again.beliefs).toMatchObject([{ hypothesis: "Help now seems less likely" }]);
  expect(again.predictions).toEqual([]);
});
it("saves predictions before command dispatch and records admission separately from completion", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  let observedSaved = false;
  f.board.adapter.connect = async (b) => {
    const session = await connect(b);
    return {
      ...session,
      observe: async () => observation(f, [fact("a2")]),
      execute: async (intent) => {
        observedSaved = (await f.pool.query("SELECT version FROM continuity_states")).rows[0]?.version === 1;
        return session.execute(intent);
      },
    };
  };
  const model = {
    decide: async (input: { messages: { content: string }[] }) => {
      const c = JSON.parse(input.messages[1].content).continuity;
      return {
        decision: {
          decision: { kind: "action", schemaId: "board.move.v1", payload: { to: "a4" }, summary: "Move" },
          continuity: {
            predictions: [
              {
                id: "move",
                subject: "self",
                predicate: "position",
                expected: "a4",
                dueBy: { clockId: "board.ply", value: "2" },
                evidenceRefs: [c.evidence[0].id],
              },
            ],
          },
        },
        inputTokens: 500,
        outputTokens: 50,
      };
    },
  };
  const h = f.host(model);
  h.engines.register(new ContinuityEngine());
  await h.host.run(f.claim);
  expect(observedSaved).toBe(true);
  expect(f.board.executions).toBe(1);
  const episodes = (await f.pool.query("SELECT kind FROM cognitive_episodes")).rows;
  expect(episodes.some((e) => e.kind === "receipt")).toBe(true);
});
it("bounds growing history and discloses omitted input without accepting evicted evidence", async () => {
  const f = await setup();
  for (let i = 0; i < 12; i++)
    await f.module.context(
      f.binding,
      f.claim,
      observation(
        f,
        Array.from({ length: 20 }, (_, j) => fact(`v${i}:${j}` + "x".repeat(200), "state", "self", `fact:${j}`)),
        String(i),
      ),
    );
  expect((await f.pool.query("SELECT count(*)::int n FROM cognitive_episodes")).rows[0].n).toBeLessThanOrEqual(200);
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    packObservation: (o) => ({
      ...o,
      payload: { current: o.payload.current },
      coverage: { ...o.coverage, budgetOmittedKeys: ["huge"] },
    }),
    observe: async () => ({
      ...observation(f, [fact("current")], "12"),
      payload: { current: "now", huge: "x".repeat(40000) },
    }),
  });
  const model = new FakeModel([{ decision: { kind: "wait", summary: "Wait" } }]),
    h = f.host(model);
  h.engines.register(new ContinuityEngine());
  await h.host.run(f.claim);
  expect(model.inputs).toHaveLength(1);
  const input = model.inputs[0];
  expect(
    Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
  ).toBeLessThanOrEqual(24000);
  const data = JSON.parse(input.messages[1].content);
  expect(data.continuity.coverage.evidenceOmitted).toBeGreaterThan(0);
  expect(JSON.stringify(data)).toContain("budgetOmitted");
});

it("does not refresh old peer statements from a new snapshot or retrofit predictions onto historical outcomes", async () => {
  const f = await setup(),
    c = await f.module.context(
      f.binding,
      f.claim,
      observation(f, [fact("help", "statement", "peer:opaque", "claim"), fact("pending", "state", "self", "battle")]),
    );
  const own = (c.evidence as { id: string; fact: { subject: string } }[]).find((e) => e.fact.subject === "self")!;
  await f.module.apply(f.binding, f.claim, 0, {
    predictions: [
      {
        id: "battle",
        subject: "self",
        predicate: "battle",
        expected: "won",
        dueBy: { clockId: "board.ply", value: "10" },
        evidenceRefs: [own.id],
      },
    ],
  });
  f.advance(1000);
  const old = { ...fact("won", "outcome", "self", "battle"), occurredAt: { clockId: "board.ply", value: "0" } };
  const next = await f.module.context(
    f.binding,
    f.claim,
    observation(f, [fact("help", "statement", "peer:opaque", "claim"), old], "2"),
  );
  expect(next.predictions).toMatchObject([{ status: "unresolved" }]);
  expect((next.evidence as { fact: { kind: string } }[]).filter((e) => e.fact.kind === "statement")).toHaveLength(1);
  const ref = (next.evidence as { id: string; fact: { kind: string } }[]).find((e) => e.fact.kind === "statement")!;
  expect(
    (
      await f.pool.query("SELECT occurred_at FROM cognitive_episodes WHERE id=$1", [ref.id])
    ).rows[0].occurred_at.getTime(),
  ).toBe(f.now().getTime() - 1000);
});

it("meters a fabricated citation and corrects it before any command preparation", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({ ...(await connect(b)), observe: async () => observation(f, [fact("a2")]) });
  const model = new FakeModel([
      {
        decision: { kind: "action", schemaId: "board.move.v1", payload: { to: "a4" }, summary: "Move" },
        continuity: { memories: [{ text: "Unobserved", evidenceRefs: ["00000000-0000-4000-8000-000000000000"] }] },
      },
      { decision: { kind: "wait", summary: "No grounded update" } },
    ]),
    h = f.host(model);
  h.engines.register(new ContinuityEngine());
  await h.host.run(f.claim);
  expect(model.inputs).toHaveLength(2);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
  ]);
  expect((await f.pool.query("SELECT * FROM continuity_states")).rowCount).toBe(0);
});

it.each(["correct", "exhaust"])(
  "replans a known semantic continuity rejection within shared accounting: %s",
  async (mode) => {
    const f = await setup(),
      connect = f.board.adapter.connect;
    f.board.adapter.connect = async (b) => ({
      ...(await connect(b)),
      observe: async () => observation(f, [fact("a2")]),
    });
    const inputs: { messages: { content: string }[] }[] = [];
    const model = {
      decide: async (input: { messages: { content: string }[] }) => {
        inputs.push(input);
        const payload = JSON.parse(input.messages[1].content);
        if (inputs.length === 2) {
          expect(payload.previousDecision).toMatchObject({
            code: "CONTINUITY_CONFIDENCE_NEEDS_CORROBORATION",
            submitted: false,
            committed: false,
          });
          expect(payload.continuity.version).toBe(0);
          expect(f.board.executions).toBe(0);
          expect((await f.pool.query("SELECT * FROM continuity_states")).rowCount).toBe(0);
        }
        return {
          decision: {
            decision: { kind: "action", schemaId: "board.move.v1", payload: { to: "a4" }, summary: "Move" },
            continuity: {
              beliefs: [
                {
                  id: "position",
                  subject: "self",
                  hypothesis: "May move",
                  alternative: "May wait",
                  confidence: mode === "correct" && inputs.length === 2 ? "low" : "medium",
                  evidenceRefs: [payload.continuity.evidence[0].id],
                },
              ],
            },
          },
          inputTokens: 500,
          outputTokens: 50,
        };
      },
    };
    const h = f.host(model);
    h.engines.register(new ContinuityEngine());
    const run = h.host.run(f.claim);
    if (mode === "correct") await run;
    else await expect(run).rejects.toThrow("CONTINUITY_CONFIDENCE_NEEDS_CORROBORATION");
    expect(inputs).toHaveLength(2);
    expect(f.board.executions).toBe(mode === "correct" ? 1 : 0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
      { status: "reported" },
      { status: "reported" },
    ]);
    expect((await f.pool.query("SELECT version FROM continuity_states")).rows).toEqual(
      mode === "correct" ? [{ version: 1 }] : [],
    );
    expect((await f.pool.query("SELECT sum(tokens)::text reserved FROM compute_ledger")).rows[0].reserved).toBe(
      "80000",
    );
    if (mode === "exhaust")
      expect(
        (await f.pool.query("SELECT state,wake FROM platform_tasks WHERE id=$1", [f.claim.taskId])).rows[0],
      ).toMatchObject({
        state: "waiting",
        wake: { kind: "retry", code: "CONTINUITY_CONFIDENCE_NEEDS_CORROBORATION" },
      });
    expect(
      (
        await f.pool.query(
          "SELECT * FROM turn_events WHERE label='Decision update rejected before command preparation'",
        )
      ).rowCount,
    ).toBe(mode === "correct" ? 1 : 2);
  },
);

it("uses existing continuation validation for invalid dependencies and rejects ambiguous update identities", async () => {
  const f = await setup(),
    c = await f.module.context(f.binding, f.claim, observation(f, [fact("a2")])),
    ref = (c.evidence as { id: string }[])[0].id;
  const step = {
    id: "one",
    intent: "Wait",
    dependsOn: ["one"],
    postcondition: { kind: "position", referenceId: "self", operator: "equals", value: "a4" },
  };
  expect(
    await f.module.apply(f.binding, f.claim, 0, { plan: { text: "Move", evidenceRefs: [ref], steps: [step] } }),
  ).toMatchObject({ accepted: false, code: "CONTINUATION_DEPENDENCY_CYCLE" });
  const b = {
    id: "same",
    subject: "self",
    hypothesis: "May move",
    alternative: "May wait",
    confidence: "low",
    evidenceRefs: [ref],
  };
  expect(await f.module.apply(f.binding, f.claim, 0, { beliefs: [b, b] })).toMatchObject({
    accepted: false,
    code: "DUPLICATE_ID",
  });
  expect((await f.pool.query("SELECT * FROM continuity_states")).rowCount).toBe(0);
});
