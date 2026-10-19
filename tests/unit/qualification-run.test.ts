import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareQualification, qualificationDatabase } from "../../src/qualification-run.js";

const now = Date.now();
function plan() {
  return {
    schemaVersion: "fleet.local-qualification.v1",
    id: randomUUID(),
    authorizationRef: `test:${randomUUID()}`,
    approved: true,
    fleetCommit: "a".repeat(40),
    modelDigest: "6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197",
    model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: true },
    endpoint: "http://127.0.0.1:11434",
    helperEndpoint: "http://127.0.0.1:8832",
    startsAt: new Date(now - 1000).toISOString(),
    deadlineAt: new Date(now + 254 * 60000).toISOString(),
    scope: "synthetic_fixtures_only",
    executionLimit: 104,
    tokenLimit: 4160000,
    helperLimit: 48,
  };
}
it("requires exact approval, model, local endpoints and fixed parent allowance", () => {
  const p = plan();
  expect(prepareQualification(p).digest).toMatch(/^[a-f0-9]{64}$/);
  for (const patch of [
    { approved: false },
    { scope: "live" },
    { executionLimit: 105 },
    { tokenLimit: 4160001 },
    { modelDigest: "b".repeat(64) },
    { endpoint: "https://example.com" },
    { endpoint: "http://127.0.0.1:8820" },
    { helperLimit: 49 },
    { model: { ...p.model, model: "other" } },
  ])
    expect(() => prepareQualification({ ...p, ...patch })).toThrow();
  expect(prepareQualification(p).digest).not.toBe(prepareQualification({ ...p, fleetCommit: "b".repeat(40) }).digest);
});
it("cannot point qualification SQL at installed or shared test data", () => {
  expect(() => qualificationDatabase("postgres://u:p@127.0.0.1:5439/fleet_qualification")).toThrow();
  expect(() => qualificationDatabase("postgres://u:p@127.0.0.1:5436/fleet_test")).toThrow();
  expect(() => qualificationDatabase("postgres://u:p@example.com:5436/fleet_qualification")).toThrow();
  expect(qualificationDatabase("postgres://u:p@127.0.0.1:5436/fleet_qualification")).toContain("5436");
});

it("pins thinking and non-thinking qualification as distinct explicit configurations", () => {
  const on = prepareQualification(plan()),
    off = prepareQualification({ ...plan(), model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: false } });
  expect(off.plan.model.thinking).toBe(false);
  expect(off.digest).not.toBe(on.digest);
  expect(() => prepareQualification({ ...plan(), model: { route: "ollama", model: "nemotron-3-nano:4b" } })).toThrow();
});
