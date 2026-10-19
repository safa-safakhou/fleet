import { type Data, object } from "../../domain.js";
import {
  observedHall,
  observedJoinableRaids,
  observedOrdinaryHomeUnitCount,
  observedTrainingBusy,
  requiredHall,
} from "./choices.js";

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
  if (action.kind === "game.training.queue" && observedTrainingBusy(facts))
    return {
      code: "OBSERVED_TRAINING_BUSY",
      submitted: false,
      committed: false,
      guidance:
        "An observed unfinished batch occupies the single training queue. Read fresh training/world facts or choose other goal-relevant work. Troops do not satisfy building prerequisites. No command was submitted.",
    };
  const self = object(world.profile).kingdomId;
  const targetField = (
    {
      "game.contact.request": "recipientKingdomId",
      "game.message.send": "recipientKingdomId",
      "game.supply.offer": "counterpartyKingdomId",
      "game.garrison.offer": "hostKingdomId",
    } as Record<string, string>
  )[String(action.kind)];
  if (targetField && typeof self === "string" && action[targetField] === self)
    return refused(
      "OBSERVED_SELF_TARGET",
      targetField,
      self,
      "This is your own kingdom, not a counterparty. Choose an observed other kingdom.",
    );
  if (
    action.kind === "game.message.send" &&
    Array.isArray(guide.contacts) &&
    !records(guide.contacts).some((p) => p.kingdomId === action.recipientKingdomId)
  )
    return refused(
      "OBSERVED_CONTACT_REQUIRED",
      "recipientKingdomId",
      action.recipientKingdomId,
      "No accepted contact with this recipient is in the observed page. Inspect contacts or use a lawful introduction and wait for acceptance before direct messaging.",
    );
  const hall = observedHall(facts),
    required = requiredHall(
      action.kind === "game.garrison.offer"
        ? "lending"
        : action.kind === "game.training.queue"
          ? String(action.type)
          : "",
      facts,
    );
  if (hall !== undefined && required !== undefined && hall < required)
    return {
      code: "OBSERVED_HALL_LOCKED",
      currentHall: hall,
      requiredHall: required,
      submitted: false,
      committed: false,
      guidance:
        "The observed Hall is below this action's published unlock. Plan the Hall prerequisites first or choose another lawful step; no command was submitted.",
    };
  if (action.kind === "game.raid.accept" && Array.isArray(world.raids)) {
    const raid = records(world.raids).find((r) => r.raidId === action.raidId);
    if (!raid)
      return refused(
        "OBSERVED_RAID_NOT_FOUND",
        "raidId",
        action.raidId,
        "No raid reference with this ID is in the owned raid view. A kingdom UUID is not a raid UUID; read the actual raid/invitation before accepting.",
      );
    if (!observedJoinableRaids(facts)?.some((r) => r.raidId === action.raidId))
      return refused(
        "OBSERVED_RAID_NOT_JOINABLE",
        "raidId",
        action.raidId,
        "This observed raid is locked, closed, led by you or targets you. The server must still verify nomination, troops and mandate.",
      );
  }
  if (
    ["game.raid.accept", "game.raid.declare"].includes(String(action.kind)) &&
    observedOrdinaryHomeUnitCount(facts) === 0
  )
    return {
      code: "OBSERVED_RAID_UNITS_UNAVAILABLE",
      submitted: false,
      committed: false,
      guidance:
        "The fresh complete owned unit page has no ordinary available home troops for an attack. Home Guard cannot attack. Choose other lawful work or wait; no command was submitted.",
    };
  if (action.kind === "game.scout.share" && Array.isArray(world.scouts)) {
    const operation = records(world.scouts).find((r) => r.operationId === action.operationId);
    if (!operation)
      return refused(
        "OBSERVED_SCOUT_NOT_FOUND",
        "operationId",
        action.operationId,
        "No owned scout operation with this ID is in the observed page. Read the actual operation before sharing its report.",
      );
    if (operation.status !== "completed")
      return refused(
        "OBSERVED_SCOUT_NOT_COMPLETE",
        "operationId",
        action.operationId,
        "This scouting operation has not completed; there is no completed report to share yet.",
      );
  }
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
    if (ref.ownerKingdomId !== undefined && ref.ownerKingdomId !== object(world.profile).kingdomId)
      return refused(
        "OBSERVED_REFERENCE_OWNER_MISMATCH",
        "offerId",
        action.offerId,
        "This offer reference belongs to another kingdom.",
      );
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
