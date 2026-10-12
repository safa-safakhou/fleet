import { type Data, object } from "../../domain.js";
import { actionKinds } from "./contracts.js";

export const humanGameKinds = [
  "game.building.cancel",
  "game.training.cancel",
  "game.troop.disband",
  "game.garrison.seize",
  "game.raid.nominate",
  "game.raid.withdraw",
];
export const mandateActions: Record<string, string> = {
  "game.contact.request": "contact.request",
  "game.message.send": "message.send.contact",
  "game.transfer": "transfer",
  "game.building.queue": "building.queue",
  "game.training.queue": "training.queue",
  "game.supply.sign": "supply.sign",
  "game.supply.notice": "supply.break",
  "game.supply.refuse": "supply.break",
  "game.supply.release": "supply.break",
  "game.scout.start": "scout.start",
  "game.garrison.sign": "garrison.sign",
  "game.garrison.exit": "garrison.break",
  "game.garrison.release": "garrison.break",
  "game.raid.declare": "raid.commit",
  "game.raid.accept": "raid.commit",
};
const agentKinds = [
  ...Object.keys(mandateActions),
  "game.contact.answer",
  "game.supply.offer",
  "game.supply.counter",
  "game.supply.withdraw",
  "game.scout.share",
  "game.garrison.offer",
  "game.garrison.withdraw",
];
export function capabilityMatrix(facts: Data, ownerPolicy: Data | null) {
  const guide = object(facts.guide);
  const allowed = object(guide.mandate).allowedActions;
  const exceptions = Array.isArray(ownerPolicy?.allowedKinds) ? ownerPolicy.allowedKinds : [];
  return actionKinds.map((kind) => {
    const human = !agentKinds.includes(kind);
    const requiredMandate = mandateActions[kind];
    const missingMandate =
      requiredMandate && (guide.mandate === null || (Array.isArray(allowed) && !allowed.includes(requiredMandate)));
    const manual =
      kind === "game.contact.answer" &&
      (guide.socialDelegation === null || object(guide.socialDelegation).mode === "manual");
    const ownerCovered = exceptions.includes(kind);
    const blocked =
      human && !ownerCovered
        ? "HUMAN_DECISION_REQUIRED"
        : missingMandate && !ownerCovered
          ? "OBSERVED_MANDATE_DENIED"
          : manual && !ownerCovered
            ? "SOCIAL_DELEGATION_REQUIRED"
            : null;
    return {
      kind,
      route: human || missingMandate || manual ? "owner_policy_only" : "agent",
      blocked,
      requiredMandate: requiredMandate ?? null,
      checks: human
        ? [
            "Concrete owner policy, remaining owner command budget and actual human endpoint checks; exact human permit where required.",
          ]
        : [
            "Authenticated account/kingdom and command OAuth scope; live agent write lease; server ownership, quotas, stock, targets and prerequisites.",
            ...(requiredMandate
              ? ["Current mandate action, version, resource/troop allowances and reserve floors where applicable."]
              : []),
            ...(kind === "game.contact.answer"
              ? ["Recipient social delegation, including allowlist sender check."]
              : []),
          ],
      coverage:
        "Advertisement only. Conditional actions are not permission grants; the real server authorizes every submission.",
    };
  });
}
