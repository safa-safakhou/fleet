import { expect, test } from "vitest";
import { packPactObservation } from "../../src/games/pact/packing.js";
import type { Observation } from "../../src/platform/contracts.js";
import { fitObservedRequest } from "../../src/research/context/observed.js";
import { canonical } from "../../src/research/contracts.js";

function fixture() {
  const observation: Observation = {
    schemaId: "pact.observation.v1",
    revision: "synthetic:1",
    observedAt: "2026-11-02T10:00:00.000Z",
    environmentTime: { clockId: "pact.game-time-ms", value: "1000" },
    sourceRefs: ["synthetic:source"],
    payload: {
      world: {
        paused: false,
        profile: { accountId: "synthetic-owner" },
        authority: { allowedActions: ["world.read"], resources: { iron: "0" } },
        balances: { iron: { ordinaryUnits: "9007199254740993600" } },
      },
      guide: { developmentRules: { guidance: 'Synthetic "rule" 木材\\path. '.repeat(1800) } },
    },
    coverage: { authorizedView: true },
  };
  const request = {
    messages: [
      { role: "system" as const, content: "Preserve owner authority and exact facts." },
      { role: "user" as const, content: JSON.stringify(observation) },
    ],
    schema: { type: "object", description: 'JSON "escaping" 木' },
    maxOutputTokens: 512,
    purpose: "decision" as const,
  };
  return {
    observation,
    request,
    limits: { maxBytes: 24000, maxTokens: 6000, nowMs: Date.parse(observation.observedAt), maxObservationAgeMs: 5000 },
  };
}
test("large authorized PACT view fits the entire UTF8 envelope without mutating raw facts or instructions", () => {
  const f = fixture(),
    before = canonical(f.observation);
  expect(Buffer.byteLength(canonical(f.request))).toBeGreaterThan(24000);
  const fitted = fitObservedRequest(f.request, f.observation, packPactObservation, f.limits);
  expect(Buffer.byteLength(canonical(fitted.request))).toBeLessThanOrEqual(24000);
  expect(fitted.request.messages[0]).toEqual(f.request.messages[0]);
  expect(fitted.request.schema).toEqual(f.request.schema);
  expect(fitted.request.maxOutputTokens).toBe(512);
  expect(canonical(fitted.request)).toContain("9007199254740993600");
  expect(fitted.view!.sourceRefs).toEqual(f.observation.sourceRefs);
  expect(fitted.view!.environmentTime).toEqual(f.observation.environmentTime);
  expect(canonical(f.observation)).toBe(before);
});
test("fitting requests preserve exact bytes and never invoke the packer", () => {
  const f = fixture();
  f.request.messages[1].content = "Small request";
  const out = fitObservedRequest(
    f.request,
    f.observation,
    () => {
      throw Error("unexpected packing");
    },
    f.limits,
  );
  expect(out.request).toBe(f.request);
  expect(out.changed).toEqual([]);
});
test("unrecognized or edited observation messages cannot be truncated to gain admission", () => {
  const f = fixture();
  f.request.messages[1].content = JSON.stringify({ ...f.observation, revision: "worker-invented" });
  expect(() => fitObservedRequest(f.request, f.observation, packPactObservation, f.limits)).toThrow(
    "MODEL_REQUEST_NOT_ADMITTED",
  );
});
test("oversized owner instructions remain mandatory and refuse rather than being truncated", () => {
  const f = fixture();
  f.request.messages[0].content = "Owner instruction. ".repeat(2000);
  expect(() => fitObservedRequest(f.request, f.observation, packPactObservation, f.limits)).toThrow();
  expect(f.request.messages[0].content).toBe("Owner instruction. ".repeat(2000));
});
test("protected facts that cannot fit refuse without dropping stock or authority", () => {
  const f = fixture();
  f.observation.payload.world = {
    balances: Object.fromEntries(
      Array.from({ length: 800 }, (_, i) => ["asset" + i, { ordinaryUnits: `${i}` + "9".repeat(100) }]),
    ),
  };
  f.request.messages[1].content = JSON.stringify(f.observation);
  expect(() => fitObservedRequest(f.request, f.observation, packPactObservation, f.limits)).toThrow("CONTEXT_LIMIT");
});
test("packing cannot change identity, revision, source references or clock", () => {
  const f = fixture();
  expect(() =>
    fitObservedRequest(f.request, f.observation, (o) => ({ ...o, sourceRefs: ["invented"] }), f.limits),
  ).toThrow("CONTEXT_INPUT_MISMATCH");
});
test("domain-view normalization never turns invalid numeric facts into null", () => {
  const f = fixture();
  expect(() =>
    fitObservedRequest(f.request, f.observation, (o) => ({ ...o, payload: { stock: Number.NaN } }), f.limits),
  ).toThrow("NON_JSON_VALUE");
});

test.each(["invalid", "2026-11-02T09:59:54.999Z", "2026-11-02T10:00:00.001Z"])(
  "stale, invalid and future observations refuse before packing: %s",
  (observedAt) => {
    const f = fixture();
    f.observation.observedAt = observedAt;
    f.request.messages[1].content = JSON.stringify(f.observation);
    expect(() =>
      fitObservedRequest(
        f.request,
        f.observation,
        () => {
          throw Error("must not pack");
        },
        f.limits,
      ),
    ).toThrow("OBSERVATION_STALE");
  },
);
