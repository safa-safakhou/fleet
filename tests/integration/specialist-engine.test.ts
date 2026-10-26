import { writeFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { Cognition } from "../../src/cognition.js";
import { ContinuityModule } from "../../src/engines/continuity/state.js";
import { SpecialistCoordinatorEngine } from "../../src/engines/specialists/coordinator.js";
import { Observability } from "../../src/observability.js";
import { IndependentSubmitCandidate } from "../fixtures/engines/independent-candidate.js";
import { CoordinationBoard } from "../fixtures/environments/coordination-board.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup(parallel = false, capacity = 1, maxCalls = 3) {
  const f = await platformFixture(capacity);
  cleanup = () => f.pool.end();
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, { id: "specialist-coordinator", version: "1" });
  const board = new CoordinationBoard(f.board.adapter, f.now, parallel);
  await f.pool.query("UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}',$2::jsonb) WHERE id=$1", [
    f.group.id,
    String(maxCalls),
  ]);
  await f.store.setState(f.group.id, "running", true);
  await f.enqueue();
  const claim = await f.claim();
  const module = new ContinuityModule(f.tasks, f.bindings, new Cognition(f.store), {
    id: "specialist-coordinator",
    version: "1",
  });
  return { ...f, claim, board, module };
}
const modelFor = (inputs: unknown[]) => ({
  decide: async (input: { messages: { content: string }[] }) => {
    const p = JSON.parse(input.messages[1].content);
    inputs.push(p);
    return {
      decision:
        p.stage === "worker"
          ? {
              summary: "Propose",
              proposal: {
                intent: { schemaId: "board.move.v1", payload: { to: p.focus.id } },
                evidenceRefs: p.focus.sourceRefs,
                expectedOutcome: { hypothesis: "Improvement" },
                claims: [
                  {
                    schemaId: "energy.v1",
                    kind: "resource",
                    key: "shared",
                    units: p.focus.observation.cost,
                  },
                  ...(String(p.focus.id).startsWith("message")
                    ? [
                        {
                          schemaId: "promise.v1",
                          kind: "promise",
                          key: "harbor",
                          value: p.focus.id === "messageWest" ? "west" : "east",
                        },
                      ]
                    : []),
                ],
                conflicts: [],
              },
            }
          : { commandIds: [p.proposals[0].intent.commandId], judgement: "One funded response", continuity: undefined },
      inputTokens: 500,
      outputTokens: 50,
    };
  },
});
it("admits two focused workers and a coordinator in the same three-call budget", async () => {
  const f = await setup(),
    inputs: unknown[] = [];
  const h = f.host(modelFor(inputs));
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(inputs).toHaveLength(3);
  expect(f.board.debits).toBe(40);
  const calls = (await f.pool.query("SELECT cohort_id,turn_id,status FROM compute_ledger")).rows;
  expect(calls).toHaveLength(3);
  expect(
    calls.every((c) => c.cohort_id === f.group.id && c.turn_id === f.claim.turn.id && c.status === "reported"),
  ).toBe(true);
});
it("uses actual remaining slots and never starts a third worker at the expense of coordination", async () => {
  const f = await setup(),
    inputs: unknown[] = [];
  const allocation = await f.store.reserveCall(f.claim.turn);
  await f.store.recordUsage(allocation, 10, 10);
  const h = f.host(modelFor(inputs));
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(inputs).toHaveLength(2);
  expect((inputs[0] as { coverage: { focusesOmitted: number } }).coverage.focusesOmitted).toBeGreaterThan(0);
});
it("rejects a proposal made stale during coordinator inference before any command commits", async () => {
  const f = await setup(),
    inputs: unknown[] = [];
  const base = modelFor(inputs);
  const model = {
    decide: async (input: Parameters<typeof base.decide>[0]) => {
      const r = await base.decide(input);
      if (JSON.parse(input.messages[1].content).stage === "coordinator") f.board.advance();
      return r;
    },
  };
  const h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow("STALE_PROPOSAL");
  expect(f.board.debits).toBe(0);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
});

it.each([
  [false, 2, 1],
  [true, 1, 1],
  [true, 2, 2],
])("honors environment overlap=%s and provider capacity=%s independently", async (parallel, capacity, want) => {
  const f = await setup(parallel, capacity),
    inputs: unknown[] = [];
  const base = modelFor(inputs);
  let active = 0,
    max = 0;
  const releases: (() => void)[] = [];
  const model = {
    decide: async (input: Parameters<typeof base.decide>[0]) => {
      const data = JSON.parse(input.messages[1].content);
      active++;
      max = Math.max(max, active);
      if (data.stage === "worker") await new Promise<void>((r) => releases.push(r));
      try {
        return await base.decide(input);
      } finally {
        active--;
      }
    },
  };
  const h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  const run = h.host.run(f.claim);
  try {
    await expect.poll(() => releases.length).toBe(want);
    expect(max).toBe(want);
    for (const release of releases.splice(0)) release();
    if (want === 1) {
      await expect.poll(() => releases.length).toBe(1);
      releases.shift()?.();
    }
  } finally {
    for (const release of releases) release();
    await run;
  }
  expect(max).toBe(want);
  expect(inputs).toHaveLength(3);
});
it("rejects source forgery before a worker can execute or get selected", async () => {
  const f = await setup(),
    inputs: unknown[] = [];
  const base = modelFor(inputs),
    model = {
      decide: async (input: Parameters<typeof base.decide>[0]) => {
        const r = await base.decide(input);
        if (r.decision.proposal) r.decision.proposal.evidenceRefs = ["foreign:source"];
        return r;
      },
    };
  const h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow("PROPOSAL_SOURCE_NOT_DELIVERED");
  expect(f.board.debits).toBe(0);
});
it("environment validation rejects omitted resource effects rather than trusting the worker declaration", async () => {
  const f = await setup(),
    inputs: unknown[] = [];
  const base = modelFor(inputs),
    model = {
      decide: async (input: Parameters<typeof base.decide>[0]) => {
        const r = await base.decide(input);
        if (r.decision.proposal) r.decision.proposal.claims = [];
        return r;
      },
    };
  const h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow("CLAIMS_DO_NOT_MATCH_ACTION");
  expect(f.board.debits).toBe(0);
  expect(inputs).toHaveLength(2);
});
it("cancels all siblings, settles late usage and prevents old results from acting after stop/restart", async () => {
  const f = await setup(true, 2),
    inputs: unknown[] = [];
  const base = modelFor(inputs);
  const releases: (() => void)[] = [];
  const model = {
    decide: async (input: Parameters<typeof base.decide>[0]) => {
      await new Promise<void>((r) => releases.push(r));
      return base.decide(input);
    },
  };
  const h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  const run = h.host.run(f.claim);
  const rejection = run.then(
    () => {
      throw Error("EXPECTED_CANCELLED_RUN");
    },
    (error) => error,
  );
  await expect.poll(() => releases.length).toBe(2);
  await h.host.stop(f.claim.taskId);
  for (const release of releases) release();
  expect(await rejection).toBeInstanceOf(Error);
  expect(f.board.debits).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
  ]);
  expect((await f.tasks.get(f.claim.taskId)).state).toBe("cancelled");
  await expect(f.host(model).host.run(f.claim)).rejects.toThrow();
  expect(inputs).toHaveLength(2);
});
it("retains unknown allocations and never coordinates or commits after a worker transport failure", async () => {
  const f = await setup(),
    model = {
      decide: async () => {
        throw Error("fixture transport failed");
      },
    },
    h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow();
  expect(f.board.debits).toBe(0);
  expect((await f.pool.query("SELECT status,tokens FROM compute_ledger")).rows).toEqual([
    { status: "unknown", tokens: "40000" },
  ]);
});
it("keeps bounded focused inputs honest when large sections must be omitted", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => {
    const session = await connect(b);
    return {
      ...session,
      observe: async (q) => {
        const v = await session.observe(q);
        for (const focus of v.coordination?.focuses ?? []) focus.observation.huge = "x".repeat(30000);
        return v;
      },
    };
  };
  const inputs: unknown[] = [],
    h = f.host(modelFor(inputs));
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(JSON.stringify(inputs)).toContain("focusKeysOmitted");
  expect(f.board.debits).toBe(40);
});
it("does not admit the specialist profile without an environment conflict/revision protocol", async () => {
  const f = await setup();
  f.environments.resolve(f.group.bindings[0].environment).capabilities.coordination = false;
  const inputs: unknown[] = [],
    h = f.host(modelFor(inputs));
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow("UNSUPPORTED_CAPABILITY");
  expect(inputs).toHaveLength(0);
});

it.each(["coordinator", "broker"])(
  "%s retains exact unknown usage after the same second-worker failure schedule",
  async (option) => {
    const f = await setup(),
      inputs: unknown[] = [];
    const base = modelFor(inputs);
    let calls = 0;
    const model = {
      decide: async (input: Parameters<typeof base.decide>[0]) => {
        calls++;
        if (calls === 2) throw Error("FIXTURE_TRANSPORT_FAILURE");
        return base.decide(input);
      },
    };
    const h = f.host(model);
    h.engines.register(option === "broker" ? new IndependentSubmitCandidate() : new SpecialistCoordinatorEngine());
    await expect(h.host.run(f.claim)).rejects.toThrow();
    const rows = (await f.pool.query("SELECT status,tokens FROM compute_ledger ORDER BY created_at,id")).rows;
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "unknown")).toEqual([{ status: "unknown", tokens: "40000" }]);
    expect(f.board.debits).toBe(option === "broker" ? 40 : 0);
  },
);
it.each(["coordinator", "broker"])(
  "%s rejects late results after cancellation under a shared parent",
  async (option) => {
    const f = await setup(true, 2),
      inputs: unknown[] = [],
      base = modelFor(inputs),
      releases: (() => void)[] = [];
    const model = {
      decide: async (input: Parameters<typeof base.decide>[0]) => {
        await new Promise<void>((r) => releases.push(r));
        return base.decide(input);
      },
    };
    const h = f.host(model);
    h.engines.register(option === "broker" ? new IndependentSubmitCandidate() : new SpecialistCoordinatorEngine());
    const run = h.host.run(f.claim).then(
      () => null,
      (error) => error,
    );
    await expect.poll(() => releases.length).toBe(2);
    await h.host.stop(f.claim.taskId);
    for (const release of releases) release();
    expect(await run).toBeInstanceOf(Error);
    expect(f.board.debits).toBe(0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows.every((r) => r.status === "reported")).toBe(
      true,
    );
    await expect(f.host(model).host.run(f.claim)).rejects.toThrow();
  },
);
it("compares identical two-focus workloads and caps including coordinator cost and missed deadlines", async () => {
  const report: unknown[] = [];
  for (const workload of ["resources", "promises"])
    for (const deadlineMs of [null, 45])
      for (const option of ["coordinator", "broker"]) {
        const f = await setup();
        if (workload === "promises") {
          const connect = f.board.adapter.connect;
          f.board.adapter.connect = async (b) => {
            const session = await connect(b);
            return {
              ...session,
              observe: async (q) => {
                const view = await session.observe(q);
                if (view.coordination)
                  view.coordination.focuses = view.coordination.focuses.filter((f) => f.id.startsWith("message"));
                return view;
              },
            };
          };
        }
        await f.store.consent(f.group.id, true);
        if (deadlineMs !== null)
          await f.pool.query("UPDATE platform_tasks SET deadline=$2,deadline_at=$3 WHERE id=$1", [
            f.claim.taskId,
            { clockId: "utc", value: new Date(f.now().getTime() + deadlineMs).toISOString() },
            new Date(f.now().getTime() + deadlineMs),
          ]);
        const start = f.now().getTime(),
          inputs: unknown[] = [],
          base = modelFor(inputs);
        const model = {
          decide: async (input: Parameters<typeof base.decide>[0]) => {
            f.advance(JSON.parse(input.messages[1].content).stage === "worker" ? 20 : 10);
            return base.decide(input);
          },
        };
        const h = f.host(model),
          engine = option === "broker" ? new IndependentSubmitCandidate() : new SpecialistCoordinatorEngine();
        h.engines.register(engine);
        let code = "COMPLETED";
        try {
          await h.host.run(f.claim);
        } catch (error) {
          code = (error as Error).message;
        }
        const row = (
          await f.pool.query(
            "SELECT count(*)::int calls,sum(input_tokens+output_tokens)::int reported_tokens,sum(tokens)::text retained_allocation FROM compute_ledger",
          )
        ).rows[0];
        expect(row.calls).toBe(option === "broker" ? 2 : 3);
        expect(row.reported_tokens).toBe(option === "broker" ? 1100 : 1650);
        expect(f.board.debits).toBe(
          workload === "promises" || (deadlineMs === 45 && option === "coordinator") ? 0 : 40,
        );
        expect(f.board.incompatiblePromiseCommits).toBe(0);
        expect(f.board.outcomes).toBe(deadlineMs === 45 && option === "coordinator" ? 0 : 1);
        const details = (await new Observability(f.store).run(f.claim.turn.id)).turn.events
          .filter((e) => e.label === "Debug: Model request")
          .map((e) => e.detail as { stage: { parentBudgetId: string; taskId: string }; allocationId: string });
        expect(new Set(details.map((d) => d.allocationId)).size).toBe(row.calls);
        expect(details.every((d) => d.stage.parentBudgetId === f.group.id && d.stage.taskId === f.claim.taskId)).toBe(
          true,
        );
        report.push({
          option,
          workload,
          syntheticDeadlineMs: deadlineMs,
          simulatedLatencyMs: f.now().getTime() - start,
          missedDeadlines: code === "DEADLINE_MISSED" ? 1 : 0,
          usefulOutcomes: f.board.outcomes,
          resourceDebits: f.board.debits,
          committedIncompatiblePromises: f.board.incompatiblePromiseCommits,
          ...row,
          denials: engine instanceof IndependentSubmitCandidate ? engine.denials : [],
          code,
        });
        await f.pool.end();
        cleanup = undefined;
      }
  if (process.env.FLEET_COORDINATION_REPORT_FILE)
    await writeFile(
      process.env.FLEET_COORDINATION_REPORT_FILE,
      JSON.stringify(
        {
          synthetic: true,
          workerDelayMs: 20,
          coordinatorDelayMs: 10,
          budget: { maxCalls: 3, allocationPerCall: 40000 },
          rows: report,
        },
        null,
        2,
      ) + "\n",
    );
});

it("the environment rejects a state change between preflight and atomic commit without replay", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => {
    const session = await connect(b);
    return {
      ...session,
      execute: async (intent) => {
        f.board.advance();
        return session.execute(intent);
      },
    };
  };
  const h = f.host(modelFor([]));
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(f.board.debits).toBe(0);
  expect((await f.pool.query("SELECT state FROM platform_commands")).rows).toEqual([{ state: "rejected" }]);
  const command = (await f.pool.query("SELECT command_id FROM platform_commands")).rows[0].command_id;
  expect(await h.commands.reconcile(f.claim.turn.id, command)).toMatchObject({
    status: "rejected",
    code: "STALE_VERSION",
  });
  expect(f.board.debits).toBe(0);
});
it("saves coordinator continuity in its separate namespace before action and respects observation consent", async () => {
  const f = await setup(),
    base = modelFor([]);
  const connect = f.board.adapter.connect;
  let savedBefore = false;
  f.board.adapter.connect = async (b) => {
    const session = await connect(b);
    return {
      ...session,
      execute: async (i) => {
        savedBefore =
          (await f.pool.query("SELECT namespace FROM continuity_states")).rows[0]?.namespace ===
          "specialist-coordinator@1";
        return session.execute(i);
      },
    };
  };
  const model = {
    decide: async (input: Parameters<typeof base.decide>[0]) => {
      const r = await base.decide(input),
        p = JSON.parse(input.messages[1].content);
      if (p.stage === "coordinator")
        (r.decision as unknown as { continuity: unknown }).continuity = {
          memories: [{ text: "Bounded shared energy", evidenceRefs: [p.continuity.evidence[0].id] }],
        };
      return r;
    },
  };
  const h = f.host(model);
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(savedBefore).toBe(true);
  expect((await f.module.inspect(f.group.bindings[0])).available).toBe(false);
  await f.store.consent(f.group.id, true);
  expect(await f.module.inspect(f.group.bindings[0])).toMatchObject({
    namespace: "specialist-coordinator@1",
    version: 1,
  });
  await f.store.consent(f.group.id, false);
  expect((await f.module.inspect(f.group.bindings[0])).available).toBe(false);
});

it("hard-crash recovery never classifies a dispatched sibling as uncalled from another sibling's phase", async () => {
  const f = await setup();
  await f.store.reserveCall(f.claim.turn);
  await f.store.phase(f.claim.turn, "model_dispatched");
  await f.store.reserveCall(f.claim.turn);
  await f.store.phase(f.claim.turn, "model_reserved_tracked");
  f.advance(121000);
  await f.store.recoverExpired();
  await f.tasks.recover();
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "unknown", tokens: "40000" },
    { status: "unknown", tokens: "40000" },
  ]);
  expect((await f.tasks.get(f.claim.taskId)).state).toBe("blocked");
  expect(await f.tasks.claim("replacement", f.now())).toBeNull();
});

it("keeps non-specialist calls exclusive even when a worker stage label is supplied", async () => {
  const f = await platformFixture(2);
  cleanup = () => f.pool.end();
  f.board.adapter.capabilities.parallelReasoning = true;
  await f.enqueue();
  const claim = await f.claim();
  let started = 0,
    release = () => {};
  const model = {
    decide: async () => {
      started++;
      await new Promise<void>((r) => {
        release = r;
      });
      return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 10, outputTokens: 10 };
    },
  };
  const h = f.host(model, async (ctx) => {
    const r = await Promise.allSettled([
      ctx.model.decide(ctx.claim, f.request(ctx.signal), { kind: "worker" }),
      ctx.model.decide(ctx.claim, f.request(ctx.signal), { kind: "worker" }),
    ]);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
  });
  const run = h.host.run(claim);
  await expect.poll(() => started).toBe(1);
  release();
  await run;
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(1);
});
it("an uncertain command survives restart and resolves through its original receipt without replay", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => {
    const session = await connect(b);
    return {
      ...session,
      execute: async (i) => ({
        ...(await session.execute(i)),
        status: "unknown" as const,
        code: "TRANSPORT_UNCERTAIN",
      }),
    };
  };
  const h = f.host(modelFor([]));
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect((await f.tasks.get(f.claim.taskId)).state).toBe("blocked");
  const before = (await f.pool.query("SELECT command_id,state FROM platform_commands")).rows[0];
  expect(before.state).toBe("unknown");
  const after = await f.host(modelFor([])).commands.reconcile(f.claim.turn.id, before.command_id);
  expect(after).toMatchObject({ commandId: before.command_id, status: "confirmed" });
  expect(f.board.debits).toBe(40);
  expect(f.board.outcomes).toBe(1);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(1);
});

it.each([false, true])(
  "isolates an exhausted worker while retaining coordinator capacity (parallel=%s)",
  async (parallel) => {
    const f = await setup(parallel, 2),
      inputs: unknown[] = [],
      base = modelFor(inputs);
    let failedFocus: string | undefined;
    const h = f.host({
      decide: async (input) => {
        const p = JSON.parse(input.messages[1].content);
        if (p.stage === "worker" && (!failedFocus || p.focus.id === failedFocus)) {
          failedFocus = p.focus.id;
          inputs.push(p);
          return { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 40 };
        }
        return base.decide(input);
      },
    });
    h.engines.register(new SpecialistCoordinatorEngine());
    await h.host.run(f.claim);
    expect(inputs).toHaveLength(3);
    expect((inputs[2] as { stage: string }).stage).toBe("coordinator");
    expect(f.board.debits).toBeGreaterThan(0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual(
      Array.from({ length: 3 }, () => ({ status: "reported" })),
    );
  },
);

it("retries the task later when every focused worker fails with known usage", async () => {
  const f = await setup();
  let calls = 0;
  const h = f.host({
    decide: async () => {
      calls++;
      return { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
    },
  });
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow("MODEL_OUTPUT_RETRY_EXHAUSTED");
  expect(calls).toBe(2);
  expect((await f.tasks.get(f.claim.taskId)).state).toBe("waiting");
  expect(f.board.debits).toBe(0);
});

it("corrects a worker output when an existing fourth slot is available and still coordinates once", async () => {
  const f = await setup(false, 1, 4),
    inputs: unknown[] = [],
    base = modelFor(inputs);
  let failed = false;
  const h = f.host({
    decide: async (input) => {
      const p = JSON.parse(input.messages[1].content);
      if (!failed && p.stage === "worker") {
        failed = true;
        inputs.push(p);
        return { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
      }
      return base.decide(input);
    },
  });
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(inputs).toHaveLength(4);
  expect((inputs[3] as { stage: string }).stage).toBe("coordinator");
  expect(f.board.outcomes).toBe(1);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows.every((r) => r.status === "reported")).toBe(
    true,
  );
});

it("settles an already dispatched sibling after a known worker rejection", async () => {
  const f = await setup(true, 2),
    base = modelFor([]);
  let release!: () => void;
  const siblingStarted = new Promise<void>((done) => {
    release = done;
  });
  const h = f.host({
    decide: async (input) => {
      const packet = JSON.parse(input.messages[1].content);
      if (packet.focus.id === "defend") {
        await siblingStarted;
        return { decision: null, decisionError: "MODEL_FEEDBACK_EXHAUSTED", inputTokens: 10, outputTokens: 2 };
      }
      release();
      await new Promise<void>((done, fail) => {
        const timer = setTimeout(done, 30);
        input.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            fail(Error("SIBLING_WAS_ABORTED"));
          },
          { once: true },
        );
      });
      return base.decide(input);
    },
  });
  h.engines.register(new SpecialistCoordinatorEngine());
  await expect(h.host.run(f.claim)).rejects.toThrow("MODEL_FEEDBACK_EXHAUSTED");
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
  ]);
  expect(f.board.outcomes).toBe(0);
});

it("replans a proposal invalidated during reasoning within the original three-call budget", async () => {
  const f = await setup();
  const original = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => {
    const session = await original(binding);
    return {
      ...session,
      observe: async (query) => {
        const view = await session.observe(query);
        view.coordination!.focuses = view.coordination!.focuses.slice(0, 1);
        return view;
      },
      decisionGrounding: { prepare: (input) => input, validate: () => null },
    };
  };
  const inputs: unknown[] = [],
    base = modelFor(inputs);
  let advanced = false;
  const h = f.host({
    decide: async (input: Parameters<typeof base.decide>[0]) => {
      const result = await base.decide(input);
      if (!advanced) {
        advanced = true;
        f.board.advance();
      }
      return result;
    },
  });
  h.engines.register(new SpecialistCoordinatorEngine());
  await h.host.run(f.claim);
  expect(f.board.debits).toBe(40);
  expect(inputs).toHaveLength(3);
  expect(inputs[1]).toMatchObject({ previousSelection: { code: "STALE_PROPOSAL", submitted: false } });
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
    { status: "reported" },
  ]);
});
