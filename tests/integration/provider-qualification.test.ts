import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { prepareQualification, QualificationLedger, runQualification } from "../../src/qualification-run.js";
import { FakeModel } from "../helpers.js";

const url =
  process.env.QUALIFICATION_TEST_DATABASE_URL ??
  "postgres://fleet_qualification:qualification_fixture@127.0.0.1:5436/fleet_qualification";
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0)) await close();
});
async function setup() {
  const l = await QualificationLedger.open(url, randomBytes(32).toString("base64"));
  closes.push(() => l.close());
  const p = prepareQualification({
    schemaVersion: "fleet.local-qualification.v1",
    id: randomUUID(),
    authorizationRef: `test:${randomUUID()}`,
    approved: true,
    fleetCommit: "a".repeat(40),
    modelDigest: "6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197",
    model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: true },
    endpoint: "http://127.0.0.1:11434",
    helperEndpoint: "http://127.0.0.1:8832",
    startsAt: new Date(Date.now() - 1000).toISOString(),
    deadlineAt: new Date(Date.now() + 254 * 60000).toISOString(),
    scope: "synthetic_fixtures_only",
    executionLimit: 104,
    tokenLimit: 4160000,
    helperLimit: 48,
  });
  await l.create(p);
  await l.startStage(p, "Q1");
  return { l, p };
}
const request = (p: ReturnType<typeof prepareQualification>) => ({
  model: p.plan.model,
  messages: [{ role: "user", content: "Choose a wait." }],
  schema: {
    type: "object",
    properties: { kind: { const: "wait" }, summary: { type: "string" } },
    required: ["kind", "summary"],
    additionalProperties: false,
  },
  maxOutputTokens: 2000,
  signal: new AbortController().signal,
});
it("enforces durable stage and trial caps across restarted wrappers with no refunds", async () => {
  const { l, p } = await setup();
  const raw = new FakeModel();
  for (let i = 0; i < 8; i++) await l.model(p, raw, "calibration", `probe:${i}`).decide(request(p));
  await expect(l.model(p, raw, "calibration", "extra").decide(request(p))).rejects.toThrow("QUALIFICATION_BUDGET");
  expect(raw.inputs).toHaveLength(8);
  expect(await l.summary(p)).toMatchObject({ executions: 8, reservedTokens: 320000, unknown: 0 });
  await l.finishStage(p, "Q1");
  await l.startStage(p, "Q2");
  for (let i = 0; i < 24; i++) await l.model(p, raw, "legacy-loop", `case:${Math.floor(i / 2)}`).decide(request(p));
  await expect(l.model(p, raw, "legacy-loop", "more").decide(request(p))).rejects.toThrow("QUALIFICATION_BUDGET");
  await expect(
    l
      .model(p, raw, "reactive-basic", "case:0")
      .decide({ ...request(p), messages: [{ role: "user", content: "x".repeat(25000) }] }),
  ).rejects.toThrow("QUALIFICATION_INPUT");
  expect((await l.summary(p)).executions).toBe(32);
});
it("rejects concurrent reservations, changed plans and duplicate authorization identities", async () => {
  const { l, p } = await setup();
  const raw = new FakeModel();
  const model = l.model(p, raw, "calibration", "one");
  const results = await Promise.allSettled([model.decide(request(p)), model.decide(request(p))]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  await expect(l.create(prepareQualification({ ...p.plan, id: randomUUID() }))).rejects.toThrow(
    "QUALIFICATION_AUTHORIZATION_REUSED",
  );
  await expect(
    l
      .model(prepareQualification({ ...p.plan, fleetCommit: "b".repeat(40) }), raw, "calibration", "other")
      .decide(request(p)),
  ).rejects.toThrow("QUALIFICATION_PLAN_CHANGED");
});
it("retains unknown dispatch and prevents all later model work", async () => {
  const { l, p } = await setup();
  const raw = {
    tracksDispatch: true,
    async decide(i: Parameters<FakeModel["decide"]>[0]) {
      await i.onDispatch?.();
      throw Error("fixture transport uncertainty");
    },
  };
  await expect(l.model(p, raw, "calibration", "bad").decide(request(p))).rejects.toThrow();
  expect(await l.summary(p)).toMatchObject({ executions: 1, reservedTokens: 40000, unknown: 1 });
  const good = new FakeModel();
  await expect(l.model(p, good, "calibration", "later").decide(request(p))).rejects.toThrow();
  expect(good.inputs).toHaveLength(0);
});
it("retains reported malformed output, usage overrun and helper caps", async () => {
  const { l, p } = await setup();
  const raw = {
    async decide() {
      return { decision: null, decisionError: "INVALID_MODEL_OUTPUT", inputTokens: 20, outputTokens: 5 };
    },
  };
  await l.model(p, raw, "calibration", "bad-json").decide(request(p));
  expect(await l.summary(p)).toMatchObject({ executions: 1, reportedInputTokens: 20, invalid: 1, unknown: 0 });
  await l.finishStage(p, "Q1");
  await l.startStage(p, "Q2");
  const helper = {
    async choose(_q: string, c: { id: string; text: string }[]) {
      return { id: c[0].id, probability: 0.8, certificate: "a".repeat(64) };
    },
  };
  for (let i = 0; i < 48; i++)
    await l.recall(p, helper, "legacy-cognition", `helper:${i}`).choose(
      "query",
      [
        { id: "a", text: "a" },
        { id: "b", text: "b" },
      ],
      new AbortController().signal,
    );
  await expect(
    l.recall(p, helper, "legacy-cognition", "extra").choose(
      "query",
      [
        { id: "a", text: "a" },
        { id: "b", text: "b" },
      ],
      new AbortController().signal,
    ),
  ).rejects.toThrow("QUALIFICATION_HELPER_BUDGET");
  const over = {
    async decide() {
      return { decision: { kind: "wait", summary: "ok" }, inputTokens: 40001, outputTokens: 1 };
    },
  };
  await expect(l.model(p, over, "reactive-basic", "over").decide(request(p))).rejects.toThrow(
    "QUALIFICATION_USAGE_OVERRUN",
  );
  expect(await l.summary(p)).toMatchObject({ executions: 2, accountedTokens: 80002, reportedInputTokens: 40021 });
});

it("refuses an interrupted process reservation, expired stage and profile/trial overflow before dispatch", async () => {
  const { l, p } = await setup();
  await l.pool.query(
    "INSERT INTO qualification_calls(id,run_id,profile,trial,state) VALUES($1,$2,'calibration','crashed','dispatched')",
    [randomUUID(), p.plan.id],
  );
  const raw = new FakeModel();
  await expect(l.model(p, raw, "calibration", "later").decide(request(p))).rejects.toThrow(
    "QUALIFICATION_UNRESOLVED_DISPATCH",
  );
  expect(raw.inputs).toHaveLength(0);
});
it("enforces all104 reservations and preserves complete ciphertext under restart", async () => {
  const { l, p } = await setup();
  const raw = new FakeModel();
  for (let i = 0; i < 8; i++) await l.model(p, raw, "calibration", `smoke:${i}`).decide(request(p));
  await l.finishStage(p, "Q1");
  await l.startStage(p, "Q2");
  for (const profile of ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"])
    for (let i = 0; i < 24; i++)
      await l.model(p, raw, profile, `trial:${Math.floor(i / 2)}`).decide({
        ...request(p),
        model: {
          ...p.plan.model,
          ...(profile === "legacy-cognition"
            ? { cognition: "llm-centered-v1" as const, recallAssist: "laya-recall-v1" as const }
            : {}),
        },
      });
  expect(await l.summary(p)).toMatchObject({ executions: 104, reservedTokens: 4160000, unknown: 0 });
  await expect(l.model(p, raw, "reactive-cognition", "extra").decide(request(p))).rejects.toThrow(
    "QUALIFICATION_BUDGET",
  );
  expect(raw.inputs).toHaveLength(104);
  const row = (
    await l.pool.query("SELECT id,detail_cipher FROM qualification_calls WHERE run_id=$1 LIMIT 1", [p.plan.id])
  ).rows[0];
  expect(l.vault.decrypt(row.detail_cipher, `qualification-call:${row.id}`)).toMatchObject({
    response: { inputTokens: 500 },
  });
  expect(() => l.vault.decrypt(row.detail_cipher, "other-binding")).toThrow();
});

it("rejects expired stages, aborted inputs, wrong settings and the third trial call without dispatch", async () => {
  const { l, p } = await setup(),
    raw = new FakeModel();
  await expect(
    l
      .model(p, raw, "calibration", "wrong")
      .decide({ ...request(p), model: { ...p.plan.model, cognition: "llm-centered-v1" } }),
  ).rejects.toThrow("QUALIFICATION_INPUT");
  const controller = new AbortController();
  controller.abort();
  await expect(
    l.model(p, raw, "calibration", "aborted").decide({ ...request(p), signal: controller.signal }),
  ).rejects.toThrow();
  await l.finishStage(p, "Q1");
  await l.startStage(p, "Q2");
  for (let i = 0; i < 2; i++) await l.model(p, raw, "reactive-basic", "same").decide(request(p));
  await expect(l.model(p, raw, "reactive-basic", "same").decide(request(p))).rejects.toThrow("QUALIFICATION_BUDGET");
  await l.pool.query("UPDATE qualification_runs SET stage_deadline=now()-interval '1 second' WHERE id=$1", [p.plan.id]);
  await expect(l.model(p, raw, "reactive-basic", "expired").decide(request(p))).rejects.toThrow(
    "QUALIFICATION_NOT_ACTIVE",
  );
  expect(raw.inputs).toHaveLength(2);
});

it("halts the one-shot runner on unknown calibration usage before any fixture trial", async () => {
  const l = await QualificationLedger.open(url, randomBytes(32).toString("base64"));
  closes.push(() => l.close());
  const p = prepareQualification({
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
    deadlineAt: new Date(Date.now() + 254 * 60000).toISOString(),
    scope: "synthetic_fixtures_only",
    executionLimit: 104,
    tokenLimit: 4160000,
    helperLimit: 48,
  });
  let calls = 0,
    trials = 0;
  await expect(
    runQualification(p, {
      ledger: l,
      model: {
        decide: async () => {
          calls++;
          return { decision: { kind: "wait", summary: "Wait" }, inputTokens: null, outputTokens: null };
        },
      },
      recall: {
        choose: async () => {
          throw Error("UNEXPECTED_HELPER");
        },
      },
      fixtures: {
        scenarios: ["a", "b", "c", "d", "e", "f"],
        run: async () => {
          trials++;
          return {};
        },
      },
    }),
  ).rejects.toThrow("QUALIFICATION_UNKNOWN_USAGE");
  expect(calls).toBe(1);
  expect(trials).toBe(0);
  expect(await l.summary(p)).toMatchObject({
    state: "blocked",
    executions: 1,
    reservedTokens: 40000,
    unknown: 1,
    passed: false,
  });
});
