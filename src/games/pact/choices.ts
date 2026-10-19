import { type Data, object } from "../../domain.js";
import { executableActionSchema } from "../../generation.js";
import { actionSchema } from "./contracts.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
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
/** Narrow proposals using current authorized observations; server admission remains authoritative. */
export function observedActionSchema(kind: string, facts: Data): Data | undefined {
  const shape = executableActionSchema(actionSchema(kind)),
    properties = object(shape.properties);
  const guide = object(facts.guide),
    world = object(facts.world);
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
    const peers =
      kind === "game.message.send" && Array.isArray(guide.contacts)
        ? rows(guide.contacts)
            .map((p) => p.kingdomId)
            .filter((id): id is string => typeof id === "string" && id !== object(world.profile).kingdomId)
        : observedPeerIds(facts);
    if (kind === "game.message.send" && Array.isArray(guide.contacts) && !peers.length) return;
    if (peers.length) properties[field] = { ...object(properties[field]), enum: peers };
  }
  return shape;
}
