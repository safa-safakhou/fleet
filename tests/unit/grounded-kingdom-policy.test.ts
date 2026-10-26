import { expect, it } from "vitest";
import { createGroundedKingdomPolicy } from "../../scripts/lib/grounded-kingdom-policy.js";
import { createKingdomWorkflow } from "../fixtures/kingdom-feedback-workflow.js";

const none = { facts: false, legal: false, refresh: false, objective: false };
const base = {
  kind: "propose",
  bindingId: "k",
  requestId: "owner-k-0",
  revision: "r1",
  offerId: "b",
  gold: "120",
  spendable: "100",
  delivery: "unknown",
};
const observed = (env: ReturnType<typeof createKingdomWorkflow>) => env.accept({ ...base, kind: "read" });
it("tests fact binding alone: the model supplies a reference while accepted facts come from the observed snapshot", () => {
  const env = createKingdomWorkflow("k", 0, 0),
    p = createGroundedKingdomPolicy(env, { ...none, facts: true });
  p.observe(observed(env));
  const { gold, spendable, delivery, ...reference } = base;
  expect(p.schema().required).not.toContain("gold");
  expect(p.validate(reference)).toBeNull();
  expect(p.resolve(reference)).toMatchObject({ gold: "120", spendable: "100", delivery: "unknown" });
  expect(p.validate({ ...reference, gold: "999" })?.code).toBe("MODEL_AUTHORED_BOUND_FACT");
});
it("tests legal choices alone: no affordable offers exposes only none, not the maximum-scoring strategy", () => {
  const env = createKingdomWorkflow("k", 6, 0),
    p = createGroundedKingdomPolicy(env, { ...none, legal: true });
  p.observe(observed(env));
  expect(p.schema().properties.offerId.enum).toEqual(["none"]);
  const normal = createKingdomWorkflow("k", 0, 0),
    q = createGroundedKingdomPolicy(normal, { ...none, legal: true });
  q.observe(observed(normal));
  expect(q.schema().properties.offerId.enum).toEqual(["b", "d", "none"]);
  expect(q.validate({ ...base, offerId: "d" })).toBeNull();
});
it("tests refresh alone: an authorized read obtains new facts while old historical context remains available", () => {
  const env = createKingdomWorkflow("k", 4, 0),
    p = createGroundedKingdomPolicy(env, { ...none, refresh: true });
  p.observe(observed(env));
  env.advanceAfterRead();
  const failure = p.validate(base);
  expect(failure?.code).toBe("STALE_OBSERVATION");
  if (!failure) throw Error("Expected a stale-observation rejection");
  const fresh = p.refresh(failure);
  expect(fresh).toMatchObject({ revision: "r2", gold: "95", spendable: "75" });
  expect(p.validate({ ...base, revision: "r2", gold: "95", spendable: "75", offerId: "d" })).toBeNull();
  expect(env.grade().reads).toBe(2);
});
it("tests objective feedback alone: legal suboptimal choices are rejected with precise numeric feedback", () => {
  const env = createKingdomWorkflow("k", 0, 1),
    p = createGroundedKingdomPolicy(env, { ...none, objective: true });
  const state = env.accept({ kind: "read" });
  p.observe(state);
  expect(p.validate({ ...base, requestId: "owner-k-1", gold: "135", spendable: "115" })?.code).toBe(
    "OBJECTIVE_NOT_MET",
  );
  expect(p.validate({ ...base, requestId: "owner-k-1", gold: "135", spendable: "115", offerId: "c" })).toBeNull();
});
