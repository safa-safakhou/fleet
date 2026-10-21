import { randomUUID } from "node:crypto";
import { type Data, type ModelPort, object } from "../../src/domain.js";
import { supplyRoutineCandidate, supplyRoutineKind } from "../../src/environments/pact-skills.js";
import { expandFactTables } from "../../src/fact-table.js";

const rows = (x: unknown): Data[] => (Array.isArray(x) ? x.map(object) : []);
const terms = {
  aToB: { resource: "iron", wholePerHour: 2 },
  bToA: { resource: "silver", wholePerHour: 1 },
  aBond: null,
  bBond: null,
  durationHours: 1,
  noticeHours: 0,
};
/** Authored fake only. No fixture/evaluator, private peer data or database access.
 * Each kingdom's state contains only its own delivered observations/replies. */
export function positiveSpecialistProvider() {
  const states = new Map<
    string,
    {
      peer?: string;
      contactRequested?: boolean;
      messageSent?: boolean;
      goalId?: string;
      learned?: boolean;
      offered?: boolean;
      countered?: boolean;
      signed?: string;
    }
  >();
  const trace: Data[] = [];
  const bindings = new Map<string, string>();
  const result = { maximumBytes: 0, wakeAt: 0, extractions: 0, trace, provider: undefined as unknown as ModelPort };
  result.provider = {
    decide: async (request) => {
      result.maximumBytes = Math.max(
        result.maximumBytes,
        Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
      );
      const packet = object(expandFactTables(JSON.parse(request.messages[1].content))),
        specialist = object(packet.specialist),
        observation = object(packet.observation),
        payload = object(observation.payload),
        env = object(payload.environment ?? payload.world),
        minute = Number(object(observation.environmentTime).value) / 60000;
      const originals = rows(object(packet.evidence).bundles).flatMap((b) => rows(b.originals));
      const ref = object(payload.requestedRead).originalId;
      const answer = ref
        ? object(object(object(originals.find((o) => o.id === ref)).detail).payload).requestedRead
        : payload.requestedRead;
      const current = object(answer),
        records = rows(current.records),
        scope = String(originals[0]?.bindingId ?? "");
      const identity = object(env.profile).kingdomId ?? current.ownerKingdomId;
      if (typeof identity === "string" && scope) bindings.set(scope, identity);
      const own = String(identity ?? bindings.get(scope) ?? "unavailable");
      let s = states.get(own);
      if (!s) {
        s = {};
        states.set(own, s);
      }
      const reply = (decision: Data, update?: Data) => {
        trace.push({
          own,
          role: specialist.id,
          minute,
          schemaBytes: Buffer.byteLength(JSON.stringify(request.schema)),
          fieldBytes: Object.fromEntries(
            Object.entries(packet).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]),
          ),
          ...decision,
        });
        return { decision: { decision, ...(update ? { update } : {}) }, inputTokens: 20, outputTokens: 20 };
      };
      const wait = (summary = "No additional effect or completed delivery is claimed.") =>
        reply({ kind: "wait", summary });
      const read = (tool: string, args: Data) =>
        reply({ kind: "read", query: { tool, args }, summary: "Read actual authorized facts before deciding." });
      const act = (action: Data) =>
        reply({
          kind: "action",
          schemaId: "pact.action.v1",
          payload: action,
          ...(String(action.kind).startsWith("game.supply.")
            ? {
                expectedOutcome: {
                  trade: { youSend: roleA ? terms.aToB : terms.bToA, youReceive: roleA ? terms.bToA : terms.aToB },
                },
              }
            : {}),
          summary: "Proposed next step only; no peer consent or delivery is claimed.",
        });
      if (specialist.id !== "diplomacy") return wait();
      const ownGoal = JSON.parse(String(specialist.ownerIntent));
      const roleA = ownGoal.receive === "silver";
      const priorGoal = rows(object(specialist.state).goals).find((g) => g.id === s.goalId);
      if (rows(object(packet.skills).templates).length) {
        const opportunity = rows(object(packet.skills).opportunities)[0];
        const source = originals.find(
          (o) =>
            (opportunity.sourceIds as string[]).includes(String(o.id)) &&
            object(object(o.detail).payload).requestedRead &&
            object(object(object(o.detail).payload).requestedRead).section === "agreements",
        );
        if (!source || !opportunity) throw Error("WHOLE_DELIVERED_SOURCE_REQUIRED");
        result.extractions++;
        s.learned = true;
        return {
          decision: {
            decision: { kind: "wait", summary: "Unproven exact routine hypothesis only; no delivery is claimed." },
            proposals: [supplyRoutineCandidate(String(source.id), String((opportunity.episodeIds as string[])[0]))],
          },
          inputTokens: 20,
          outputTokens: 20,
        };
      }
      if (priorGoal && !s.learned) {
        if (!rows(object(packet.skills).opportunities).length) return read("pact_kingdom_discover_v2", { limit: 1 });
        return reply({
          kind: "read",
          query: { skillSchema: true },
          summary: "Request separately accounted routine extraction from delivered originals.",
        });
      }
      if (s.learned)
        return wait(
          "The retained exact goal awaits guarded reuse or actual outcome; no new authority or completion is claimed.",
        );
      if (object(packet.coverage).decisionMode === "evidence_review_only")
        return wait("Full current action context is unavailable; no action is claimed.");
      const contacts = rows(env.contacts),
        attention = rows(object(env.socialAttention).records);
      s.peer ??=
        String(
          contacts[0]?.kingdomId ??
            records.find((r) => r.counterpartyKingdomId)?.counterpartyKingdomId ??
            rows(current.kingdoms)[0]?.kingdomId ??
            "",
        ) || undefined;
      if (!s.peer) return read("pact_kingdom_discover_v2", { limit: 1 });
      const peer = s.peer;
      const connected = contacts.some((c) => c.kingdomId === peer);
      if (!connected) {
        const incoming = [...records, ...attention, ...rows(env.contactRequests)].find(
          (r) => r.type === "ContactRequest" && r.direction === "incoming" && r.status === "pending",
        );
        if (incoming) return act({ kind: "game.contact.answer", requestId: incoming.id, accept: true });
        if (roleA && !s.contactRequested) {
          s.contactRequested = true;
          return act({
            kind: "game.contact.request",
            recipientKingdomId: peer,
            note: "I need Silver and can send Iron. May we discuss terms?",
          });
        }
        return wait("Contact permission does not prove peer acceptance; await actual contact.");
      }
      if (!s.messageSent) {
        s.messageSent = true;
        return act({
          kind: "game.message.send",
          recipientKingdomId: peer,
          body: roleA
            ? "I need 1 Silver/hour and can send at most 2 Iron/hour for one hour, without bonds."
            : "I need 2 Iron/hour and can send at most 1 Silver/hour for one hour, without bonds.",
        });
      }
      // The authored proposal states only this owner's need/limit. A proposal
      // does not claim to quote a peer or infer their consent; each peer decides
      // against its own actual objective and the delivered current offer.
      const offer = [...records, ...attention, ...rows(env.openSupplyOffers)].find(
        (r) => (r.type === "SupplyOffer" || r.type === undefined) && r.status === "open",
      );
      if (!offer) {
        if (s.signed) return wait("A signature is not fulfillment; await ordinary settlement and later facts.");
        if (roleA && !s.offered) {
          s.offered = true;
          return act({ kind: "game.supply.offer", counterpartyKingdomId: peer, terms, expiryMinutes: 60 });
        }
        if (current.section !== "agreements")
          return read("pact_observation_read_v2", { section: "agreements", limit: 1 });
        return wait();
      }
      if (Number(object(object(offer.terms).aToB).wholePerHour) > 2) {
        if (roleA && !s.countered) {
          s.countered = true;
          return act({
            kind: "game.supply.counter",
            offerId: offer.id,
            expectedVersion: offer.version,
            terms,
            expiryMinutes: 60,
          });
        }
        return wait("Current offer exceeds the stated constraint; await revised terms.");
      }
      // Learning is optional and takes a later review before reuse. Preserve a
      // full hour of offer validity; otherwise prioritize the ordinary signature.
      if (
        !roleA &&
        Number(offer.version) >= 2 &&
        !s.goalId &&
        Number(offer.expiresGameTimeMs) - minute * 60000 >= 3600000
      ) {
        const source = originals.find((o) =>
          rows(object(object(object(o.detail).payload).requestedRead).records).some(
            (r) => r.type === "SupplyOffer" && r.id === offer.id && r.version === offer.version,
          ),
        );
        if (!source) return read("pact_observation_read_v2", { section: "agreements", recordId: offer.id, limit: 1 });
        s.goalId = randomUUID();
        result.wakeAt = Date.now() + 1000;
        return reply(
          {
            kind: "wait",
            summary: "Retain this exact supply goal before later guarded reuse; no consent or fulfillment is claimed.",
          },
          {
            goals: [
              {
                id: s.goalId,
                parentId: null,
                objective: "Receive the exact agreed Iron supply within the current owner limit",
                rationale: "This whole delivered offer and the authenticated owner need",
                status: "active",
                evidenceIds: [source.id],
                assessment: "Actual full ordinary installments, never a receipt alone",
                routine: {
                  kind: supplyRoutineKind,
                  parameters: {
                    offerId: offer.id,
                    version: offer.version,
                    counterpartyKingdomId: offer.counterpartyKingdomId ?? peer,
                    termsJson: JSON.stringify(offer.terms),
                    minimumIron: "0",
                    minimumSilver: "0",
                    minimumGrain: "0",
                    assessmentDeadlineGameTimeMs: String(BigInt(String(offer.expiresGameTimeMs)) + 7200000n),
                  },
                },
                wake: "actual delivery or default",
              },
            ],
            memories: [
              {
                id: randomUUID(),
                kind: "interpretation",
                text: "The delivered exact offer is a proposal; signatures and full delivery require separate evidence.",
                evidenceIds: [source.id],
                uncertainty: "No present fulfillment or future reliability inferred.",
              },
            ],
            predictions: [],
            plan: null,
            messages: [],
            wakeConditions: [
              { kind: "deadline", at: { clockId: "utc", value: new Date(result.wakeAt).toISOString() } },
            ],
          },
        );
      }
      const signed = Array.isArray(offer.signedBy) ? offer.signedBy : [];
      const signature = `${offer.id}:${offer.version}`;
      if (!signed.includes(own) && s.signed !== signature) {
        s.signed = signature;
        return act({ kind: "game.supply.sign", offerId: offer.id, version: offer.version });
      }
      return wait();
    },
  };
  return result;
}
