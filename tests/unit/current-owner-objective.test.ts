import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { reactiveProbe } from "../reactive-probe-context.js";
import { decisionProbe } from "../scoped-probe.js";

it("presents the actual current owner goal as the assignment and refreshes it after a scoped read", async () => {
  let calls = 0;
  const ctx = reactiveProbe(async (_claim, input) => {
    calls++;
    const current = calls === 1 ? "Develop reliable grain supply" : "Prioritize economic resilience";
    expect(input.messages[0].content).toContain(current);
    expect(JSON.parse(input.messages[1].content).goal).toBe(current);
    if (calls === 2) expect(input.messages[0].content).not.toContain("Develop reliable grain supply");
    return {
      decision:
        calls === 1
          ? { kind: "read", query: {}, summary: "Refresh the current assignment" }
          : { kind: "wait", summary: "Review current constraints" },
      inputTokens: 10,
      outputTokens: 2,
    };
  });
  ctx.observation.payload = { owner: { objective: "Develop reliable grain supply" } };
  ctx.accountObjective = (o) => String(object(o.payload.owner).objective);
  ctx.observe = async () => ({
    ...ctx.observation,
    payload: { owner: { objective: "Prioritize economic resilience" } },
  });
  await new ReactiveEngine().run(decisionProbe(ctx));
  expect(calls).toBe(2);
});
