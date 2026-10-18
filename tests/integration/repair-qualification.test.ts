import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { prepareQualification, QualificationLedger, qualificationModelDigest } from "../../src/qualification-run.js";
import { RepairQualification, runRepairQualification } from "../../src/repair-qualification.js";

const url = "postgres://fleet_qualification:qualification_fixture@127.0.0.1:5436/fleet_qualification";
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closes.splice(0)) await c();
});
async function setup(expired = false) {
  const ledger = await QualificationLedger.open(url, Buffer.alloc(32, 19).toString("base64"));
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
    startsAt: new Date(Date.now() - (expired ? 60 * 60000 : 1000)).toISOString(),
    deadlineAt: new Date(Date.now() + (expired ? -1000 : 59 * 60000)).toISOString(),
    scope: "synthetic_fixtures_only",
    executionLimit: 104,
    tokenLimit: 4160000,
    helperLimit: 48,
  });
  await ledger.create(parent);
  await ledger.fail(parent, "QUALIFICATION_CALIBRATION_FAILED");
  for (let i = 0; i < 67; i++)
    await ledger.pool.query(
      "INSERT INTO qualification_calls(id,run_id,profile,trial,state,tokens,input_tokens,output_tokens,valid) VALUES($1,$2,'preserved',$3,'reported',40000,20,5,true)",
      [randomUUID(), parent.plan.id, String(i)],
    );
  const predecessor = randomUUID();
  await ledger.pool.query(
    `CREATE TABLE IF NOT EXISTS qualification_recoveries(id uuid PRIMARY KEY,run_id uuid UNIQUE NOT NULL REFERENCES qualification_runs(id),authorization_ref text UNIQUE NOT NULL,digest text NOT NULL,plan jsonb NOT NULL,state text NOT NULL DEFAULT 'active',code text,created_at timestamptz NOT NULL DEFAULT now())`,
  );
  await ledger.pool.query(
    "INSERT INTO qualification_recoveries(id,run_id,authorization_ref,digest,plan,state) VALUES($1,$2,$3,$4,$5,'done')",
    [predecessor, parent.plan.id, randomUUID(), "a".repeat(64), {}],
  );
  const approval = {
    schemaVersion: "fleet.repair-qualification.v1",
    id: randomUUID(),
    authorizationRef: randomUUID(),
    approved: true,
    parentDigest: parent.digest,
    predecessor,
    sourceCommit: "b".repeat(40),
    startsAt: new Date(Date.now() - 500).toISOString(),
    deadlineAt: new Date(Date.now() + 59 * 60000).toISOString(),
    scope: "synthetic_retry_fixtures_only",
    executionLimit: 37,
    tokenLimit: 1480000,
    thinkingExecutionLimit: 19,
    nonThinkingExecutionLimit: 18,
    helperLimit: 16,
    baselineExecutions: 67,
    baselineReservedTokens: 2680000,
  };
  const recovery = await RepairQualification.create(ledger, parent, approval);
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
it("appends a new bounded window without reopening the expired parent or completed predecessor and caps all attempts", async () => {
  const f = await setup(true);
  const before = (
    await f.ledger.pool.query("SELECT to_jsonb(r) body FROM qualification_runs r WHERE id=$1", [f.parent.plan.id])
  ).rows[0].body;
  for (const thinking of [true, false])
    for (let i = 0; i < (thinking ? 19 : 18); i++)
      await f.recovery.model(raw, thinking, "recovery-calibration", `case:${i}`).decide(request(thinking));
  await expect(f.recovery.model(raw, true, "recovery-calibration", "excess").decide(request(true))).rejects.toThrow(
    "REPAIR_BUDGET",
  );
  expect((await f.ledger.summary(f.parent)).executions).toBe(104);
  expect(
    (await f.ledger.pool.query("SELECT to_jsonb(r) body FROM qualification_runs r WHERE id=$1", [f.parent.plan.id]))
      .rows[0].body,
  ).toEqual(before);
  await f.recovery.finish();
  await expect(
    RepairQualification.create(f.ledger, f.parent, { ...f.approval, id: randomUUID(), authorizationRef: randomUUID() }),
  ).rejects.toThrow("REPAIR_AUTHORIZATION_REUSED");
});
it("stops both modes on unknown usage and rejects a mode change before reservation", async () => {
  const f = await setup();
  await expect(f.recovery.model(raw, true, "reactive-basic", "mode").decide(request(false))).rejects.toThrow(
    "REPAIR_MODEL_MISMATCH",
  );
  const unknown = { decide: async () => ({ decision: null, inputTokens: null, outputTokens: null }) };
  await expect(f.recovery.model(unknown, true, "reactive-basic", "unknown").decide(request(true))).rejects.toThrow();
  await expect(f.recovery.model(raw, false, "reactive-basic", "after").decide(request(false))).rejects.toThrow(
    "REPAIR_NOT_ACTIVE",
  );
  expect((await f.ledger.summary(f.parent)).executions).toBe(68);
});

it("runs both actual engine modes through bounded corrections under the new window and never dispatches game traffic", async () => {
  const f = await setup(true);
  let attempt = 0;
  const model = {
    decide: async (input: Parameters<import("../../src/domain.js").ModelPort["decide"]>[0]) => {
      const envelope = !!(input.schema.properties as Record<string, unknown> | undefined)?.decision;
      const cognition = !!(input.schema.properties as Record<string, unknown> | undefined)?.cognition;

      const canary = input.messages[0].content.includes("calibration");
      return {
        decision:
          !canary && attempt++ % 2 === 0
            ? { bad: true }
            : cognition
              ? {
                  cognition: { expectedVersion: 0, analysis: { type: "none", reason: "No new evidence" } },
                  decision: { kind: "wait", summary: "Wait" },
                }
              : envelope
                ? { decision: { kind: "wait", summary: "Wait" } }
                : { kind: "wait", summary: "Wait" },
        inputTokens: 500,
        outputTokens: 30,
      };
    },
  };
  const { PactQualificationFixtures } = await import("../../src/games/pact/qualification.js");
  const result = await runRepairQualification(f.recovery, {
    model,
    recall: {
      choose: async () => {
        throw new Error("ABSTAIN");
      },
    },
    fixtures: (thinking) => PactQualificationFixtures.create(f.ledger, f.parent, thinking, f.approval.deadlineAt),
  });
  expect(result.modes.every((m) => m.trials === 9)).toBe(true);
  expect(result.aggregate.executions).toBeLessThanOrEqual(104);
  expect(result.aggregate.unknown).toBe(0);
  expect(result.modes.every((m) => m.failures === 0)).toBe(true);
}, 60000);
