import { expect, it } from "vitest";
import { createKingdomWorkflow } from "../fixtures/kingdom-feedback-workflow.js";

it("rejects stale, foreign and reserve-breaking proposals without effects and preserves a legal suboptimal strategy", () => {
  const w = createKingdomWorkflow("k", 0, 0);
  const base = {
    kind: "propose",
    bindingId: "k",
    revision: "r1",
    requestId: "owner-k-0",
    offerId: "b",
    gold: "120",
    spendable: "100",
    delivery: "unknown",
  };
  expect(w.validate(base)?.code).toBe("READ_REQUIRED");
  expect(w.validate({ ...base, kind: "read" })).toBeNull();
  w.accept({ ...base, kind: "read" });
  expect(w.validate({ ...base, bindingId: "foreign" })?.code).toBe("BINDING_MISMATCH");
  expect(w.validate({ ...base, revision: "r0" })?.code).toBe("STALE_OBSERVATION");
  expect(w.validate({ ...base, offerId: "c" })?.code).toBe("RESERVE_VIOLATION");
  expect(w.validate({ ...base, offerId: "d" })).toBeNull();
  w.accept({ ...base, offerId: "d" });
  expect(w.validate({ ...base, kind: "answer", offerId: "d" })).toBeNull();
  w.accept({ ...base, kind: "answer", offerId: "d" });
  expect(w.grade()).toMatchObject({
    completed: true,
    factualCorrect: true,
    objectiveCorrect: false,
    invalidEffects: 0,
  });
});
it("keeps unanswered requests pending on initial waits and never treats pending delivery as delivered", () => {
  const w = createKingdomWorkflow("k", 3, 0);
  const base = {
    kind: "wait",
    bindingId: "k",
    revision: "r1",
    requestId: "owner-k-0",
    offerId: "b",
    gold: "120",
    spendable: "100",
    delivery: "pending",
  };
  expect(w.validate(base)?.code).toBe("GOAL_PENDING");
  w.accept({ ...base, kind: "read" });
  expect(w.validate({ ...base, kind: "propose", delivery: "delivered" })?.code).toBe("FACT_MISMATCH");
  expect(w.grade().completed).toBe(false);
});
