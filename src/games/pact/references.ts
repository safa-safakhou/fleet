import { type Data, object } from "../../domain.js";

const nil = new Set(["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff"]);
const records = (value: unknown) => (Array.isArray(value) ? value.map(object) : []);
function refused(code: string, field: string, id: unknown, reason: string): Data {
  return {
    code,
    field,
    referenceId: id,
    submitted: false,
    committed: false,
    guidance: `${reason} No command was submitted. Read fresh scoped facts; do not replace this reference with a guessed ID.`,
  };
}
export function referencePreflight(action: Data, facts: Data): Data | undefined {
  const guide = object(facts.guide),
    world = object(facts.world);
  if (action.kind === "game.contact.answer") {
    const request = records(guide.contactRequests).find((r) => r.id === action.requestId),
      ref = object(request?.reference);
    if (!request)
      return refused(
        "OBSERVED_REQUEST_NOT_FOUND",
        "requestId",
        action.requestId,
        "The fresh request page does not contain this ContactRequest. Missing pages are unknown, not an invitation to guess.",
      );
    if (ref.type !== undefined && ref.type !== "ContactRequest")
      return refused(
        "OBSERVED_REFERENCE_TYPE_MISMATCH",
        "requestId",
        action.requestId,
        "This reference has another role.",
      );
    if (request.direction !== "incoming" || (request.status !== undefined && request.status !== "pending"))
      return refused(
        "OBSERVED_REQUEST_NOT_ANSWERABLE",
        "requestId",
        action.requestId,
        "Only a pending incoming request can be answered by its recipient.",
      );
    if (request.expired === true || Number(request.expiresGameTimeMs) <= Number(world.asOfGameTimeMs))
      return refused(
        "OBSERVED_REQUEST_EXPIRED",
        "requestId",
        action.requestId,
        "This incoming request expired in game time.",
      );
    if (ref.ownerKingdomId !== undefined && ref.ownerKingdomId !== object(world.profile).kingdomId)
      return refused(
        "OBSERVED_REFERENCE_OWNER_MISMATCH",
        "requestId",
        action.requestId,
        "This reference belongs to another kingdom.",
      );
    if (ref.delegationVersion !== undefined && ref.delegationVersion !== object(guide.socialDelegation).version)
      return refused(
        "OBSERVED_REFERENCE_STALE",
        "requestId",
        action.requestId,
        "The request reference predates the observed delegation version.",
      );
  }
  if (["game.supply.sign", "game.supply.counter", "game.supply.withdraw"].includes(String(action.kind))) {
    const offer = records(guide.openSupplyOffers).find((o) => o.id === action.offerId),
      ref = object(offer?.reference);
    if (!offer)
      return refused(
        "OBSERVED_OFFER_NOT_FOUND",
        "offerId",
        action.offerId,
        "The fresh open-offer page does not contain this SupplyOffer.",
      );
    if (ref.type !== undefined && ref.type !== "SupplyOffer")
      return refused("OBSERVED_REFERENCE_TYPE_MISMATCH", "offerId", action.offerId, "This reference has another role.");
    const version = action.version ?? action.expectedVersion;
    if (version !== undefined && version !== offer.version)
      return refused(
        "OBSERVED_OFFER_VERSION_MISMATCH",
        "version",
        action.offerId,
        "Copy this offer's actual current version.",
      );
    if (
      (offer.status !== undefined && offer.status !== "open") ||
      Number(offer.expiresGameTimeMs) <= Number(world.asOfGameTimeMs)
    )
      return refused(
        "OBSERVED_OFFER_EXPIRED",
        "offerId",
        action.offerId,
        "This offer is no longer open and unexpired.",
      );
  }
  if (action.kind === "game.scout.start") {
    const units = object(world.unitReferences);
    if (units.schemaVersion === "pact.references.v1") {
      const owner = object(world.profile).kingdomId;
      const eligible = records(units.units).filter(
        (u) =>
          u.type === "Unit" &&
          u.scoutEligible === true &&
          u.ownerKingdomId === owner &&
          u.hostKingdomId === owner &&
          u.placement === "home" &&
          u.unitType === "spearman" &&
          u.homeGuard === false &&
          u.battleLocked === false &&
          u.asOfGameTimeMs === (units.asOfGameTimeMs ?? world.asOfGameTimeMs),
      );
      if (
        Array.isArray(action.unitIds) &&
        (new Set(action.unitIds).size !== action.unitIds.length ||
          action.unitIds.some((id) => !eligible.some((u) => u.id === id)))
      )
        return refused(
          "OBSERVED_UNIT_NOT_ELIGIBLE",
          "unitIds",
          action.unitIds,
          "Each explicitly selected unit must be a fresh eligible ordinary home Spearman; Home Guard, locked, foreign, unavailable and stale IDs cannot certify eligibility.",
        );
      if (
        !action.unitIds &&
        units.hasMore === false &&
        typeof units.scoutTroopsRequired === "number" &&
        eligible.length < units.scoutTroopsRequired
      )
        return refused(
          "OBSERVED_SCOUT_UNITS_UNAVAILABLE",
          "unitIds",
          null,
          "The complete observed owned-unit page has fewer eligible Spearmen than the server's requirement.",
        );
    }
  }
}
export function referenceReadPreflight(tool: string, args: Data): Data | undefined {
  if (tool === "pact_receipt_read_v1" && nil.has(String(args.commandId).toLowerCase()))
    return {
      code: "RECEIPT_NOT_FOUND",
      field: "commandId",
      referenceId: args.commandId,
      receiptExists: false,
      submitted: false,
      commandState: "unknown",
      guidance:
        "A placeholder ID is not a recorded command. Ordinary failed lookup does not establish transport uncertainty or activate pending-command reconciliation.",
    };
}
