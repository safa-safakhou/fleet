import { expect, it } from "vitest";
import { validateClaims } from "../../src/modules/action-admission/v1/claims.js";
import { ActionEffectsSchema, actionIntentDigest } from "../../src/platform/action-effects.js";

const effects = {
  schemaVersion: "fleet.action-effects.v1",
  revision: "revision:1",
  intentDigest: "0".repeat(64),
  actionKey: "board.move.v1",
  claims: [
    { kind: "resource", schemaId: "board.tokens.v1", key: "stock", units: "6" },
    { kind: "authority", schemaId: "board.quota.v1", key: "moves", units: "1" },
  ],
  capacities: [
    { schemaId: "board.tokens.v1", key: "stock", remainingUnits: "10" },
    { schemaId: "board.quota.v1", key: "moves", remainingUnits: "2" },
  ],
  sourceRefs: ["board:1"],
  validUntil: { clockId: "utc", value: "2026-10-11T12:01:00Z" },
  coverage: { complete: true, omitted: [] },
  supported: true,
};
it("rejects jointly excessive spends with exact integer arithmetic", () => {
  const quote = ActionEffectsSchema.parse(effects);
  expect(validateClaims(quote, [])).toEqual([]);
  expect(validateClaims(quote, [quote.claims])).toContain("RESOURCE_CLAIM_CONFLICT");
  expect(
    validateClaims(
      ActionEffectsSchema.parse({
        ...effects,
        claims: [{ ...effects.claims[0], units: "9007199254740993" }],
        capacities: [{ ...effects.capacities[0], remainingUnits: "9007199254740992" }],
      }),
      [],
    ),
  ).toContain("RESOURCE_CLAIM_CONFLICT");
});
it("rejects incomplete coverage, missing capacities, duplicate capacities and conflicting promises", () => {
  expect(
    validateClaims(
      ActionEffectsSchema.parse({ ...effects, coverage: { complete: false, omitted: ["authority"] } }),
      [],
    ),
  ).toContain("INCOMPLETE_ACTION_EFFECTS");
  expect(validateClaims(ActionEffectsSchema.parse({ ...effects, capacities: [] }), [])).toContain(
    "MISSING_CLAIM_CAPACITY",
  );
  expect(
    validateClaims(
      ActionEffectsSchema.parse({ ...effects, capacities: [...effects.capacities, effects.capacities[0]] }),
      [],
    ),
  ).toContain("DUPLICATE_CLAIM_CAPACITY");
  const promise = { kind: "promise" as const, schemaId: "board.promise.v1", key: "square", value: "a2" };
  expect(
    validateClaims(ActionEffectsSchema.parse({ ...effects, claims: [promise] }), [[{ ...promise, value: "b2" }]]),
  ).toContain("PROMISE_CLAIM_CONFLICT");
});
it("binds effects to exact commands and rejects invalid integer encodings", () => {
  const intent = {
    commandId: "command",
    bindingId: "binding",
    schemaId: "board.move.v1",
    payload: { to: "a2", note: "safe" },
  };
  expect(actionIntentDigest(intent)).toBe(actionIntentDigest({ ...intent, payload: { note: "safe", to: "a2" } }));
  expect(actionIntentDigest(intent)).not.toBe(actionIntentDigest({ ...intent, payload: { to: "a3" } }));
  expect(ActionEffectsSchema.safeParse({ ...effects, claims: [{ ...effects.claims[0], units: "1.5" }] }).success).toBe(
    false,
  );
});
