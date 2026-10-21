import { afterEach, expect, it, vi } from "vitest";
import { profileRequirements, qualifyProfile } from "../../src/qualification.js";
import { runtime } from "../../src/runtime.js";
import { boardEnvironment } from "../fixtures/environments/board.js";
import { CoordinationBoard } from "../fixtures/environments/coordination-board.js";
import { evidence } from "../fixtures/profile-evidence.js";
import { key, testUrl } from "../helpers.js";

afterEach(() => vi.unstubAllEnvs());
function compose(events = false, outlook = false) {
  for (const [k, v] of Object.entries({
    DATABASE_URL: testUrl,
    FLEET_OPERATOR_SECRET: "fixture-only",
    FLEET_VAULT_KEY: key,
    FLEET_GAME_BASE_URL: "http://127.0.0.1:1",
    FLEET_ALLOW_HTTP: "1",
    FLEET_LIVE_ENABLED: "0",
    FLEET_PACT_EVENT_FEED_VERSION: events ? "pact.agent-events.v1" : undefined,
    FLEET_PACT_OUTLOOK_VERSION: outlook ? "pact.agent-outlook.v1" : undefined,
  }))
    vi.stubEnv(k, v);
  return runtime();
}
it.each([
  [false, false],
  [true, false],
  [true, true],
])("accepts only advertised PACT profile capabilities: events=%s outlook=%s", async (events, outlook) => {
  const r = compose(events, outlook);
  try {
    expect(r.settings.liveAllowed).toBe(false);
    const adapter = r.environments.resolve(r.settings.environment);
    expect(r.engines.list().map((e) => e.ref)).toEqual(r.architectures.list().map((m) => m.ref));
    expect(new Set(r.engines.list().map((e) => e.ref.id)).size).toBe(6);
    for (const engine of r.engines.list()) {
      expect(profileRequirements(engine.ref)).toEqual({
        capabilities: engine.requiredCapabilities,
        ...(engine.requiredSchemas ? { schemas: engine.requiredSchemas } : {}),
      });
      const q = qualifyProfile(engine.ref, adapter, [evidence(adapter, engine.ref)]);
      const expected =
        engine.ref.id.startsWith("legacy-") ||
        (engine.ref.id === "reactive-basic" && events) ||
        (engine.ref.id === "reactive-cognition" && events && outlook);
      expect(q.offlinePassed).toBe(expected);
      expect(q.liveQualified).toBe(false);
    }
  } finally {
    await r.pool.end();
  }
});
it("supports generic reactive/cognition/coordinator evidence on the synthetic board without PACT identities", () => {
  const board = boardEnvironment();
  new CoordinationBoard(board.adapter, () => new Date("2026-10-17T12:00:00Z"));
  for (const id of ["reactive-basic", "reactive-cognition", "specialist-coordinator"]) {
    const p = { id, version: "1" },
      q = qualifyProfile(p, board.adapter, [evidence(board.adapter, p)]);
    expect(q.offlinePassed).toBe(true);
    expect(q.liveQualified).toBe(false);
  }
  expect(qualifyProfile({ id: "legacy-loop", version: "1" }, board.adapter, []).offlinePassed).toBe(false);
  expect(board.connections).toBe(0);
  expect(board.executions).toBe(0);
});
