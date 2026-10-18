import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  createFullQualification,
  prepareFullQualification,
  runFullQualification,
} from "../../src/full-qualification.js";
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
