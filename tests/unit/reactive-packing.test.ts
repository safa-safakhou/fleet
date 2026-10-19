import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
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
