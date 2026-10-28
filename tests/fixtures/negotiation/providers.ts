import { type Data, type ModelPort, object } from "../../../src/domain.js";
import { expandFactTables } from "../../../src/fact-table.js";
import type { NegotiationCell } from "../../../src/negotiation-plan.js";
import { fixtureGoalBasis, fixtureWaitBasis } from "../pact-progress-basis.js";
import type { FixtureProviders } from "./driver.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
const terms = {
  aToB: { resource: "iron", wholePerHour: 2 },
  bToA: { resource: "silver", wholePerHour: 1 },
  aBond: null,
  bBond: null,
  durationHours: 1,
  noticeHours: 0,
};
/** Authored fake outputs are test inputs, not decisions supplied by the driver. */
export function scriptedProviders(
  cell: NegotiationCell,
  options: { alternating?: boolean; correctOnce?: boolean; learnOnce?: boolean } = {},
): FixtureProviders {
  const actors = ([0, 1] as const).map((index) => {
    const role = cell.rolesReversed ? (index === 0 ? "B" : "A") : index === 0 ? "A" : "B";
    let first: number | undefined;
    let corrected = false,
      learned = false;
    const provider: ModelPort = {
      decide: async (request) => {
        const packet = expandFactTables(JSON.parse(request.messages[1].content)) as Data,
          observation = object(packet.observation),
          payload = object(observation.payload),
          world = object(payload.world ?? payload.environment),
          guide = object(payload.guide ?? payload.environment),
          time = Number(world.asOfGameTimeMs);
        first ??= time;
        const round = Math.floor((time - first) / 900000),
          offers = rows(object(payload.requestedRead).records).filter(
            (r) => r.type === "SupplyOffer" && r.status === "open",
          ).length
            ? rows(object(payload.requestedRead).records).filter((r) => r.type === "SupplyOffer" && r.status === "open")
            : rows(object(payload.negotiation).offers).length
              ? rows(object(payload.negotiation).offers)
              : rows(guide.openSupplyOffers),
          offer = offers[0];
        const requested = object(payload.requestedRead);
        const discovery = Array.isArray(requested.players)
            ? requested
            : object(payload.discovery ?? object(payload.environment).publicDiscovery),
          peer = String(
            rows(discovery.players)[0]?.kingdomId ??
              rows(guide.contacts)[0]?.kingdomId ??
              offer?.counterpartyKingdomId ??
              offer?.peerId,
          );
        let decision: Data = {
          kind: "wait",
          summary:
            cell.family === "C03"
              ? "Retain Silver; extra Iron does not serve current owner intent"
              : cell.family === "C04"
                ? "Offer expired; no current mutual consent"
                : cell.family === "C06"
                  ? "No unmet exchange objective; remain solvent"
                  : "No further useful action; await actual settlement or new facts",
        };
        const action = (payload: Data, trade?: Data) => ({
          kind: "action",
          schemaId: "pact.action.v1",
          payload,
          summary: "Current terms or contact step; no delivery claimed",
          ...(trade ? { expectedOutcome: { trade } } : {}),
        });
        if (cell.family === "C01") {
          if (round === 0 && role === "A")
            decision = action({
              kind: "game.contact.request",
              recipientKingdomId: peer,
              note: "I need Silver and can exchange Iron; may we discuss?",
            });
          if (round === 0 && role === "B") {
            const request = [
              ...rows(guide.contactRequests),
              ...rows(object(guide.socialAttention).records).filter((r) => r.type === "ContactRequest"),
            ].find((r) => r.direction !== "outgoing");
            decision = action({ kind: "game.contact.answer", requestId: request?.id, accept: true });
          }
          if (round === 1)
            decision = action({
              kind: "game.message.send",
              recipientKingdomId: peer,
              body:
                role === "A"
                  ? "I need 1 Silver/hour and can send 2 Iron/hour for one hour, without bonds."
                  : "I need 2 Iron/hour; I can send 1 Silver/hour for that one-hour exchange, no bonds.",
            });
          if (round === 2 && role === "A")
            decision = action(
              { kind: "game.supply.offer", counterpartyKingdomId: peer, terms, expiryMinutes: 60 },
              { youSend: terms.aToB, youReceive: terms.bToA },
            );
          if (((round === 2 && role === "B") || (round === 3 && role === "A")) && offer)
            decision = action(
              { kind: "game.supply.sign", offerId: offer.id, version: offer.version },
              { youSend: role === "A" ? terms.aToB : terms.bToA, youReceive: role === "A" ? terms.bToA : terms.aToB },
            );
        }
        if (cell.family === "C02") {
          if (round === 0)
            decision = action({
              kind: "game.message.send",
              recipientKingdomId: peer,
              body:
                role === "A"
                  ? "My current owner limit is 2 Iron/hour. The original 4 Iron/hour offer needs a counter."
                  : "I can send at most 1 Silver/hour and need 2 Iron/hour. Please counter to those rates.",
            });
          if (round === 1 && role === "A" && offer)
            decision = action(
              {
                kind: "game.supply.counter",
                offerId: offer.id,
                expectedVersion: offer.version,
                terms,
                expiryMinutes: 60,
              },
              { youSend: terms.aToB, youReceive: terms.bToA },
            );
          if (((round === 1 && role === "B") || (round === 2 && role === "A")) && offer)
            decision = action(
              { kind: "game.supply.sign", offerId: offer.id, version: offer.version },
              { youSend: role === "A" ? terms.aToB : terms.bToA, youReceive: role === "A" ? terms.bToA : terms.aToB },
            );
        }
        if (
          role === (options.alternating && cell.family === "C01" ? "A" : "B") &&
          ((cell.family === "C01" && round === 1) || (cell.family === "C02" && round === 0)) &&
          !rows(object(payload.requestedRead).messages).some((m) => m.senderKingdomId === peer)
        ) {
          decision = {
            kind: "read",
            query: { tool: "pact_council_thread_v1", args: { kingdomId: peer } },
            summary: "Read the peer's actual need/constraint before responding; no invented reply",
          };
        }
        if (options.alternating && cell.family === "C02") {
          if (round === 1 && role === "B")
            decision = {
              kind: "wait",
              summary: "The peer requested a counter within their current limit; await revised terms, no new consent.",
            };
          if (round === 2 && role === "B" && offer)
            decision = action(
              { kind: "game.supply.sign", offerId: offer.id, version: offer.version },
              { youSend: terms.bToA, youReceive: terms.aToB },
            );
        }
        if (cell.family === "C01" && round === 0 && !/^[a-f0-9-]{36}$/.test(peer))
          decision = {
            kind: "read",
            query: { tool: "pact_kingdom_discover_v2", args: { limit: 1 } },
            summary: "Read an actual public peer identity; missing discovery is not an empty world.",
          };
        const needsOffer =
          (cell.family === "C01" && ((round === 2 && role === "B") || (round === 3 && role === "A"))) ||
          (cell.family === "C02" && (round === 1 || (round === 2 && (role === "A" || options.alternating))));
        if (needsOffer && !offer)
          decision = {
            kind: "read",
            query: { tool: "pact_observation_read_v2", args: { section: "agreements", limit: 1 } },
            summary: "Current offer record omitted; read its exact peer, version, terms and signatures before consent",
          };
        if (cell.family === "C05") {
          const negotiation = object(payload.negotiation);
          if (
            !rows(negotiation.contracts).some((c) => ["defaulted", "expired"].includes(String(c.status))) &&
            payload.requestedReadTool !== "pact_observation_read_v2" &&
            round === 0
          )
            decision = {
              kind: "read",
              query: { tool: "pact_observation_read_v2", args: { section: "agreements", limit: 10 } },
              summary: "Need original delivery history before evaluating this peer again",
            };
          else {
            const originals = rows(object(packet.negotiationMemory).bundles).flatMap((b) =>
              rows(b.originals).map((o) => object(o.detail)),
            );
            const records = [
              ...rows(negotiation.contracts),
              ...rows(object(payload.requestedRead).records),
              ...originals,
            ];
            const prior = records.find((c) => ["defaulted", "expired"].includes(String(c.status)));
            const defaulted = prior?.status === "defaulted";
            decision = {
              kind: "wait",
              summary: prior
                ? defaulted
                  ? "The observed earlier contract defaulted. No new consent or reliable income is established; reconsider current terms and reserve risk."
                  : "The earlier contract has observed fulfilled installments; that does not guarantee another delivery. No new consent yet."
                : "Historical outcome unavailable in delivered records; no conclusion about fulfillment or future reliability.",
            };
          }
        }
        if (options.correctOnce && index === 0 && !corrected) {
          corrected = true;
          return {
            decision: {
              decision: {
                kind: "wait",
                summary: "No command before continuity validation",
                ...fixtureWaitBasis(request.schema),
              },
              continuity: {
                memories: [
                  {
                    text: "Authored unavailable-evidence correction test",
                    evidenceRefs: ["55555555-5555-4555-8555-555555555555"],
                  },
                ],
              },
            },
            inputTokens: 40,
            outputTokens: 20,
          };
        }
        const evidence = rows(object(packet.continuity).evidence);
        const original = evidence.find((e) => typeof e.id === "string");
        const continuity =
          options.learnOnce && !learned && original && round >= 2
            ? {
                memories: [
                  {
                    text: "Current scoped facts are observed; signatures do not prove delivery.",
                    evidenceRefs: [original.id],
                  },
                ],
              }
            : undefined;
        if (continuity) learned = true;
        if (decision.kind === "wait") decision = { ...decision, ...fixtureWaitBasis(request.schema) };
        const basis = fixtureGoalBasis(request.schema);
        if (decision.kind === "action" && basis)
          decision.expectedOutcome = {
            ...object(decision.expectedOutcome),
            actionKind: object(decision.payload).kind,
            basis,
          };
        return { decision: { decision, ...(continuity ? { continuity } : {}) }, inputTokens: 40, outputTokens: 20 };
      },
    };
    return provider;
  }) as [ModelPort, ModelPort];
  return {
    actors,
    review: (e) => ({
      claims: [],
      reviews: e.actors.flatMap((a) =>
        [
          "factuality",
          ["C01", "C02"].includes(cell.family) ? "dialogue" : cell.family === "C05" ? "history" : "control",
        ].map((category) => {
          const record = e.lifecycle.find(
            (l) =>
              l.actorId === a.actorId &&
              l.stage === (category === "dialogue" ? "dialogue" : "later_decision") &&
              !l.scriptedPrefix,
          );
          return {
            id: `${category}:${a.actorId}`,
            actorId: a.actorId,
            category: category as "factuality" | "dialogue" | "history" | "control",
            verdict: "pass" as const,
            reviewer: "inline-author" as const,
            reasonCode: "AUTHORED_FAKE_OUTPUT_CHECKED",
            sourceRefs: record?.sourceRefs ?? ["unavailable"],
          };
        }),
      ),
    }),
  };
}
