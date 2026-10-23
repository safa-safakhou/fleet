import { type Data, object } from "../../domain.js";
import { executableActionSchema } from "../../generation.js";
import { constructionRecovery } from "./construction.js";
import { actionSchema } from "./contracts.js";
import { constrainNegotiationSchema } from "./negotiation.js";
import { constrainTradeSchema } from "./trade.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
/** An unfinished owned batch occupies PACT's single training queue. Missing pages stay unknown. */
export function observedTrainingBusy(facts: Data): boolean {
  return rows(object(facts.world).training).some(
    (b) =>
      typeof b.batchId === "string" &&
      Number.isSafeInteger(b.requestedCount) &&
      Number.isSafeInteger(b.completedCount) &&
      Number(b.completedCount) >= 0 &&
      Number(b.requestedCount) > Number(b.completedCount),
  );
}
export function observedHall(facts: Data): number | undefined {
  const level = rows(object(facts.world).buildings).find((b) => b.kind === "hall")?.level;
  return Number.isSafeInteger(level) && Number(level) >= 1 ? Number(level) : undefined;
}
export function requiredHall(kind: string, facts: Data): number | undefined {
  const unlocks = object(object(facts.development).hallUnlocks);
  const key = { archer: "archers", rider: "riders", ram: "rams", lending: "lending" }[kind];
  const level = key ? unlocks[key] : undefined;
  return Number.isSafeInteger(level) && Number(level) >= 1 ? Number(level) : undefined;
}
export function observedPeerIds(facts: Data): string[] {
  const self = object(object(facts.world).profile).kingdomId;
  return [
    ...new Set(
      [
        ...rows(object(facts.discovery).players),
        ...rows(object(facts.guide).contacts),
        ...rows(object(facts.guide).contactRequests),
      ]
        .map((p) => p.kingdomId)
        .filter((id): id is string => typeof id === "string" && id !== self),
    ),
  ];
}
/** Only a fresh complete owned page can establish that no attack troops are available. */
export function observedOrdinaryHomeUnitCount(facts: Data): number | undefined {
  const world = object(facts.world),
    refs = object(world.unitReferences),
    self = object(world.profile).kingdomId;
  if (
    refs.schemaVersion !== "pact.references.v1" ||
    refs.hasMore !== false ||
    !Array.isArray(refs.units) ||
    typeof self !== "string"
  )
    return;
  const time = refs.asOfGameTimeMs ?? world.asOfGameTimeMs;
  if (time === undefined || time !== world.asOfGameTimeMs) return;
  let count = 0;
  for (const u of rows(refs.units)) {
    if (u.type !== "Unit" || u.asOfGameTimeMs !== time) return;
    if (
      u.homeGuard === true ||
      u.battleLocked === true ||
      (typeof u.ownerKingdomId === "string" && u.ownerKingdomId !== self) ||
      (typeof u.hostKingdomId === "string" && u.hostKingdomId !== self) ||
      (typeof u.placement === "string" && u.placement !== "home")
    )
      continue;
    if (
      u.ownerKingdomId !== self ||
      u.hostKingdomId !== self ||
      u.homeGuard !== false ||
      u.battleLocked !== false ||
      u.placement !== "home"
    )
      return;
    count++;
  }
  return count;
}
export function observedJoinableRaids(facts: Data): Data[] | undefined {
  const world = object(facts.world);
  if (!Array.isArray(world.raids)) return;
  return rows(world.raids).filter(
    (r) =>
      r.status === "declared" &&
      !["leader", "defender"].includes(String(r.role)) &&
      !(Number(r.lockGameTimeMs) <= Number(world.asOfGameTimeMs)),
  );
}
/** Narrow proposals using current authorized observations; server admission remains authoritative. */
export function observedActionSchema(kind: string, facts: Data): Data | undefined {
  const shape = executableActionSchema(actionSchema(kind)),
    properties = object(shape.properties);
  const guide = object(facts.guide),
    world = object(facts.world);
  if (kind === "game.training.queue" && observedTrainingBusy(facts)) return;
  const version = object(guide.mandate).version;
  if (properties.mandateVersion) {
    if (Number.isSafeInteger(version) && Number(version) >= 0) properties.mandateVersion = { const: version };
    else delete properties.mandateVersion;
  }
  if (kind === "game.building.queue") {
    const builders = rows(world.builders),
      building = object(properties.building),
      slot = object(properties.slot);
    if (Array.isArray(building.enum)) {
      const eligible = building.enum.filter(
        (k) => !builders.some((b) => b.kind === k && ["active", "waiting"].includes(String(b.state))),
      );
      if (!eligible.length) return;
      properties.building = { ...building, enum: eligible };
    }
    if (Array.isArray(slot.anyOf)) {
      const eligible = slot.anyOf.filter(
        (s) => !builders.some((b) => b.slot === object(s).const && b.state === "waiting"),
      );
      if (!eligible.length) return;
      properties.slot = { ...slot, anyOf: eligible };
    }
  }
  if (kind === "game.building.queue") {
    const building = object(properties.building),
      slots = object(properties.slot).anyOf;
    const observedSlots = new Set(rows(world.builders).map((b) => b.slot));
    if (
      Array.isArray(building.enum) &&
      Array.isArray(slots) &&
      slots.every((s) => observedSlots.has(object(s).const))
    ) {
      const eligible = building.enum.filter((building) => {
        const check = rows(world.nextUpgradeChecks).find((c) => c.kind === building);
        return (
          !check ||
          slots.some(
            (s) =>
              constructionRecovery(world, { kind, building, targetLevel: check.targetLevel, slot: object(s).const })
                .status !== "owner_required",
          )
        );
      });
      if (!eligible.length) return;
      properties.building = { ...building, enum: eligible };
    }
  }
  if (
    ["game.raid.accept", "game.raid.declare", "game.scout.start"].includes(kind) &&
    observedOrdinaryHomeUnitCount(facts) === 0
  )
    return;
  if (kind === "game.scout.share" && Array.isArray(world.scouts)) {
    const ids = rows(world.scouts)
      .filter((r) => r.status === "completed")
      .map((r) => r.operationId)
      .filter((id): id is string => typeof id === "string");
    if (!ids.length) return;
    properties.operationId = { ...object(properties.operationId), enum: ids };
  }
  if (kind === "game.raid.accept") {
    const raids = observedJoinableRaids(facts);
    if (raids) {
      const ids = raids.map((r) => r.raidId).filter((id): id is string => typeof id === "string");
      if (!ids.length) return;
      properties.raidId = { ...object(properties.raidId), enum: ids };
    }
  }
  const references = [
    ["requestId", "contactRequests"],
    [
      "offerId",
      kind.startsWith("game.supply.")
        ? "openSupplyOffers"
        : kind.startsWith("game.garrison.")
          ? "openGarrisonOffers"
          : "",
    ],
    [
      "contractId",
      kind.startsWith("game.supply.")
        ? "activeSupplyContracts"
        : kind.startsWith("game.garrison.")
          ? "activeGarrisonContracts"
          : "",
    ],
  ];
  for (const [field, page] of references) {
    if (!properties[field] || !page || !Array.isArray(guide[page])) continue;
    const ids = rows(guide[page])
      .filter(
        (r) =>
          field !== "requestId" || (r.direction === "incoming" && (r.status === undefined || r.status === "pending")),
      )
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string");
    if (!ids.length) return;
    properties[field] = { ...object(properties[field]), enum: ids };
  }
  const hall = observedHall(facts);
  if (kind === "game.training.queue" && hall !== undefined) {
    const type = object(properties.type);
    if (Array.isArray(type.enum))
      properties.type = { ...type, enum: type.enum.filter((t) => (requiredHall(String(t), facts) ?? 1) <= hall) };
  }
  if (kind === "game.garrison.offer" && hall !== undefined && hall < (requiredHall("lending", facts) ?? 1)) return;
  const field = (
    {
      "game.contact.request": "recipientKingdomId",
      "game.message.send": "recipientKingdomId",
      "game.supply.offer": "counterpartyKingdomId",
      "game.garrison.offer": "hostKingdomId",
    } as Record<string, string>
  )[kind];
  if (field) {
    let peers =
      kind === "game.message.send" && Array.isArray(guide.contacts)
        ? rows(guide.contacts)
            .map((p) => p.kingdomId)
            .filter((id): id is string => typeof id === "string" && id !== object(world.profile).kingdomId)
        : observedPeerIds(facts);
    if (kind === "game.contact.request") {
      // Positive accepted-contact facts rule out a fresh introduction. Missing
      // pages and pending requests establish no acceptance; native admission
      // still revalidates every selected action.
      const accepted = new Set(rows(guide.contacts).map((p) => p.kingdomId));
      const observed = peers;
      peers = peers.filter((id) => !accepted.has(id));
      if (observed.length && !peers.length) return;
    }
    if (kind === "game.message.send" && Array.isArray(guide.contacts) && !peers.length) return;
    if (peers.length) properties[field] = { ...object(properties[field]), enum: peers };
  }
  const negotiation = constrainNegotiationSchema(shape, kind, facts);
  return negotiation ? constrainTradeSchema(negotiation, kind, facts) : undefined;
}
