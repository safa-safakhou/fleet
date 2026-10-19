import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DiagnosticJournal, type DiagnosticScope, diagnosticApproval } from "../../src/cognition-diagnostic-journal.js";
import { Vault } from "../../src/vault.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true });
});
const approval = () =>
  diagnosticApproval({
    schemaVersion: "fleet.cognition-diagnostic.v1",
    id: crypto.randomUUID(),
    authorizationRef: "founder-20261019",
    approved: true,
    sourceCommit: "a".repeat(40),
    startsAt: new Date(Date.now() - 1000).toISOString(),
    deadlineAt: new Date(Date.now() + 3600000).toISOString(),
    endpoint: "http://127.0.0.1:11434",
    helperEndpoint: "http://127.0.0.1:8832",
    modelLimit: 64,
    tokenLimit: 2560000,
    helperLimit: 160,
    scope: "synthetic_fixtures_only",
  });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "cognition-diag-"));
  dirs.push(dir);
  const path = join(dir, "journal.jsonl");
  const j = await DiagnosticJournal.create(path, approval(), new Vault(Buffer.alloc(32, 7).toString("base64")));
  return { j, path };
}
const scope = { thinking: true, profile: "legacy-cognition" as const, turn: "promise:0" };
it("creates a private exclusive encrypted hash-chained journal and preserves raw helper abstention", async () => {
  const { j, path } = await setup();
  await expect(
    DiagnosticJournal.create(path, approval(), new Vault(Buffer.alloc(32, 7).toString("base64"))),
  ).rejects.toThrow();
  await j.invoke("helper", { ...scope, lane: "embedded" }, { secret: "private-source" }, async (mark) => {
    await mark();
    return { abstained: true, probability: 0.61 };
  });
  const text = await readFile(path, "utf8");
  expect(text).not.toContain("private-source");
  expect(text).not.toContain("0.61");
  const rows = text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  expect(rows.at(-1).previous).toBe(rows.at(-2).hash);
  expect(j.summary()).toMatchObject({ helperCalls: 1, modelCalls: 0, unknown: 0, state: "active" });
  await j.close();
});
it("enforces two per turn,16 per mode/profile,32 per mode and64 globally without refund", async () => {
  const { j } = await setup();
  const call = async (s: DiagnosticScope = scope) =>
    j.invoke("model", s, {}, async (mark) => {
      await mark();
      return { inputTokens: 2, outputTokens: 3 };
    });
  for (const thinking of [true, false])
    for (const profile of ["legacy-cognition", "reactive-cognition"] as const) {
      for (let turn = 0; turn < 8; turn++)
        for (let n = 0; n < 2; n++) await call({ thinking, profile, turn: String(turn) });
    }
  expect(j.summary()).toMatchObject({ modelCalls: 64, reservedTokens: 2560000 });
  await expect(call()).rejects.toThrow("DIAGNOSTIC_BUDGET");
  await j.close();
});
it("rejects third turn attempt and fifth embedded helper, preserving allocations", async () => {
  const { j } = await setup();
  for (let i = 0; i < 2; i++)
    await j.invoke("model", scope, {}, async (mark) => {
      await mark();
      return {};
    });
  await expect(j.invoke("model", scope, {}, async () => ({}))).rejects.toThrow("DIAGNOSTIC_BUDGET");
  expect(j.summary().modelCalls).toBe(2);
  await j.close();
  const b = await setup();
  for (let i = 0; i < 4; i++)
    await b.j.invoke("helper", { ...scope, lane: "embedded" }, {}, async (mark) => {
      await mark();
      return {};
    });
  await expect(b.j.invoke("helper", { ...scope, lane: "embedded" }, {}, async () => ({}))).rejects.toThrow(
    "DIAGNOSTIC_BUDGET",
  );
  await b.j.close();
});
it("counts standalone96 and embedded64 against shared160 ceiling", async () => {
  const { j } = await setup();
  for (let i = 0; i < 96; i++)
    await j.invoke("helper", { lane: "standalone", turn: String(i) }, {}, async (mark) => {
      await mark();
      return {};
    });
  for (let i = 0; i < 64; i++)
    await j.invoke("helper", { ...scope, lane: "embedded", turn: String(i >> 2) }, {}, async (mark) => {
      await mark();
      return {};
    });
  expect(j.summary().helperCalls).toBe(160);
  await expect(j.invoke("helper", { lane: "standalone", turn: "extra" }, {}, async () => ({}))).rejects.toThrow(
    "DIAGNOSTIC_BUDGET",
  );
  await j.close();
});
it("fences both modes after dispatched uncertainty and cannot reopen a closed journal", async () => {
  const { j } = await setup();
  await expect(
    j.invoke("model", scope, {}, async (mark) => {
      await mark();
      throw Error("transport");
    }),
  ).rejects.toThrow("transport");
  expect(j.summary()).toMatchObject({ state: "blocked", unknown: 1, modelCalls: 1, reservedTokens: 40000 });
  await expect(j.invoke("model", { ...scope, thinking: false }, {}, async () => ({}))).rejects.toThrow(
    "DIAGNOSTIC_STOPPED",
  );
  await j.close();
});
it("rejects remote endpoints, excessive window and legacy grant shapes", () => {
  expect(() => diagnosticApproval({ ...approval(), helperEndpoint: "https://example.com" })).toThrow();
  expect(() =>
    diagnosticApproval({ ...approval(), deadlineAt: new Date(Date.now() + 3 * 3600000).toISOString() }),
  ).toThrow();
  expect(() => diagnosticApproval({ ...approval(), modelLimit: 208 })).toThrow();
});

it("records actual raw HTTP abstention without retry and blocks a swallowed unknown before the next model", async () => {
  const { j, path } = await setup();
  let calls = 0;
  const transport = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        task: "laya-recall-v1",
        runtime: "0.4.6",
        revision: "e929ae5cf69bc34259cd2f95c9e91145b818b1f0",
        certificate: "375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc",
        id: "a",
        probability: 0.61,
        abstained: true,
      }),
    );
  };
  const recall = j.recall({ ...scope, lane: "embedded" }, transport);
  await expect(
    recall.choose(
      "Find the promised delivery",
      [
        { id: "a", text: "Maple promised iron." },
        { id: "b", text: "Oak changed flags." },
      ],
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow("LAYA_ABSTAINED");
  expect(calls).toBe(1);
  expect(j.summary().state).toBe("active");
  const rows = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const reserve = rows.find((r) => r.value.type === "reserve").value;
  const result = rows.find((r) => r.value.type === "result").value;
  expect(
    new Vault(Buffer.alloc(32, 7).toString("base64")).decrypt(result.detail, `diagnostic:${reserve.id}:result`),
  ).toMatchObject({ probability: 0.61, abstained: true });
  await j.close();
});
it("rejects expired dispatch and stops on missing usage even when provider returned content", async () => {
  const { j } = await setup();
  let called = 0;
  const model = j.model(
    {
      decide: async () => {
        called++;
        return { decision: { kind: "wait" }, inputTokens: null, outputTokens: null };
      },
    },
    scope,
  );
  await expect(
    model.decide({
      model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: true },
      messages: [],
      schema: { type: "object" },
      maxOutputTokens: 2000,
      signal: AbortSignal.timeout(1000),
    }),
  ).rejects.toThrow("DIAGNOSTIC_UNKNOWN_OR_EXCESS_USAGE");
  expect(called).toBe(1);
  expect(j.summary()).toMatchObject({ state: "blocked", unknown: 1, reservedTokens: 40000 });
  await j.close();
});

it("fences a model scope mismatch before dispatch and enforces the wall-clock deadline", async () => {
  const { j } = await setup();
  let calls = 0;
  const model = j.model(
    {
      decide: async () => {
        calls++;
        return { decision: {}, inputTokens: 1, outputTokens: 1 };
      },
    },
    scope,
  );
  await expect(
    model.decide({
      model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: false },
      messages: [],
      schema: { type: "object" },
      maxOutputTokens: 2000,
      signal: AbortSignal.timeout(1000),
    }),
  ).rejects.toThrow("DIAGNOSTIC_MODEL_SCOPE");
  expect(calls).toBe(0);
  expect(j.summary().state).toBe("blocked");
  await j.close();
  const dir = await mkdtemp(join(tmpdir(), "diag-clock-"));
  dirs.push(dir);
  const a = approval();
  let time = Date.parse(a.startsAt) + 1;
  const clocked = await DiagnosticJournal.create(
    join(dir, "journal"),
    a,
    new Vault(Buffer.alloc(32, 7).toString("base64")),
    () => time,
  );
  time = Date.parse(a.deadlineAt);
  await expect(clocked.invoke("model", scope, {}, async () => ({}))).rejects.toThrow("DIAGNOSTIC_DEADLINE");
  expect(clocked.summary().modelCalls).toBe(0);
  await clocked.close();
});
