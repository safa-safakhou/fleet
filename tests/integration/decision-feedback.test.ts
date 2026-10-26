import { afterEach, expect, it } from "vitest";
import { platformFixture } from "../platform-helpers.js";

let close: (() => Promise<void>) | undefined;
it("settles corrected calls independently after a trusted observation refresh without executing commands", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const h = f.host({
    decide: async (request) => ({
      decision: { cost: request.messages.at(-1)?.content.includes("revision r2") ? 80 : 110 },
      inputTokens: 30,
      outputTokens: 10,
    }),
  });
  const out = await h.admission.decideWithFeedback(claim, f.request(), {
    maxAttempts: 3,
    validate: (v) =>
      (v as { cost: number }).cost > 100
        ? { code: "STALE_OBSERVATION", message: "Refresh before proposing.", retryable: true }
        : null,
    prepareRetry: async (request) => ({
      ...request,
      messages: [...request.messages, { role: "user", content: "Authorized revision r2: spendable 100." }],
    }),
  });
  expect(out.stopReason).toBe("accepted");
  expect(out.metrics).toMatchObject({ attempts: 2, inputTokens: 60, outputTokens: 20 });
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
  ]);
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
});
afterEach(async () => {
  await close?.();
  close = undefined;
});
it("accounts both completed proposals and delivers semantic feedback before accepting a correction", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  let calls = 0;
  const h = f.host({
    decide: async (request) => {
      calls++;
      const corrected = request.messages.at(-1)?.content.includes("spendable 100") ?? false;
      return { decision: { cost: corrected ? 80 : 110 }, inputTokens: 30, outputTokens: 10 };
    },
  });
  const outcome = await h.admission.decideWithFeedback(
    claim,
    {
      ...f.request(),
      schema: { type: "object", required: ["cost"], properties: { cost: { type: "integer" } } },
    },
    {
      maxAttempts: 3,
      validate: (value) =>
        (value as { cost: number }).cost > 100
          ? { code: "RESERVE_VIOLATION", message: "Maximum spendable 100. No command executed.", retryable: true }
          : null,
    },
  );
  expect(outcome.stopReason).toBe("accepted");
  expect(outcome.metrics).toMatchObject({ attempts: 2, recovered: true, inputTokens: 60, outputTokens: 20 });
  expect(calls).toBe(2);
  expect(
    (await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger ORDER BY created_at")).rows,
  ).toEqual([
    { status: "reported", input_tokens: "30", output_tokens: "10" },
    { status: "reported", input_tokens: "30", output_tokens: "10" },
  ]);
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
});
it("cannot bypass the binding scope fence through the correction entry point", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const h = f.host({
    decide: async () => {
      throw Error("not allowed");
    },
  });
  await expect(
    h.admission.decideWithFeedback(
      claim,
      {
        ...f.request(),
        decisionEvidence: {
          bindingId: "foreign",
          revision: "r",
          choices: ["wait"],
          facts: [{ id: "x", state: "unknown" }],
          requiredFacts: [],
        },
      },
      { maxAttempts: 3, validate: () => null },
    ),
  ).rejects.toThrow("DECISION_BINDING_SCOPE_REQUIRED");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
it("stops correction at the existing per-turn ledger limit rather than expanding its allowance", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.pool.query("UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}','1'::jsonb) WHERE id=$1", [
    f.group.id,
  ]);
  await f.enqueue();
  const claim = await f.claim();
  const h = f.host({ decide: async () => ({ decision: { cost: 110 }, inputTokens: 30, outputTokens: 10 }) });
  const out = await h.admission.decideWithFeedback(claim, f.request(), {
    maxAttempts: 3,
    validate: () => ({ code: "RESERVE_VIOLATION", message: "Preserve reserve.", retryable: true }),
  });
  expect(out.stopReason).toBe("budget_limit");
  expect(out.metrics.attempts).toBe(1);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
});
it("retains unknown usage and never launches a correction after an unmeasured execution", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const h = f.host({ decide: async () => ({ decision: { cost: 110 }, inputTokens: null, outputTokens: null }) });
  const out = await h.admission.decideWithFeedback(claim, f.request(), { maxAttempts: 3, validate: () => null });
  expect(out.stopReason).toBe("attempt_error");
  expect(out.error).toBe("USAGE_UNKNOWN");
  expect(out.metrics.attempts).toBe(1);
  expect((await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger")).rows).toEqual([
    { status: "unknown", input_tokens: null, output_tokens: null },
  ]);
});
