import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { pactActionContracts, validatePactProposal } from "../../src/games/pact/proposals.js";

it("advertises exact common payloads with the fresh optional mandate, retaining other conditional kinds", () => {
  const schema = pactActionContracts({ guide: { mandate: { version: 7 } } })[0].payloadSchema;
  const check = new Ajv({ strict: false, validateFormats: false }).compile(schema);
  const action = { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 };
  expect(check(action)).toBe(true);
  expect(check({ ...action, mandateVersion: 7 })).toBe(true);
  expect(check({ ...action, mandateVersion: 9007199254740991 })).toBe(false);
  expect(check({ action })).toBe(false);
  expect(check({ ...action, extra: true })).toBe(false);
  const unknownVersion = new Ajv({ strict: false, validateFormats: false }).compile(
    pactActionContracts({})[0].payloadSchema,
  );
  expect(unknownVersion(action)).toBe(true);
  expect(unknownVersion({ ...action, mandateVersion: 7 })).toBe(false);
});

it("rejects the two archived malformed payloads while preserving a legitimate action", () => {
  for (const payload of [
    { commandId: "stale-receipt-repair", action: { fix: true } },
    { commandId: "scarcity-trade:decline", action: "decline" },
  ])
    expect(validatePactProposal(payload, {}).valid).toBe(false);
  expect(
    validatePactProposal({ kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 }, {}).valid,
  ).toBe(true);
});

it("constrains generation to the observed free queue slot and excludes already busy building kinds", () => {
  const facts = {
    world: {
      builders: [
        { slot: 1, state: "waiting", kind: "hall", targetLevel: 2 },
        { slot: 2, state: null },
      ],
    },
  };
  const check = new Ajv({ strict: false, validateFormats: false }).compile(pactActionContracts(facts)[0].payloadSchema);
  const farm = { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 2 };
  expect(check(farm)).toBe(true);
  expect(check({ ...farm, slot: 1 })).toBe(false);
  expect(check({ ...farm, building: "hall" })).toBe(false);
  // An active worker can accept a waiting item in that slot; only an existing waiting item blocks it.
  const active = new Ajv({ strict: false, validateFormats: false }).compile(
    pactActionContracts({ world: { builders: [{ slot: 1, state: "active", kind: "barracks", targetLevel: 2 }] } })[0]
      .payloadSchema,
  );
  expect(active({ ...farm, slot: 1 })).toBe(true);
  expect(active({ ...farm, building: "barracks" })).toBe(false);
});

it("removes building generation when both waiting slots are occupied, without inventing availability for missing observations", () => {
  const compile = (facts: Record<string, unknown>) =>
    new Ajv({ strict: false, validateFormats: false }).compile(pactActionContracts(facts)[0].payloadSchema);
  const farm = { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 2 };
  const full = compile({
    world: {
      builders: [
        { slot: 1, state: "waiting", kind: "hall" },
        { slot: 2, state: "waiting", kind: "market" },
      ],
    },
  });
  expect(full(farm)).toBe(false);
  // Incomplete observations retain the static shape and normal server validation.
  expect(compile({})(farm)).toBe(true);
});
