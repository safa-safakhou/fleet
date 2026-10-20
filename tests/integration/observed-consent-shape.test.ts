import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { afterEach, expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it.each([
  [false, false, false],
  [true, false, false],
  [false, true, false],
  [true, true, false],
  [false, false, true],
  [true, false, true],
])(
  "can consent to an observed offer without another lookup, cognition=%s corrective=%s paged=%s",
  async (cognition, corrective, paged) => {
    const f = await fixture();
    close = () => f.pool.end();
    const cohort = await ready(f.store, 1);
    if (cognition)
      await f.pool.query('UPDATE cohorts SET model=model||\'{"cognition":"llm-centered-v1"}\'::jsonb WHERE id=$1', [
        cohort,
      ]);
    const claim = await f.store.claim("consent-shape");
    if (!claim) throw Error("MISSING_CLAIM");
    const peer = randomUUID(),
      offerId = randomUUID();
    if (corrective) {
      const feedback = {
        code: "PACT_DUPLICATE_NEGOTIATION",
        actionKind: "game.supply.offer",
        detail: { existingId: offerId, version: 1, state: "open" },
      };
      await f.store.rememberDecisionFeedback(claim, feedback);
      claim.agent.decision_feedback_cipher = f.store.vault.encrypt(feedback, `decision-feedback:${claim.agentId}`);
      claim.agent.decision_feedback_at = f.now();
    }
    const game = new FakeGame(claim),
      read = game.read.bind(game);
    game.read = async (tool, args) => {
      const result = await read(tool, args);
      if (tool === "pact_world_read_v1")
        return {
          ...result,
          asOfGameTimeMs: 1000,
          ambition: "Develop useful supplies under current authority. ".repeat(40),
        };
      if (tool !== "pact_agent_guide_v1") return result;
      return {
        ...result,
        asOfGameTimeMs: 1000,
        mandate: { version: 1, allowedActions: ["supply.sign", "contact.request"] },
        openSupplyOffers: [
          {
            id: offerId,
            version: 1,
            kingdomA: claim.agent.kingdom_id,
            kingdomB: peer,
            counterpartyKingdomId: peer,
            signedBy: [],
            status: "open",
            expiresGameTimeMs: "2000",
            terms: {
              aToB: null,
              bToA: { resource: "grain", wholePerHour: 10 },
              aBond: null,
              bBond: null,
              durationHours: 72,
              noticeHours: 0,
            },
          },
        ],
      };
    };
    const adapter = paged
      ? {
          ...pactAdapter,
          availableActions: (...args: Parameters<NonNullable<typeof pactAdapter.availableActions>>) => {
            const capability = pactAdapter.availableActions?.(...args);
            if (!capability) throw Error("MISSING_CAPABILITY");
            const contact = pactAdapter.actionSchema("game.contact.request"),
              properties = object(contact.properties);
            return {
              ...capability,
              schemas: [
                ...capability.schemas,
                {
                  ...contact,
                  properties: {
                    ...properties,
                    note: {
                      ...object(properties.note),
                      enum: Array.from({ length: 2000 }, (_, n) => `Synthetic greeting ${n}`),
                    },
                  },
                },
              ],
            };
          },
        }
      : pactAdapter;
    let calls = 0;
    const admitted: boolean[] = [];
    await new Engine(
      f.store,
      {
        decide: async (input) => {
          calls++;
          const context = JSON.parse(input.messages[1].content);
          const decision =
            calls === 1
              ? {
                  kind: "action",
                  action: { kind: "game.supply.sign", offerId, version: 1 },
                  summary: "Give own first consent; peer consent and delivery remain unverified",
                }
              : { kind: "wait", summary: "Await the peer; no delivery yet" };
          const response = cognition
            ? {
                cognition: {
                  expectedVersion: object(context.cognition).version,
                  analysis: { type: "none", reason: "No new interpretation" },
                },
                decision,
              }
            : decision;
          const valid = new Ajv({ strict: false, validateFormats: false }).compile(input.schema)(response);
          admitted.push(valid);
          expect(
            Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
          ).toBeLessThanOrEqual(24000);
          return {
            decision: valid
              ? response
              : cognition
                ? {
                    cognition: {
                      expectedVersion: object(context.cognition).version,
                      analysis: { type: "none", reason: "No representable consent yet" },
                    },
                    decision: { kind: "wait", summary: "Cannot emit consent under this grammar" },
                  }
                : { kind: "wait", summary: "Cannot emit consent under this grammar" },
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      async () => game,
      true,
      adapter,
    ).run(claim);
    expect(admitted[0], "Observed consent must be representable in the actual native generation schema").toBe(true);
    expect(calls).toBe(2);
    expect(game.submits.map((s) => s.action)).toEqual([{ kind: "game.supply.sign", offerId, version: 1 }]);
    expect(game.reads.some((r) => r.tool === "fleet_action_schema")).toBe(false);
  },
);
