import { expect, it } from "vitest";
import { executeKingdomWorkflow } from "../../scripts/lib/feedback-workflow.js";
import { allKingdomRepairs, noKingdomRepairs } from "../../scripts/lib/grounded-kingdom-policy.js";

const model = { route: "openai-compatible" as const, provider: "vllm" as const, model: "nemotron-4b", thinking: false };
it("combines all repairs without a model-authored balance and refreshes stale facts with no extra model read", async () => {
  let n = 0;
  const out = await executeKingdomWorkflow({
    id: "combined",
    bindingId: "k",
    variant: 4,
    round: 0,
    repairs: allKingdomRepairs,
    model,
    signal: new AbortController().signal,
    queueDelayMs: 0,
    attempt: async (request) => {
      n++;
      if (n === 3) {
        expect(request.schema).toHaveProperty("properties.revision.const", "r2");
        expect(request.schema).toHaveProperty("properties.offerId.enum", ["d", "none"]);
      }
      return {
        decision: {
          kind: n === 1 ? "read" : n === 4 ? "answer" : "propose",
          bindingId: "k",
          requestId: "owner-k-0",
          revision: n >= 3 ? "r2" : "r1",
          offerId: n === 1 ? "none" : n >= 3 ? "d" : "b",
        },
        inputTokens: 20,
        outputTokens: 10,
      };
    },
  });
  expect(out.row).toMatchObject({
    completed: true,
    factualCorrect: true,
    objectiveCorrect: true,
    recovered: true,
    attempts: 4,
    rejectedValidProposals: 0,
  });
  expect(out).toMatchObject({ hostRefreshes: 1, grade: { reads: 2, actualOffer: "d" } });
  expect(out.transcript.filter((t) => (t as { kind: string }).kind === "host_resolved_facts")).toHaveLength(2);
});
it("accepts no deal when no paid option is legal with all repairs enabled", async () => {
  let n = 0;
  const out = await executeKingdomWorkflow({
    id: "none",
    bindingId: "k",
    variant: 6,
    round: 0,
    repairs: allKingdomRepairs,
    model,
    signal: new AbortController().signal,
    queueDelayMs: 0,
    attempt: async (request) => {
      n++;
      expect(request.schema).toHaveProperty("properties.offerId.enum", ["none"]);
      return {
        decision: {
          kind: n === 1 ? "read" : n === 3 ? "answer" : "propose",
          bindingId: "k",
          requestId: "owner-k-0",
          revision: "r1",
          offerId: "none",
        },
        inputTokens: 20,
        outputTokens: 10,
      };
    },
  });
  expect(out.grade).toMatchObject({
    completed: true,
    factualCorrect: true,
    objectiveCorrect: true,
    actualOffer: "none",
  });
});
it("feeds back an explicit objective failure without counting it as a false legal rejection", async () => {
  let n = 0;
  const out = await executeKingdomWorkflow({
    id: "objective",
    bindingId: "k",
    variant: 0,
    round: 1,
    repairs: { ...noKingdomRepairs, objective: true },
    model,
    signal: new AbortController().signal,
    queueDelayMs: 0,
    attempt: async () => {
      n++;
      return {
        decision: {
          kind: n === 1 ? "read" : n === 4 ? "answer" : "propose",
          bindingId: "k",
          requestId: "owner-k-1",
          revision: "r1",
          offerId: n >= 3 ? "c" : "b",
          gold: "135",
          spendable: "115",
          delivery: "unknown",
        },
        inputTokens: 20,
        outputTokens: 10,
      };
    },
  });
  expect(out.errors).toEqual(["OBJECTIVE_NOT_MET"]);
  expect(out.row).toMatchObject({
    completed: true,
    objectiveCorrect: true,
    recovered: true,
    rejectedValidProposals: 0,
  });
});
it("recovers from a stale observation by rereading rather than merely relabelling the old facts", async () => {
  let n = 0;
  const out = await executeKingdomWorkflow({
    id: "stale",
    bindingId: "k",
    variant: 4,
    round: 0,
    model,
    signal: new AbortController().signal,
    queueDelayMs: 0,
    attempt: async () => {
      n++;
      const fresh = n >= 3;
      return {
        decision: {
          kind: n === 1 || n === 3 ? "read" : n === 5 ? "answer" : "propose",
          bindingId: "k",
          requestId: "owner-k-0",
          revision: fresh ? "r2" : "r1",
          gold: fresh ? "95" : "120",
          spendable: fresh ? "75" : "100",
          delivery: "unknown",
          offerId: fresh ? "d" : "b",
        },
        inputTokens: 20,
        outputTokens: 10,
      };
    },
  });
  expect(out.row).toMatchObject({
    completed: true,
    recovered: true,
    attempts: 5,
    corrections: 1,
    rejectedProposals: 1,
    factualCorrect: true,
    objectiveCorrect: true,
  });
  expect(out.grade).toMatchObject({ reads: 2, actualOffer: "d" });
});
it("finishes read→bad proposal→feedback→correct proposal→answer while preserving context", async () => {
  let n = 0;
  const out = await executeKingdomWorkflow({
    id: "task",
    bindingId: "k",
    variant: 0,
    round: 0,
    model,
    signal: new AbortController().signal,
    queueDelayMs: 7,
    attempt: async (request) => {
      n++;
      const last = request.messages.at(-1)?.content ?? "";
      const base = {
        bindingId: "k",
        requestId: "owner-k-0",
        revision: "r1",
        gold: "120",
        spendable: "100",
        delivery: "unknown",
      };
      return {
        decision: { ...base, kind: n === 1 ? "read" : n === 4 ? "answer" : "propose", offerId: n === 2 ? "c" : "b" },
        inputTokens: 20,
        outputTokens: 10,
        ...(n === 3 && !last.includes("spendable 100") ? { decisionError: "FEEDBACK_MISSING" } : {}),
      };
    },
  });
  expect(out.row).toMatchObject({
    completed: true,
    factualCorrect: true,
    objectiveCorrect: true,
    firstAttemptCorrect: false,
    recovered: true,
    attempts: 4,
    corrections: 1,
    rejectedProposals: 1,
    rejectedValidProposals: 0,
    inputTokens: 80,
    outputTokens: 40,
    queueDelayMs: 7,
  });
  expect(out.grade.actualOffer).toBe("b");
  expect(out.stopReason).toBe("completed");
});
it("does not disguise an unchanged rejected proposal as completed work", async () => {
  const out = await executeKingdomWorkflow({
    id: "stuck",
    bindingId: "k",
    variant: 0,
    round: 0,
    model,
    signal: new AbortController().signal,
    queueDelayMs: 0,
    attempt: async () => ({
      decision: {
        kind: "wait",
        bindingId: "k",
        requestId: "owner-k-0",
        revision: "r1",
        gold: "120",
        spendable: "100",
        delivery: "unknown",
        offerId: "b",
      },
      inputTokens: 20,
      outputTokens: 10,
    }),
  });
  expect(out.row).toMatchObject({ completed: false, repeatedFailures: 1, attempts: 2 });
  expect(out.stopReason).toBe("repeated_failure");
});
