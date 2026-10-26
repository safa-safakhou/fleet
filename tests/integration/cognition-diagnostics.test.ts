import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DiagnosticJournal, diagnosticApproval } from "../../src/cognition-diagnostic-journal.js";
import { registerDiagnostic } from "../../src/cognition-diagnostic-registration.js";
import { runCognitionDiagnostics } from "../../src/cognition-diagnostic-run.js";
import { expandFactTables } from "../../src/fact-table.js";
import { DiagnosticEpisodes } from "../../src/games/pact/cognition-diagnostics.js";
import { Store } from "../../src/store.js";
import { fixture } from "../helpers.js";

// Diagnostic observations and evidence validation share a fixed fixture clock.
// Keep real journal deadlines separate; wall-clock adjustment cannot date a
// just-created synthetic observation in the future.
function fixtureClock() {
  const time = Date.now();
  return () => new Date(time);
}
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closes.splice(0)) await c();
});
it("continues three actual engine turns with one identity, owned cited memory and changed current evidence", async () => {
  const f = await fixture();
  closes.push(() => f.pool.end());
  const store = new Store(f.pool, f.store.vault, fixtureClock());
  const episodes = new DiagnosticEpisodes(store, new Date(Date.now() + 3600000).toISOString(), "test-run");
  let calls = 0,
    saved = "";
  const model = {
    decide: async (input: { messages: { content: string }[] }) => {
      calls++;
      const context = expandFactTables(JSON.parse(input.messages[1].content).continuity) as ReturnType<
        typeof JSON.parse
      >;
      if (calls === 1) {
        saved = context.evidence[0].id;
        return {
          decision: {
            decision: { kind: "wait", summary: "Observe the promise" },
            continuity: {
              memories: [
                { text: "Maple promised 40 iron by game time 2000; this is not fulfilment.", evidenceRefs: [saved] },
              ],
            },
          },
          inputTokens: 500,
          outputTokens: 100,
        };
      }
      expect(context.memories[0].evidenceRefs).toContain(saved);
      expect(context.evidence.some((e: { id: string }) => e.id === saved)).toBe(true);
      return {
        decision: { decision: { kind: "wait", summary: "Compare retained promise with current outcome" } },
        inputTokens: 500,
        outputTokens: 100,
      };
    },
  };
  const recall = {
    choose: async () => {
      throw Error("MUST_NOT_CALL_HELPER");
    },
  };
  const results = [];
  for (let step = 0; step < 3; step++)
    results.push(await episodes.run("reactive-cognition", true, "promise", step, model, recall));
  expect(new Set(results.map((r) => r.cohortId)).size).toBe(1);
  expect(new Set(results.map((r) => r.agentId)).size).toBe(1);
  expect(new Set(results.map((r) => r.bindingId)).size).toBe(1);
  expect(results.map((r) => r.code)).toEqual(["WAIT", "WAIT", "WAIT"]);
  expect(calls).toBe(3);
  expect(results.every((r) => !r.pending && !r.scopeViolation && r.withheld === 0)).toBe(true);
  expect((await f.pool.query("SELECT state FROM cohorts")).rows).toEqual([{ state: "paused" }]);
});
it("runs the unchanged legacy cognition path and withholds synthetic actions", async () => {
  const f = await fixture();
  closes.push(() => f.pool.end());
  const episodes = new DiagnosticEpisodes(
    new Store(f.pool, f.store.vault, fixtureClock()),
    new Date(Date.now() + 3600000).toISOString(),
    "test-run",
  );
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      return {
        decision: { kind: "wait", summary: "No evidence of fulfilment; wait" },
        inputTokens: 500,
        outputTokens: 50,
      };
    },
  };
  const result = await episodes.run("legacy-cognition", false, "no-evidence", 0, model, {
    choose: async () => {
      throw Error("LAYA_ABSTAINED");
    },
  });
  expect(calls).toBeGreaterThan(0);
  expect(result).toMatchObject({ pending: false, scopeViolation: false, withheld: 0, code: "WAIT" });
});

it("runs the complete32-turn/88-helper protocol with real engines and a fake provider before any real calls", async () => {
  const f = await fixture();
  closes.push(() => f.pool.end());
  const dir = await mkdtemp(join(tmpdir(), "diagnostic-protocol-"));
  closes.push(() => rm(dir, { recursive: true }));
  const approval = diagnosticApproval({
    schemaVersion: "fleet.cognition-diagnostic.v1",
    id: crypto.randomUUID(),
    authorizationRef: "offline-test",
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
  const j = await DiagnosticJournal.create(join(dir, "journal"), approval, f.store.vault);
  let modelCalls = 0,
    helperCalls = 0;
  const model = {
    decide: async (input: { messages: { content: string }[] }) => {
      modelCalls++;
      const modern = Boolean(JSON.parse(input.messages[1].content).continuity);
      return {
        decision: modern
          ? { decision: { kind: "wait", summary: "Observe without inventing evidence" } }
          : {
              decision: { kind: "wait", summary: "Observe without inventing evidence" },
              cognition: {
                expectedVersion: JSON.parse(input.messages[1].content).cognition.version,
                analysis: { type: "none", reason: "No grounded revision is needed." },
              },
            },
        inputTokens: 500,
        outputTokens: 80,
      };
    },
  };
  const transport = async (_url: unknown, init?: RequestInit) => {
    helperCalls++;
    const body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        task: "laya-recall-v1",
        runtime: "0.4.6",
        revision: "e929ae5cf69bc34259cd2f95c9e91145b818b1f0",
        certificate: "375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc",
        id: body.candidates[0].id,
        probability: 0.6,
        abstained: true,
      }),
    );
  };
  const cases = Array.from({ length: 88 }, (_, i) => ({
    id: String(i),
    arm: "frozen",
    order: 0,
    query: "Find iron",
    candidates: [
      { id: "a", text: "Iron offer" },
      { id: "b", text: "Blue flag" },
    ],
    expected: "a",
  }));
  const result = await runCognitionDiagnostics(
    j,
    new DiagnosticEpisodes(new Store(f.pool, f.store.vault, fixtureClock()), approval.deadlineAt, approval.id),
    model,
    cases,
    transport,
  );
  expect(
    result.turns
      .filter((t) => t.code !== "WAIT")
      .map((t) => ({ profile: t.profile, scenario: t.scenario, step: t.step, code: t.code })),
  ).toEqual([]);
  expect(result.turns).toHaveLength(32);
  expect(result.turns.every((t) => t.code === "WAIT")).toBe(true);
  expect(modelCalls).toBe(32);
  expect(helperCalls).toBeGreaterThanOrEqual(88);
  expect(j.summary()).toMatchObject({ modelCalls: 32, reservedTokens: 1280000, unknown: 0 });
  await j.close();
}, 15000);

it("registers a fresh grant once and rejects any second journal path for the same authorization", async () => {
  const f = await fixture();
  closes.push(() => f.pool.end());
  const id = crypto.randomUUID();
  const authorizationRef = `diagnostic-test-${id}`;
  const approval = { id, authorizationRef };
  await registerDiagnostic(f.pool, approval, `/private/${id}/first`);
  await expect(registerDiagnostic(f.pool, approval, `/private/${id}/second`)).rejects.toThrow();
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM cognition_diagnostic_runs WHERE id=$1", [id])).rows[0].n,
  ).toBe(1);
});

it("withholds a valid synthetic command without opening any game transport", async () => {
  const f = await fixture();
  closes.push(() => f.pool.end());
  const episodes = new DiagnosticEpisodes(
    new Store(f.pool, f.store.vault, fixtureClock()),
    new Date(Date.now() + 3600000).toISOString(),
    "command-test",
  );
  const result = await episodes.run(
    "legacy-cognition",
    true,
    "promise",
    0,
    {
      decide: async (input) => ({
        decision: {
          decision: {
            kind: "action",
            action: {
              kind: "game.contact.request",
              recipientKingdomId: "22222222-2222-4222-8222-222222222222",
              note: "Synthetic introduction",
            },
            summary: "Consider contact",
          },
          cognition: {
            expectedVersion: JSON.parse(input.messages[1].content).cognition.version,
            analysis: { type: "none", reason: "No grounded revision needed" },
          },
        },
        inputTokens: 500,
        outputTokens: 100,
      }),
    },
    {
      choose: async () => {
        throw Error("LAYA_ABSTAINED");
      },
    },
  );
  expect(result.withheld).toBeGreaterThan(0);
  expect(result.pending).toBe(false);
  expect(result.invalidActions).toBe(0);
  expect(result.scopeViolation).toBe(false);
});
