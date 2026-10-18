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
