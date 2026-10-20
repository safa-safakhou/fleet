import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { FleetError, object } from "../../src/domain.js";
import { ContinuityEngine } from "../../src/engines/continuity/engine.js";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { expandFactTables } from "../../src/fact-table.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";
import { reactiveProbe } from "../reactive-probe-context.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/production-largest-cognition.json", "utf8"));
for (const cognition of [false, true])
  it(`delivers current whole facts and a peer within the real packet allowance, cognition=${cognition}`, async () => {
    let requests = 0;
    const ctx = reactiveProbe(async (_claim, input) => {
      requests++;
      expect(
        Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
      ).toBeLessThanOrEqual(24000);
      const packet = JSON.parse(input.messages[1].content);
      const env = object(expandFactTables(packet.observation.payload.environment));
      for (const key of [
        "profile",
        "ambition",
        "balances",
        "buildings",
        "builders",
        "nextUpgradeChecks",
        "authority",
        "mandate",
      ])
        expect(env[key], key).toEqual(fixture.environment[key]);
      expect(object(env.publicDiscovery).players).not.toHaveLength(0);
      if (cognition) expect(packet.observation.continuity).toBeUndefined();
      return {
        decision: cognition
          ? { decision: { kind: "wait", summary: "Read current facts" } }
          : { kind: "wait", summary: "Read current facts" },
        inputTokens: 500,
        outputTokens: 50,
      };
    });
    ctx.observation.payload = { environment: structuredClone(fixture.environment) };
    ctx.packObservation = (o, limit) => ({
      ...o,
      payload: { environment: compactEnvironment(object(o.payload.environment), limit - 1000) },
    });
    if (cognition)
      ctx.observation.continuity = {
        schemaVersion: "fleet.continuity-observation.v1",
        self: { capabilities: [], needs: { duplicated: "x".repeat(30000) }, dependencies: {}, ownerValues: {} },
        facts: [],
      };
    const engine = cognition
      ? new ContinuityEngine({
          context: async () => ({
            version: 0,
            self: { needs: {}, dependencies: {} },
            evidence: [],
            memories: [],
            beliefs: [],
            predictions: [],
            reflections: [],
            plan: null,
          }),
          restrict: () => {},
        } as never)
      : new ReactiveEngine();
    await engine.run(ctx);
    expect(requests).toBe(1);
    expect(ctx.observation.payload.environment).toEqual(fixture.environment);
  });
it("refuses an undeliverable whole core before invoking a model, rather than deleting state", async () => {
  let called = false;
  const ctx = reactiveProbe(async () => {
    called = true;
    throw Error("unexpected");
  });
  ctx.observation.payload = { world: { required: "x".repeat(40000) }, guide: { text: "small" } };
  ctx.packObservation = () => {
    throw Error("CONTEXT_LIMIT");
  };
  await expect(new ReactiveEngine().run(ctx)).rejects.toThrow("CONTEXT_LIMIT");
  expect(called).toBe(false);
});
it.each([false, true])("uses the actual remaining envelope for a core above half, cognition=%s", async (cognition) => {
  let calls = 0;
  const current = { ownership: "whole current authority ".repeat(1200), optionalHistory: "x".repeat(50000) };
  const ctx = reactiveProbe(async (_claim, input) => {
    calls++;
    expect(
      Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
    ).toBeLessThanOrEqual(48000);
    const packet = JSON.parse(input.messages[1].content);
    expect(packet.observation.payload.ownership).toBe(current.ownership);
    if (calls === 2) expect(packet.previousDecision.code).toBe("FACTUAL_WAIT_REJECTED");
    return {
      decision: cognition
        ? { decision: { kind: "wait", summary: "Current resource shortage" } }
        : { kind: "wait", summary: "Current resource shortage" },
      inputTokens: 1,
      outputTokens: 1,
    };
  });
  const budget = ctx.claim.turn.cohort.budget;
  if (!budget) throw Error("Fixture budget required");
  budget.inputByteLimit = 48000;
  ctx.observation.payload = current;
  ctx.observation.continuity = {} as never;
  ctx.packObservation = (o, limit) => {
    const packed = { ...o, payload: { ownership: o.payload.ownership }, coverage: { omitted: ["optionalHistory"] } };
    if (Buffer.byteLength(JSON.stringify(packed)) > limit) throw new FleetError("CONTEXT_LIMIT", true);
    return packed;
  };
  ctx.validateWait = async () =>
    calls === 1
      ? {
          valid: false,
          code: "FACTUAL_WAIT_REJECTED",
          guidance: "Reconcile the actual resource shortage with current facts. ".repeat(15),
        }
      : { valid: true, code: "VALID" };
  const engine = cognition
    ? new ContinuityEngine({
        context: async () => ({
          version: 0,
          self: {},
          evidence: [],
          memories: [],
          beliefs: [],
          predictions: [],
          reflections: [],
          plan: null,
        }),
        restrict: () => {},
      } as never)
    : new ReactiveEngine();
  await engine.run(ctx);
  expect(calls).toBe(2);
  expect(ctx.observation.payload).toEqual(current);
});
it("reduces optional continuity records further when they crowd out an otherwise deliverable current core", async () => {
  // Leave room for the whole core but force optional-page pressure even when
  // system guidance becomes shorter. The test must exercise reduction, not prose length.
  const whole = "current owned resources and permission ".repeat(900);
  let requests = 0;
  const ctx = reactiveProbe(async (_claim, input) => {
    requests++;
    const packet = JSON.parse(input.messages[1].content);
    expect(packet.observation.payload.whole).toBe(whole);
    expect(packet.continuity.self.needs.feasibility.length).toBeLessThan(3);
    expect(packet.continuity.coverage.budgetOmittedPaths).toContain("self.needs.feasibility");
    expect(
      Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
    ).toBeLessThanOrEqual(48000);
    return {
      decision: { decision: { kind: "wait", summary: "A factual resource wait" } },
      inputTokens: 1,
      outputTokens: 1,
    };
  });
  const budget = ctx.claim.turn.cohort.budget;
  if (!budget) throw Error("Fixture budget required");
  budget.inputByteLimit = 48000;
  ctx.observation.continuity = {} as never;
  ctx.observation.payload = { whole, history: "x".repeat(50000) };
  ctx.packObservation = (o, limit) => {
    const packed = { ...o, payload: { whole: o.payload.whole }, coverage: { omitted: ["history"] } };
    if (Buffer.byteLength(JSON.stringify(packed)) > limit) throw new FleetError("CONTEXT_LIMIT", true);
    return packed;
  };
  await new ContinuityEngine({
    context: async () => ({
      version: 0,
      self: { needs: { feasibility: Array.from({ length: 3 }, () => ({ value: "f".repeat(5000) })) } },
      evidence: [],
      memories: [],
      beliefs: [],
      predictions: [],
      reflections: [],
      plan: null,
    }),
    restrict: () => {},
  } as never).run(ctx);
  expect(requests).toBe(1);
});
