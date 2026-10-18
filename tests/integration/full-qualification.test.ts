import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  createFullQualification,
  prepareFullQualification,
  runFullQualification,
} from "../../src/full-qualification.js";
import { PactQualificationFixtures } from "../../src/games/pact/qualification.js";
import { qualifyOutput } from "../../src/qualification.js";
import { prepareQualification, QualificationLedger, qualificationProfiles } from "../../src/qualification-run.js";

const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0)) await close();
});
async function setup() {
  const ledger = await QualificationLedger.open(
    "postgres://fleet_qualification:qualification_fixture@127.0.0.1:5436/fleet_qualification",
    Buffer.alloc(32, 21).toString("base64"),
  );
  closes.push(() => ledger.close());
  const history = prepareQualification({
    schemaVersion: "fleet.local-qualification.v1",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    approved: true,
    fleetCommit: "a".repeat(40),
    modelDigest: "6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197",
    model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: true },
    endpoint: "http://127.0.0.1:11434",
    helperEndpoint: "http://127.0.0.1:8832",
    startsAt: new Date(Date.now() - 1000).toISOString(),
    deadlineAt: new Date(Date.now() + 60 * 60000).toISOString(),
    scope: "synthetic_fixtures_only",
    executionLimit: 104,
    tokenLimit: 4160000,
    helperLimit: 48,
  });
  await ledger.create(history);
  await ledger.fail(history, "QUALIFICATION_CALIBRATION_FAILED");
  for (let i = 0; i < 96; i++)
    await ledger.pool.query(
      "INSERT INTO qualification_calls(id,run_id,profile,trial,state,input_tokens,output_tokens,valid) VALUES($1,$2,'historical',$3,'reported',20,5,true)",
      [randomUUID(), history.plan.id, String(i)],
    );
  const raw = {
    schemaVersion: "fleet.full-local-qualification.v1",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    approved: true,
    sourceCommit: "b".repeat(40),
    historyRunId: history.plan.id,
    historyDigest: history.digest,
    baselineExecutions: 96,
    baselineReservedTokens: 3840000,
    startsAt: new Date(Date.now() - 500).toISOString(),
    deadlineAt: new Date(Date.now() + 500 * 60000).toISOString(),
    thinkingPlanId: randomUUID(),
    nonThinkingPlanId: randomUUID(),
    endpoint: history.plan.endpoint,
    helperEndpoint: history.plan.helperEndpoint,
    modelDigest: history.plan.modelDigest,
    scope: "synthetic_fixtures_only",
    executionLimit: 208,
    tokenLimit: 8320000,
    helperLimit: 96,
  };
  return { ledger, history, raw, prepared: prepareFullQualification(raw) };
}
const request = (p: ReturnType<typeof prepareQualification>, profile: string) => ({
  model: {
    ...p.plan.model,
    ...(profile === "legacy-cognition"
      ? { cognition: "llm-centered-v1" as const, recallAssist: "laya-recall-v1" as const }
      : {}),
  },
  messages: [{ role: "user", content: "Wait" }],
  schema: { type: "object" },
  maxOutputTokens: 2000,
  signal: new AbortController().signal,
});
const provider = {
  decide: async () => ({ decision: { kind: "wait", summary: "Wait" }, inputTokens: 20, outputTokens: 5 }),
};
async function continuationFixture() {
  const f = await setup();
  await createFullQualification(f.ledger, f.prepared);
  const unknown = randomUUID();
  for (const [index, plan] of f.prepared.plans.entries()) {
    for (let n = 0; n < (index ? 29 : 67); n++)
      await f.ledger.pool.query(
        "INSERT INTO qualification_calls(id,run_id,profile,trial,state,input_tokens,output_tokens,valid) VALUES($1,$2,'calibration',$3,$4,$5,$6,$7)",
        [
          index && n === 28 ? unknown : randomUUID(),
          plan.plan.id,
          String(n),
          index && n === 28 ? "unknown" : "reported",
          index && n === 28 ? null : 20,
          index && n === 28 ? null : 5,
          index && n === 28 ? null : true,
        ],
      );
    await f.ledger.pool.query("UPDATE qualification_runs SET state=$2,code=$3 WHERE id=$1", [
      plan.plan.id,
      index ? "blocked" : "Q2_done",
      index ? "QUALIFICATION_UNKNOWN_USAGE" : null,
    ]);
  }
  await f.ledger.pool.query(
    "UPDATE qualification_batches SET state='blocked',code='QUALIFICATION_UNKNOWN_USAGE' WHERE id=$1",
    [f.prepared.approval.id],
  );
  const raw = {
    ...f.raw,
    schemaVersion: "fleet.full-local-qualification.v2",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    thinkingPlanId: randomUUID(),
    nonThinkingPlanId: randomUUID(),
    historyRunId: f.prepared.plans[1].plan.id,
    historyDigest: f.prepared.plans[1].digest,
    predecessorBatchId: f.prepared.approval.id,
    predecessorDigest: f.prepared.digest,
    reviewedExecutionId: unknown,
    reviewEvidenceDigest: "e".repeat(64),
    executionLimit: 112,
    tokenLimit: 4480000,
    helperLimit: 73,
  };
  return { ...f, raw, unknown };
}

async function completedContinuation() {
  const f = await continuationFixture(),
    prior = prepareFullQualification(f.raw);
  await createFullQualification(f.ledger, prior);
  for (const [index, plan] of prior.plans.entries()) {
    for (let n = 0; n < (index ? 56 : 54); n++)
      await f.ledger.pool.query(
        "INSERT INTO qualification_calls(id,run_id,profile,trial,state,input_tokens,output_tokens,valid) VALUES($1,$2,'calibration',$3,'reported',20,5,true)",
        [randomUUID(), plan.plan.id, String(n)],
      );
    await f.ledger.pool.query("UPDATE qualification_runs SET state='Q2_done' WHERE id=$1", [plan.plan.id]);
  }
  await f.ledger.pool.query("UPDATE qualification_batches SET state='done' WHERE id=$1", [prior.approval.id]);
  const raw: Record<string, unknown> = {
    ...f.raw,
    schemaVersion: "fleet.full-local-qualification.v3",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    sourceCommit: "c".repeat(40),
    historyRunId: prior.plans[1].plan.id,
    historyDigest: prior.plans[1].digest,
    predecessorBatchId: prior.approval.id,
    predecessorDigest: prior.digest,
    baselineExecutions: 110,
    baselineReservedTokens: 4400000,
    executionLimit: 208,
    tokenLimit: 8320000,
    helperLimit: 96,
    startsAt: new Date(Date.now() - 500).toISOString(),
    deadlineAt: new Date(Date.now() + 359 * 60000).toISOString(),
    thinkingPlanId: randomUUID(),
    nonThinkingPlanId: randomUUID(),
  };
  delete raw.reviewedExecutionId;
  delete raw.reviewEvidenceDigest;
  return { ...f, prior, next: raw };
}

it("registers a fresh208-call qualification after completed110 without reopening grants or rewriting allocations/reviews", async () => {
  const f = await completedContinuation(),
    p = prepareFullQualification(f.next);
  const snapshot = async () =>
    (
      await f.ledger.pool.query(
        "SELECT to_jsonb(c) body FROM qualification_calls c JOIN qualification_batch_runs x ON x.run_id=c.run_id WHERE x.batch_id=$1 ORDER BY c.id",
        [f.prior.approval.id],
      )
    ).rows;
  const before = await snapshot();
  const reviews = (
    await f.ledger.pool.query("SELECT to_jsonb(r) body FROM qualification_execution_reviews r WHERE call_id=$1", [
      f.unknown,
    ])
  ).rows;
  await createFullQualification(f.ledger, p);
  for (const plan of p.plans) {
    await f.ledger.startStage(plan, "Q1");
    for (let n = 0; n < 8; n++)
      await f.ledger.model(plan, provider, "calibration", `probe:${n >> 1}`).decide(request(plan, "calibration"));
    await f.ledger.finishStage(plan, "Q1");
    await f.ledger.startStage(plan, "Q2");
    for (const profile of qualificationProfiles)
      for (let n = 0; n < 24; n++)
        await f.ledger.model(plan, provider, profile, `trial:${n >> 1}`).decide(request(plan, profile));
  }
  await expect(
    f.ledger.model(p.plans[1], provider, "reactive-basic", "excess").decide(request(p.plans[1], "reactive-basic")),
  ).rejects.toThrow();
  expect(
    (await Promise.all(p.plans.map((plan) => f.ledger.summary(plan)))).map((s) => ({
      calls: s.executions,
      tokens: s.reservedTokens,
    })),
  ).toEqual([
    { calls: 104, tokens: 4160000 },
    { calls: 104, tokens: 4160000 },
  ]);
  expect(await snapshot()).toEqual(before);
  expect(
    (await f.ledger.pool.query("SELECT state,code FROM qualification_batches WHERE id=$1", [f.prior.approval.id]))
      .rows[0],
  ).toEqual({ state: "done", code: null });
  expect(
    (
      await f.ledger.pool.query("SELECT to_jsonb(r) body FROM qualification_execution_reviews r WHERE call_id=$1", [
        f.unknown,
      ])
    ).rows,
  ).toEqual(reviews);
  await expect(
    createFullQualification(
      f.ledger,
      prepareFullQualification({
        ...f.next,
        id: randomUUID(),
        authorizationRef: randomUUID(),
        thinkingPlanId: randomUUID(),
        nonThinkingPlanId: randomUUID(),
      }),
    ),
  ).rejects.toThrow("QUALIFICATION_BATCH_AUTHORIZATION_REUSED");
});

it.each(["active", "child-blocked", "unknown", "wrong-count", "wrong-digest"])(
  "refuses a fresh grant with invalid completed lineage: %s",
  async (mode) => {
    const f = await completedContinuation();
    if (mode === "active")
      await f.ledger.pool.query("UPDATE qualification_batches SET state='active' WHERE id=$1", [f.prior.approval.id]);
    if (mode === "child-blocked")
      await f.ledger.pool.query("UPDATE qualification_runs SET state='blocked' WHERE id=$1", [
        f.prior.plans[0].plan.id,
      ]);
    if (mode === "unknown")
      await f.ledger.pool.query(
        "UPDATE qualification_calls SET state='unknown' WHERE id=(SELECT id FROM qualification_calls WHERE run_id=$1 LIMIT 1)",
        [f.prior.plans[0].plan.id],
      );
    if (mode === "wrong-count")
      await f.ledger.pool.query(
        "DELETE FROM qualification_calls WHERE id=(SELECT id FROM qualification_calls WHERE run_id=$1 LIMIT 1)",
        [f.prior.plans[0].plan.id],
      );
    if (mode === "wrong-digest") f.next.predecessorDigest = "e".repeat(64);
    await expect(createFullQualification(f.ledger, prepareFullQualification(f.next))).rejects.toThrow(
      "QUALIFICATION_BATCH_HISTORY",
    );
  },
);

it("stops both fresh qualification modes on new uncertainty without reusing the historical review", async () => {
  const f = await completedContinuation(),
    p = prepareFullQualification(f.next);
  await createFullQualification(f.ledger, p);
  for (const plan of p.plans) await f.ledger.startStage(plan, "Q1");
  await expect(
    f.ledger
      .model(
        p.plans[0],
        { decide: async () => ({ decision: null, inputTokens: null, outputTokens: null }) },
        "calibration",
        "unknown",
      )
      .decide(request(p.plans[0], "calibration")),
  ).rejects.toThrow();
  await expect(
    f.ledger.model(p.plans[1], provider, "calibration", "later").decide(request(p.plans[1], "calibration")),
  ).rejects.toThrow("QUALIFICATION_BATCH_NOT_ACTIVE");
  expect((await f.ledger.summary(p.plans[0])).reservedTokens).toBe(40000);
  expect((await f.ledger.summary(p.plans[1])).executions).toBe(0);
});

it("reviews only the exact uncertain execution additively and meters112 remaining calls without rewriting the prior96", async () => {
  const f = await continuationFixture(),
    p = prepareFullQualification(f.raw);
  const before = (
    await f.ledger.pool.query(
      "SELECT to_jsonb(c) body FROM qualification_calls c JOIN qualification_batch_runs x ON x.run_id=c.run_id WHERE x.batch_id=$1 ORDER BY c.id",
      [f.prepared.approval.id],
    )
  ).rows;
  await expect(
    createFullQualification(f.ledger, prepareFullQualification({ ...f.raw, reviewedExecutionId: randomUUID() })),
  ).rejects.toThrow("QUALIFICATION_EXACT_REVIEW_REQUIRED");
  await f.ledger.pool.query(
    "UPDATE qualification_batches SET plan=jsonb_set(plan,'{schemaVersion}','\"fleet.full-local-qualification.v2\"') WHERE id=$1",
    [f.prepared.approval.id],
  );
  await expect(createFullQualification(f.ledger, p)).rejects.toThrow("QUALIFICATION_BATCH_HISTORY");
  await f.ledger.pool.query(
    "UPDATE qualification_batches SET plan=jsonb_set(plan,'{schemaVersion}','\"fleet.full-local-qualification.v1\"') WHERE id=$1",
    [f.prepared.approval.id],
  );
  await createFullQualification(f.ledger, p);
  expect(
    (
      await f.ledger.pool.query(
        "SELECT call_id,reserved_tokens FROM qualification_execution_reviews WHERE call_id=$1",
        [f.unknown],
      )
    ).rows[0],
  ).toEqual({ call_id: f.unknown, reserved_tokens: "40000" });
  for (const [index, plan] of p.plans.entries()) {
    await f.ledger.startStage(plan, "Q1");
    for (let n = 0; n < 8; n++)
      await f.ledger.model(plan, provider, "calibration", `probe:${n >> 1}`).decide(request(plan, "calibration"));
    await f.ledger.finishStage(plan, "Q1");
    await f.ledger.startStage(plan, "Q2");
    if (!index)
      for (const profile of qualificationProfiles)
        for (let n = 0; n < 24; n++)
          await f.ledger.model(plan, provider, profile, `trial:${n >> 1}`).decide(request(plan, profile));
  }
  await expect(
    f.ledger.model(p.plans[1], provider, "reactive-basic", "excess").decide(request(p.plans[1], "reactive-basic")),
  ).rejects.toThrow("QUALIFICATION_BATCH_BUDGET");
  expect((await Promise.all(p.plans.map((p) => f.ledger.summary(p)))).reduce((n, s) => n + s.executions, 0)).toBe(112);
  expect(
    (
      await f.ledger.pool.query(
        "SELECT to_jsonb(c) body FROM qualification_calls c JOIN qualification_batch_runs x ON x.run_id=c.run_id WHERE x.batch_id=$1 ORDER BY c.id",
        [f.prepared.approval.id],
      )
    ).rows,
  ).toEqual(before);
  await expect(createFullQualification(f.ledger, p)).rejects.toThrow();
});

it("rejects a malformed model contract before reserving any qualification allocation", async () => {
  const f = await setup();
  await createFullQualification(f.ledger, f.prepared);
  const p = f.prepared.plans[0];
  await f.ledger.startStage(p, "Q1");
  await expect(
    f.ledger
      .model(p, provider, "calibration", "invalid")
      .decide({ ...request(p, "calibration"), schema: { enum: ["duplicate", "duplicate"] } }),
  ).rejects.toMatchObject({ code: "INVALID_GENERATION_SCHEMA", notDispatched: true });
  expect((await f.ledger.summary(p)).executions).toBe(0);
});

it("settles both cognitive executions when a requested read redelivers recalled evidence", async () => {
  const f = await setup();
  const p = prepareQualification({
    ...f.history.plan,
    id: randomUUID(),
    authorizationRef: randomUUID(),
    schemaVersion: "fleet.local-qualification.v2",
  });
  await f.ledger.create(p);
  await f.ledger.startStage(p, "Q1");
  await f.ledger.finishStage(p, "Q1");
  await f.ledger.startStage(p, "Q2");
  let calls = 0;
  const model = {
    decide: async (input: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) => {
      const version = JSON.parse(input.messages[1].content).cognition.version;
      const result = {
        cognition: { expectedVersion: version, analysis: { type: "none", reason: "Retain observed evidence" } },
        decision:
          ++calls === 1
            ? { kind: "read", tool: "pact_world_read_v1", args: {}, summary: "Refresh facts" }
            : { kind: "wait", summary: "Wait" },
      };
      expect(qualifyOutput(input.schema, input.messages, result).valid).toBe(true);
      return { decision: result, inputTokens: 500, outputTokens: 50 };
    },
  };
  const fixtures = await PactQualificationFixtures.create(f.ledger, p);
  const result = await fixtures.run(
    "legacy-cognition",
    "multiple-events:1",
    f.ledger.model(p, model, "legacy-cognition", "multiple-events:1"),
    f.ledger.recall(
      p,
      {
        choose: async () => {
          throw Error("LAYA_ABSTAINED");
        },
      },
      "legacy-cognition",
      "multiple-events:1",
    ),
  );
  expect(result).toMatchObject({ calls: 2, code: "WAIT", pending: false });
  expect(await f.ledger.summary(p)).toMatchObject({
    executions: 2,
    unknown: 0,
    invalid: 0,
    reportedInputTokens: 1000,
    reportedOutputTokens: 100,
  });
});

it("stops a reviewed continuation on a new unknown and records a bounded error cause without leaking messages", async () => {
  const f = await continuationFixture(),
    p = prepareFullQualification(f.raw);
  await createFullQualification(f.ledger, p);
  for (const plan of p.plans) await f.ledger.startStage(plan, "Q1");
  const bad = {
    decide: async () => {
      throw new TypeError("private endpoint must never be logged", { cause: { code: "ECONNRESET" } });
    },
  };
  await expect(
    f.ledger.model(p.plans[0], bad, "calibration", "uncertain").decide(request(p.plans[0], "calibration")),
  ).rejects.toThrow();
  await expect(
    f.ledger.model(p.plans[1], provider, "calibration", "next").decide(request(p.plans[1], "calibration")),
  ).rejects.toThrow("QUALIFICATION_BATCH_NOT_ACTIVE");
  const row = (await f.ledger.pool.query("SELECT * FROM qualification_calls WHERE run_id=$1", [p.plans[0].plan.id]))
    .rows[0];
  expect(row.state).toBe("unknown");
  expect(row.tokens).toBe("40000");
  const detail = f.ledger.vault.decrypt(row.detail_cipher, `qualification-call:${row.id}`);
  expect(detail).toMatchObject({ dispatched: true, failure: { causeCode: "ECONNRESET" } });
  expect(JSON.stringify(detail)).not.toContain("private endpoint");
  expect((await f.ledger.summary(p.plans[1])).executions).toBe(0);
});
it("enforces exactly two104-call mode allocations and208 combined without changing historical96 rows", async () => {
  const f = await setup();
  const before = (
    await f.ledger.pool.query("SELECT to_jsonb(c) body FROM qualification_calls c WHERE run_id=$1 ORDER BY id", [
      f.history.plan.id,
    ])
  ).rows;
  await createFullQualification(f.ledger, f.prepared);
  for (const p of f.prepared.plans) {
    await f.ledger.startStage(p, "Q1");
    for (let i = 0; i < 8; i++)
      await f.ledger.model(p, provider, "calibration", `probe:${i >> 1}`).decide(request(p, "calibration"));
    await f.ledger.finishStage(p, "Q1");
    await f.ledger.startStage(p, "Q2");
    for (const profile of qualificationProfiles)
      for (let i = 0; i < 24; i++)
        await f.ledger.model(p, provider, profile, `trial:${i >> 1}`).decide(request(p, profile));
  }
  const p = f.prepared.plans[1];
  await expect(
    f.ledger.model(p, provider, "reactive-basic", "excess").decide(request(p, "reactive-basic")),
  ).rejects.toThrow();
  expect(
    (await Promise.all(f.prepared.plans.map((p) => f.ledger.summary(p)))).reduce((n, s) => n + s.executions, 0),
  ).toBe(208);
  expect(
    (
      await f.ledger.pool.query("SELECT to_jsonb(c) body FROM qualification_calls c WHERE run_id=$1 ORDER BY id", [
        f.history.plan.id,
      ])
    ).rows,
  ).toEqual(before);
  await expect(
    createFullQualification(
      f.ledger,
      prepareFullQualification({
        ...f.raw,
        id: randomUUID(),
        authorizationRef: randomUUID(),
        thinkingPlanId: randomUUID(),
        nonThinkingPlanId: randomUUID(),
      }),
    ),
  ).rejects.toThrow("QUALIFICATION_BATCH_AUTHORIZATION_REUSED");
});
it("a first-mode unknown stops second-mode dispatch and retains the full allocation", async () => {
  const f = await setup();
  await createFullQualification(f.ledger, f.prepared);
  const [a, b] = f.prepared.plans;
  await f.ledger.startStage(a, "Q1");
  await f.ledger.startStage(b, "Q1");
  await expect(
    f.ledger
      .model(
        a,
        { decide: async () => ({ decision: null, inputTokens: null, outputTokens: null }) },
        "calibration",
        "unknown",
      )
      .decide(request(a, "calibration")),
  ).rejects.toThrow();
  await expect(f.ledger.model(b, provider, "calibration", "later").decide(request(b, "calibration"))).rejects.toThrow(
    "QUALIFICATION_BATCH_NOT_ACTIVE",
  );
  expect((await f.ledger.summary(a)).reservedTokens).toBe(40000);
  expect((await f.ledger.summary(b)).executions).toBe(0);
});
it("completes the full96 actual engine trials with injected first-output failure and keeps recovery/raw verdicts distinct", async () => {
  const f = await setup();
  let calls = 0;
  const attempts = new Map<string, number>();
  const { PactQualificationFixtures } = await import("../../src/games/pact/qualification.js");
  const model = {
    decide: async (input: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) => {
      calls++;
      const key = JSON.stringify(input.model) + input.messages[1].content,
        calibration = input.messages[0].content.includes("calibration");
      const n = attempts.get(key) ?? 0;
      attempts.set(key, n + 1);
      const cognitive = !!(input.schema.properties as Record<string, unknown> | undefined)?.cognition,
        envelope = !!(input.schema.properties as Record<string, unknown> | undefined)?.decision;
      if (!calibration && !cognitive && input.messages[0].content.startsWith("Use the authorized")) {
        const decision = {
          kind: "action",
          schemaId: "pact.action.v1",
          payload: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
          summary: "Consider action",
        };
        expect(qualifyOutput(input.schema, input.messages, envelope ? { decision } : decision).valid).toBe(true);
        const bad = { ...decision, payload: { action: decision.payload } };
        expect(qualifyOutput(input.schema, input.messages, envelope ? { decision: bad } : bad).valid).toBe(false);
      }
      // Calibration recovery plus wait outputs exercise all actual engines without game traffic.
      if (calibration && n === 0)
        return { decision: null, decisionError: "INVALID_MODEL_OUTPUT", inputTokens: 20, outputTokens: 5 };
      const decision = { kind: "wait", summary: "Wait" };
      return {
        decision: cognitive
          ? { cognition: { expectedVersion: 0, analysis: { type: "none", reason: "No new insight" } }, decision }
          : envelope
            ? { decision }
            : decision,
        inputTokens: 500,
        outputTokens: 30,
      };
    },
  };
  const result = await runFullQualification(f.ledger, f.prepared, {
    model,
    recall: {
      choose: async () => {
        throw Error("LAYA_ABSTAINED");
      },
    },
    fixtures: (p) => PactQualificationFixtures.create(f.ledger, p),
  });
  expect(result.passed).toBe(true);
  expect(result.rawPassed).toBe(false);
  expect(result.modes.every((m) => m.trials === 48 && m.recoveryPassed && !m.rawSchemaPassed)).toBe(true);
  expect(result.executions).toBe(calls);
  expect(calls).toBeLessThanOrEqual(208);
}, 120000);
