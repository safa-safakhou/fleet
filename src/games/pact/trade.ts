import { type Data, object } from "../../domain.js";
import { executableActionSchema } from "../../generation.js";
import type { ProposalValidation } from "../../platform/contracts.js";
import { actionSchema } from "./contracts.js";

const resources = ["iron", "silver", "grain"];
const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const units = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : undefined);
const isTrade = (action: Data) => ["game.supply.offer", "game.supply.counter"].includes(String(action.kind));

function observedRules(facts: Data): Data | undefined {
  const rules = object(object(object(facts.diplomacy).contractRules).termsValidation);
  if (
    rules.schemaVersion === "pact.supply-terms.v1" &&
    positive(rules.maxBondFlowHours) &&
    resources.every((r) => (units(object(rules.valueUnitsPerWhole)[r]) ?? 0n) > 0n) &&
    Array.isArray(rules.durationHours) &&
    rules.durationHours.every(positive) &&
    Array.isArray(rules.noticeHours) &&
    rules.noticeHours.every((n) => Number.isSafeInteger(n) && Number(n) >= 0) &&
    positive(rules.minOfferExpiryMinutes) &&
    positive(rules.maxOfferExpiryMinutes)
  )
    return rules;
}
function role(action: Data, facts: Data): "A" | "B" | undefined {
  if (action.kind === "game.supply.offer") return "A";
  const offer = rows(object(facts.guide).openSupplyOffers).find((o) => o.id === action.offerId);
  const self = object(object(facts.world).profile).kingdomId;
  if (typeof self !== "string" || !offer) return;
  if (offer.kingdomA === self) return "A";
  if (offer.kingdomB === self) return "B";
}
function flow(value: unknown): Data | null {
  return value === null ? null : { resource: object(value).resource, wholePerHour: object(value).wholePerHour };
}
function sameFlow(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  return object(a).resource === object(b).resource && object(a).wholePerHour === object(b).wholePerHour;
}
function rateCap(facts: Data, resource: unknown): bigint | undefined {
  if (observedRules(facts)?.outgoingRateLimit !== "storage_capacity_whole_per_hour") return;
  const scale = object(object(facts.guide).resourceRules).markedPerWhole;
  const capacity = units(object(object(object(facts.world).balances)[String(resource)]).capacityUnits);
  if (capacity !== undefined && positive(scale)) return capacity / BigInt(scale);
}

/** Local factual checks only; the game still owns permissions, stock and admission. */
export function tradePreflight(action: Data, facts: Data, expectedOutcome?: Data): ProposalValidation | undefined {
  if (!isTrade(action)) return;
  const terms = object(action.terms),
    rules = observedRules(facts),
    ownerRole = role(action, facts);
  const issues: string[] = [],
    maxBondWhole: Data = {};
  if (
    (rules &&
      (!(rules.durationHours as number[]).includes(Number(terms.durationHours)) ||
        !(rules.noticeHours as number[]).includes(Number(terms.noticeHours)))) ||
    Number(terms.noticeHours) > Number(terms.durationHours)
  )
    issues.push("PACT_SUPPLY_DURATION_OR_NOTICE");
  if (terms.aToB === null && terms.bToA === null) issues.push("PACT_SUPPLY_ZERO_FLOWS");
  for (const [side, rawFlow, rawBond] of [
    ["a", terms.aToB, terms.aBond],
    ["b", terms.bToA, terms.bBond],
  ] as const) {
    const f = object(rawFlow),
      b = object(rawBond);
    if (rawBond !== null && rawBond !== undefined && (rawFlow === null || rawFlow === undefined))
      issues.push("PACT_SUPPLY_BOND_WITHOUT_FLOW");
    if (
      (rawFlow && (!resources.includes(String(f.resource)) || !positive(f.wholePerHour))) ||
      (rawBond && (!resources.includes(String(b.resource)) || !positive(b.wholeAmount)))
    ) {
      issues.push("PACT_SUPPLY_INVALID_AMOUNT");
      continue;
    }
    if (rawFlow && rules && positive(terms.durationHours)) {
      const value =
        BigInt(Number(f.wholePerHour)) *
        BigInt(Math.min(Number(terms.durationHours), Number(rules.maxBondFlowHours))) *
        BigInt(String(object(rules.valueUnitsPerWhole)[String(f.resource)]));
      const maxima = Object.fromEntries(
        resources.map((r) => [r, String(value / BigInt(String(object(rules.valueUnitsPerWhole)[r])))]),
      );
      maxBondWhole[side] = maxima;
      if (rawBond && BigInt(Number(b.wholeAmount)) > BigInt(maxima[String(b.resource)]))
        issues.push("PACT_SUPPLY_BOND_EXCEEDS_FLOW");
    } else if (rawBond && !rules) issues.push("PACT_SUPPLY_RULES_REQUIRED");
  }
  if (
    rules &&
    action.expiryMinutes !== undefined &&
    (!positive(action.expiryMinutes) ||
      action.expiryMinutes < Number(rules.minOfferExpiryMinutes) ||
      action.expiryMinutes > Number(rules.maxOfferExpiryMinutes))
  )
    issues.push("PACT_SUPPLY_EXPIRY");
  const send = ownerRole === "A" ? terms.aToB : ownerRole === "B" ? terms.bToA : undefined;
  const receive = ownerRole === "A" ? terms.bToA : ownerRole === "B" ? terms.aToB : undefined;
  const cap = send ? rateCap(facts, object(send).resource) : undefined;
  if (cap !== undefined && positive(object(send).wholePerHour) && BigInt(Number(object(send).wholePerHour)) > cap)
    issues.push("PACT_SUPPLY_RATE_TOO_HIGH");
  if (expectedOutcome !== undefined) {
    const claim = object(expectedOutcome.trade);
    if (!ownerRole) issues.push("PACT_TRADE_PARTY_UNKNOWN");
    else if (!("youSend" in claim) || !("youReceive" in claim)) issues.push("PACT_TRADE_PERSPECTIVE_REQUIRED");
    else if (!sameFlow(claim.youSend, send) || !sameFlow(claim.youReceive, receive))
      issues.push("PACT_TRADE_PERSPECTIVE_MISMATCH");
  }
  if (!issues.length) return;
  return {
    valid: false,
    code: issues[0],
    guidance:
      "No command prepared. Match expectedOutcome.trade.youSend/youReceive to these computed directions. Offer creator is A; counters keep original A/B. Rates/amounts are whole resources. Correct every issue from the observed rules and maxBondWhole, or choose other useful work/read/wait. Null bonds are valid; unsigned offers earn no resources. Never replay an uncertain command.",
    detail: {
      issues: [...new Set(issues)],
      ownerRole: ownerRole ?? "unknown",
      trade: ownerRole ? { youSend: flow(send), youReceive: flow(receive) } : null,
      maxBondWhole,
      ownOutgoingRateCapWholePerHour: cap === undefined ? null : String(cap),
    },
  };
}

export function tradeExpectedOutcomeSchema(): Data {
  const shape = executableActionSchema(actionSchema("game.supply.offer"));
  const f = object(object(object(shape.properties).terms).properties).aToB;
  return {
    type: "object",
    properties: {
      trade: {
        type: "object",
        properties: { youSend: f, youReceive: f },
        required: ["youSend", "youReceive"],
        additionalProperties: false,
      },
    },
    required: ["trade"],
    additionalProperties: false,
  };
}

/** Direction annotations stay in modern generation; bare server arguments are unchanged. */
export function constrainTradeSchema(shape: Data, kind: string, facts: Data): Data {
  if (!["game.supply.offer", "game.supply.counter"].includes(kind)) return shape;
  // Optional generation annotations/bounds are delivered after the rule read.
  // The structured perspective check remains required on older hosts too.
  if (!observedRules(facts)) return shape;
  const terms = object(object(object(shape.properties).terms).properties);
  const creator = kind === "game.supply.offer";
  terms.aToB = {
    ...object(terms.aToB),
    description: creator
      ? "YOU SEND: outgoing ordinary resources from creator A to peer B. This is not income."
      : "Original party A sends to original B. Counteroffers do not swap parties.",
  };
  terms.bToA = {
    ...object(terms.bToA),
    description: creator
      ? "YOU RECEIVE: incoming resources from peer B to creator A, only after signatures and settlement."
      : "Original party B sends to original A. Check the observed offer parties.",
  };
  if (creator && observedRules(facts)) {
    const base = rows(object(terms.aToB).anyOf).find((s) => s.type === "object");
    if (base) {
      // Equal observed caps share one flow shape; no resource/cap pairing is lost.
      const groups = new Map<string, { cap: bigint | undefined; resources: string[] }>();
      for (const resource of resources) {
        const cap = rateCap(facts, resource);
        if (cap !== undefined && cap < 1n) continue;
        const key = cap === undefined ? "unknown" : String(cap);
        const group = groups.get(key) ?? { cap, resources: [] };
        group.resources.push(resource);
        groups.set(key, group);
      }
      terms.aToB = {
        description: object(terms.aToB).description,
        anyOf: [
          { type: "null" },
          ...[...groups.values()].map(({ cap, resources: members }) => ({
            ...base,
            properties: {
              ...object(base.properties),
              resource: { type: "string", enum: members },
              wholePerHour: {
                ...object(object(base.properties).wholePerHour),
                ...(cap !== undefined
                  ? { maximum: Number(cap > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : cap) }
                  : {}),
              },
            },
          })),
        ],
      };
    }
  }
  return shape;
}

export function tradeBriefing(facts: Data): Data | undefined {
  if (!object(facts.diplomacy).contractRules) return;
  const balances = object(object(facts.world).balances),
    scale = object(object(facts.guide).resourceRules).markedPerWhole;
  return {
    offerDirections: { aToB: "youSend", bToA: "youReceive", aBond: "yourBond", bBond: "peerBond" },
    counterDirections: "Keep original kingdomA/kingdomB; as B you send bToA and receive aToB.",
    rules: observedRules(facts) ?? { status: "unknown", read: "pact_agent_guide_v1 topic diplomacy" },
    ordinaryTradeableWholeFloor: positive(scale)
      ? Object.fromEntries(
          resources.map((r) => [
            r,
            units(object(balances[r]).ordinaryUnits) === undefined
              ? null
              : String(BigInt(String(object(balances[r]).ordinaryUnits)) / BigInt(scale)),
          ]),
        )
      : null,
    guidance:
      "Set expectedOutcome.trade.youSend/youReceive outside payload to the actual flows/null. Seek scarce Hall stock in YOU RECEIVE; exporting it or bonding it may delay Hall. Use ordinary stock/production, never allowances. Bonds optional (null); value <= side hourly flow value * min(duration,maxBondFlowHours). Use modest supportable terms. Unsigned earns nothing; both sign returned ID/version before settlement. Peer stock/interest/authority unknown. Introductions can discuss supply.",
  };
}
