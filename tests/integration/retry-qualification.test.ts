import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { PactQualificationFixtures } from "../../src/games/pact/qualification.js";
import { prepareQualification, QualificationLedger, qualificationModelDigest } from "../../src/qualification-run.js";
import { RecoveryQualification, runRetryQualification } from "../../src/retry-qualification.js";
import { openQualificationFixture } from "../qualification-helpers.js";

const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closes.splice(0)) await c();
});
async function setup() {
  const ledger = await openQualificationFixture(Buffer.alloc(32, 19).toString("base64"));
  closes.push(() => ledger.close());
  const parent = prepareQualification({
    schemaVersion: "fleet.local-qualification.v1",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    approved: true,
    fleetCommit: "a".repeat(40),
    modelDigest: qualificationModelDigest,
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
  await ledger.create(parent);
  await ledger.fail(parent, "QUALIFICATION_CALIBRATION_FAILED");
  for (let i = 0; i < 18; i++)
    await ledger.pool.query(
      "INSERT INTO qualification_calls(id,run_id,profile,trial,state,tokens,input_tokens,output_tokens,valid) VALUES($1,$2,'preserved',$3,'reported',40000,20,5,true)",
      [randomUUID(), parent.plan.id, String(i)],
    );
  const approval = {
    schemaVersion: "fleet.retry-qualification.v1",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    approved: true,
    parentDigest: parent.digest,
    sourceCommit: "b".repeat(40),
    startsAt: new Date(Date.now() - 500).toISOString(),
    deadlineAt: parent.plan.deadlineAt,
    scope: "synthetic_retry_fixtures_only",
    executionLimit: 86,
    tokenLimit: 3440000,
    perModeExecutionLimit: 43,
    helperLimit: 20,
    baselineExecutions: 18,
    baselineReservedTokens: 720000,
  };
  const recovery = await RecoveryQualification.create(ledger, parent, approval);
  return { ledger, parent, approval, recovery };
}
const request = (thinking: boolean) => ({
  model: { route: "ollama" as const, model: "nemotron-3-nano:4b", thinking },
  messages: [{ role: "user", content: "Wait" }],
  schema: { type: "object" },
  maxOutputTokens: 2000,
  signal: new AbortController().signal,
});
const raw = { decide: async () => ({ decision: { kind: "wait", summary: "Wait" }, inputTokens: 20, outputTokens: 5 }) };
it("retains the original parent and enforces disjoint43-mode and combined104 ceilings without refunds", async () => {
  const f = await setup(),
    before = (
      await f.ledger.pool.query("SELECT to_jsonb(r) body FROM qualification_runs r WHERE id=$1", [f.parent.plan.id])
    ).rows[0].body;
  for (const thinking of [true, false])
    for (let i = 0; i < 43; i++)
      await f.recovery.model(raw, thinking, "recovery-calibration", `budget:${i}`).decide(request(thinking));
  await expect(f.recovery.model(raw, true, "recovery-calibration", "excess").decide(request(true))).rejects.toThrow(
    "RECOVERY_BUDGET",
  );
  expect((await f.ledger.summary(f.parent)).executions).toBe(104);
  expect(
    (await f.ledger.pool.query("SELECT to_jsonb(r) body FROM qualification_runs r WHERE id=$1", [f.parent.plan.id]))
      .rows[0].body,
  ).toEqual(before);
  await expect(
    RecoveryQualification.create(f.ledger, f.parent, {
      ...f.approval,
      id: randomUUID(),
      authorizationRef: randomUUID(),
    }),
  ).rejects.toThrow("RECOVERY_AUTHORIZATION_REUSED");
});
it("rejects mode changes and stops both modes after uncertain dispatch without rewriting original Q1", async () => {
  const f = await setup();
  await expect(f.recovery.model(raw, true, "reactive-basic", "a").decide(request(false))).rejects.toThrow(
    "RECOVERY_MODEL_MISMATCH",
  );
  let calls = 0;
  const bad = {
    tracksDispatch: true,
    decide: async (i: Parameters<ModelPort["decide"]>[0]) => {
      calls++;
      await i.onDispatch?.();
      throw Error("UNCERTAIN");
    },
  };
  await expect(f.recovery.model(bad, true, "reactive-basic", "a").decide(request(true))).rejects.toThrow();
  await expect(f.recovery.model(raw, false, "reactive-basic", "b").decide(request(false))).rejects.toThrow(
    "RECOVERY_NOT_ACTIVE",
  );
  expect(calls).toBe(1);
  expect(await f.ledger.summary(f.parent)).toMatchObject({
    state: "blocked",
    code: "QUALIFICATION_CALIBRATION_FAILED",
    unknown: 1,
    executions: 19,
  });
});
it("runs both real engine compositions with forced known output failures under exactly86 fake executions", async () => {
  const f = await setup();
  let calls = 0;
  const result = await runRetryQualification(f.recovery, {
    model: {
      decide: async (input) => {
        calls++;
        const canary = input.messages[0].content.includes("canary");
        const calibration = input.messages[0].content.includes("calibration");
        const feedback = calibration ? [] : (JSON.parse(input.messages[1].content).decisionFeedback ?? []);
        if (!canary && !input.messages[0].content.includes("previous response") && !feedback.length)
          return { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
        const legacy = input.messages.some((m) => m.content.includes("PACT:"));
        const decision = calibration
          ? { kind: "wait", summary: "Wait" }
          : legacy
            ? { kind: "wait", summary: "Wait" }
            : { kind: "wait", summary: "Wait" };
        const props = input.schema.properties as Record<string, unknown> | undefined;
        return {
          decision: props?.cognition
            ? {
                decision,
                cognition: { expectedVersion: 0, analysis: { type: "none", reason: "No grounded revision needed." } },
              }
            : props?.decision
              ? { decision }
              : decision,
          inputTokens: 20,
          outputTokens: 5,
        };
      },
    },
    recall: { choose: async (_q, c) => ({ id: c[0].id, probability: 0.8, certificate: "a".repeat(64) }) },
    fixtures: async (thinking) => PactQualificationFixtures.create(f.ledger, f.parent, thinking),
  });
  expect(calls).toBe(86);
  expect(result.modes.every((m) => m.recoveryPassed && !m.rawPassed)).toBe(true);
  expect(result.modes).toHaveLength(2);
  expect(result.modes.every((m) => m.trials === 22)).toBe(true);
  expect(result.modes.every((m) => m.invalid > 0 && m.executions <= 43)).toBe(true);
  expect((await f.ledger.summary(f.parent)).executions).toBe(18 + calls);
}, 60000);

it("refuses changed/expired approvals and preserves non-dispatch reservations without refund", async () => {
  const f = await setup();
  await expect(
    RecoveryQualification.create(f.ledger, f.parent, { ...f.approval, sourceCommit: "c".repeat(40) }),
  ).rejects.toThrow("RECOVERY_PLAN_CHANGED");
  await expect(
    RecoveryQualification.create(f.ledger, f.parent, {
      ...f.approval,
      deadlineAt: new Date(Date.parse(f.parent.plan.deadlineAt) + 1).toISOString(),
    }),
  ).rejects.toThrow("RECOVERY_SCOPE");
  await expect(
    f.recovery
      .model(
        {
          tracksDispatch: true,
          decide: async () => {
            throw new (await import("../../src/domain.js")).FleetError("MODEL_ENDPOINT_REQUIRED", true);
          },
        },
        true,
        "reactive-basic",
        "non-dispatch",
      )
      .decide(request(true)),
  ).rejects.toThrow("MODEL_ENDPOINT_REQUIRED");
  const calls = (
    await f.ledger.pool.query(
      "SELECT state,tokens::text FROM qualification_calls WHERE run_id=$1 AND profile='reactive-basic'",
      [f.parent.plan.id],
    )
  ).rows;
  expect(calls).toEqual([{ state: "not_dispatched", tokens: "40000" }]);
  expect((await f.ledger.summary(f.parent)).executions).toBe(19);
  expect((await f.recovery.summary()).state).toBe("blocked");
});

it("does not count a valid read followed by a failed final output as recovery", async () => {
  const f = await setup();
  await f.recovery.model(raw, true, "recovery-calibration", "bad-tail").decide(request(true));
  await f.recovery
    .model(
      {
        decide: async () => ({
          decision: null,
          decisionError: "MODEL_THINKING_WITHOUT_FINAL",
          inputTokens: 20,
          outputTokens: 5,
        }),
      },
      true,
      "recovery-calibration",
      "bad-tail",
    )
    .decide(request(true));
  expect((await f.recovery.summary()).modes[0].recoveredOutputs).toBe(0);
});
