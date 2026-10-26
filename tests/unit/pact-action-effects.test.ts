import { expect, it } from "vitest";
import { pactSpecialistPresets } from "../../src/environments/pact-presets.js";
import {
  assertPactEffectCatalog,
  normalizePactEffects,
  pactEffectCommand,
  pactNativeIntentDigest,
} from "../../src/games/pact/action-effects.js";
import { actionIntentDigest } from "../../src/platform/action-effects.js";

it("refuses an effects execute tool misadvertised as read-only before any model or game dispatch", () => {
  const read = { name: "pact_action_effects_quote_v1", inputSchema: {}, annotations: { readOnlyHint: true } };
  const write = { name: "pact_action_effects_execute_v1", inputSchema: {}, annotations: { readOnlyHint: false } };
  expect(() => assertPactEffectCatalog([read, write])).not.toThrow();
  expect(() => assertPactEffectCatalog([read, { ...write, annotations: { readOnlyHint: true } }])).toThrow(
    "ACTION_EFFECTS_PROTOCOL_REQUIRED",
  );
  expect(() => assertPactEffectCatalog([read])).toThrow("ACTION_EFFECTS_PROTOCOL_REQUIRED");
});

it("binds native quotes to the immutable local intent and preserves complete source provenance", () => {
  const binding = { id: "00000000-0000-4000-8000-000000000001", accountRef: "00000000-0000-4000-8000-000000000002" },
    intent = {
      commandId: "00000000-0000-4000-8000-000000000003",
      bindingId: binding.id,
      schemaId: "pact.action.v1",
      payload: { kind: "game.training.queue", type: "spearman", count: 1 },
    };
  const command = pactEffectCommand(binding, intent, new Date("2026-10-21T00:00:00Z"));
  const quote = {
    schemaVersion: "fleet.action-effects.v1",
    revision: "source",
    intentDigest: pactNativeIntentDigest(command),
    actionKey: intent.payload.kind,
    claims: [{ kind: "resource", schemaId: "stock", key: "iron", units: "1" }],
    capacities: [{ schemaId: "stock", key: "iron", remainingUnits: "2" }],
    sourceRefs: ["original:one"],
    validUntil: { clockId: "utc", value: "2026-10-21T00:00:30Z" },
    coverage: { complete: true, omitted: [] },
    supported: true,
  };
  const local = normalizePactEffects(intent, command, quote);
  expect(local.intentDigest).toBe(actionIntentDigest(intent));
  expect(local.sourceRefs).toEqual(["original:one"]);
  expect(() => normalizePactEffects(intent, command, { ...quote, intentDigest: "a".repeat(64) })).toThrow(
    "EFFECT_INTENT_MISMATCH",
  );
  expect(pactSpecialistPresets.map((p) => p.roles.length)).toEqual([2, 4]);
  expect(
    pactSpecialistPresets[1].roles.find((r) => r.charter.id === "diplomacy")?.charter.allowedActions,
  ).not.toContain("game.training.queue");
});
