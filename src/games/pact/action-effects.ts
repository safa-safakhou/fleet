import { createHash } from "node:crypto";
import { type Data, FleetError, type Tool } from "../../domain.js";
import { type ActionEffects, ActionEffectsSchema, actionIntentDigest } from "../../platform/action-effects.js";
import type { ActionIntent } from "../../platform/contracts.js";
import { actionContract } from "./contracts.js";

type Identity = { id: string; accountRef: string };
/** Verify the actual decorated MCP catalog, not just canonical source tool names. */
export function assertPactEffectCatalog(tools: readonly Tool[]) {
  if (
    !tools.some((t) => t.name === "pact_action_effects_quote_v1" && t.annotations?.readOnlyHint === true) ||
    !tools.some((t) => t.name === "pact_action_effects_execute_v1" && t.annotations?.readOnlyHint === false)
  )
    throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
}
export function pactEffectCommand(binding: Identity, intent: ActionIntent, now: Date): Data {
  if (intent.bindingId !== binding.id || intent.schemaId !== "pact.action.v1")
    throw new FleetError("EFFECT_INTENT_MISMATCH", true);
  return {
    schemaVersion: actionContract(intent.payload).version,
    commandId: intent.commandId,
    actor: {
      principalId: binding.accountRef,
      productScope: "pact",
      audience: "agent",
      subject: { type: "account", id: binding.accountRef },
    },
    action: intent.payload,
    submittedAt: now.toISOString(),
  };
}
export function pactNativeIntentDigest(command: Data) {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .sort(([a], [b]) => a.localeCompare(b, "en"))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          schemaVersion: command.schemaVersion,
          commandId: command.commandId,
          expectedVersion: command.expectedVersion ?? null,
          action: command.action,
        }),
      ),
    )
    .digest("hex");
}
export function normalizePactEffects(intent: ActionIntent, command: Data, raw: unknown): ActionEffects {
  const q = ActionEffectsSchema.parse(raw);
  if (q.intentDigest !== pactNativeIntentDigest(command) || q.actionKey !== intent.payload.kind)
    throw new FleetError("EFFECT_INTENT_MISMATCH", true);
  if (!q.supported || !q.coverage.complete || q.coverage.omitted.length)
    throw new FleetError("INCOMPLETE_ACTION_EFFECTS", true);
  return { ...q, intentDigest: actionIntentDigest(intent) };
}
export function pactRemoteGuard(intent: ActionIntent, guard: NonNullable<ActionIntent["guard"]>, command: Data): Data {
  if (guard.expectedEffects.intentDigest !== actionIntentDigest(intent))
    throw new FleetError("EFFECT_INTENT_MISMATCH", true);
  return { ...guard, expectedEffects: { ...guard.expectedEffects, intentDigest: pactNativeIntentDigest(command) } };
}
