import { afterEach, expect, it } from "vitest";
import { evidenceDecisionContract } from "../../src/platform/evidence-decision.js";
import { platformFixture } from "../platform-helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
it("rejects a caller-supplied foreign binding before model reservation", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const evidence = {
    bindingId: "foreign-binding",
    revision: "r",
    choices: ["wait"],
    facts: [{ id: "delivery", state: "unknown" as const }],
    requiredFacts: ["delivery"],
  };
  let calls = 0;
  const h = f.host({
    decide: async () => {
      calls++;
      return { decision: {}, inputTokens: 1, outputTokens: 1 };
    },
  });
  await expect(
    h.admission.decide(claim, {
      ...f.request(),
      schema: evidenceDecisionContract(evidence),
      decisionEvidence: evidence,
    }),
  ).rejects.toThrow("DECISION_BINDING_SCOPE_REQUIRED");
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});

it("settles usage for a rejected evidence answer without dispatching a command or retrying", async () => {
  const { vi } = await import("vitest");
  const { HttpModel } = await import("../../src/model.js");
  const f = await platformFixture();
  close = () => f.pool.end();
  const model = {
    route: "openai-compatible" as const,
    provider: "vllm" as const,
    model: "nemotron-4b",
    thinking: false,
  };
  await f.pool.query("UPDATE cohorts SET model=$2::jsonb WHERE id=$1", [f.group.id, JSON.stringify(model)]);
  await f.enqueue();
  const claim = await f.claim();
  const evidence = {
    bindingId: claim.bindingId,
    revision: "snapshot-owned",
    choices: ["wait"],
    facts: [{ id: "delivery", state: "pending" as const }],
    requiredFacts: ["delivery"],
  };
  const raw = {
    bindingId: claim.bindingId,
    revision: "snapshot-owned",
    choiceId: "wait",
    factIds: ["delivery"],
    summary: "Delivered.",
  };
  const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify(raw) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 123, completion_tokens: 45 },
    }),
  );
  try {
    const h = f.host(new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "synthetic"));
    const result = await h.admission.decide(claim, {
      ...f.request(),
      model,
      schema: evidenceDecisionContract(evidence),
      decisionEvidence: evidence,
    });
    expect(result.decisionError).toBe("DECISION_EVIDENCE_SHAPE");
    expect(result.decision).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
    expect((await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger")).rows).toEqual([
      { status: "reported", input_tokens: "123", output_tokens: "45" },
    ]);
    expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
  } finally {
    network.mockRestore();
  }
});
