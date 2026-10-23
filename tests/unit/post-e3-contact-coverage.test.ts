import { expect, it } from "vitest";
import { positiveSpecialistProvider } from "../fixtures/post-e3-provider.js";

const call = (provider: ReturnType<typeof positiveSpecialistProvider>, contacts: unknown[], page: unknown) =>
  provider.provider.decide({
    model: { route: "ollama", model: "qwen3:14b", thinking: false },
    maxOutputTokens: 2000,
    messages: [
      { role: "system", content: "Synthetic fixture only" },
      {
        role: "user",
        content: JSON.stringify({
          specialist: {
            id: "diplomacy",
            ownerIntent: JSON.stringify({ incoming: { resource: "silver" } }),
            state: { goals: [] },
          },
          skills: {},
          evidence: { bundles: [] },
          observation: {
            schemaId: "pact.observation.specialists.v3",
            environmentTime: { value: "0" },
            coverage: { pages: { contacts: page } },
            payload: {
              environment: {
                profile: { kingdomId: "own" },
                contacts,
                openSupplyOffers: [
                  { id: "offer", status: "open", version: 1, terms: { aToB: { wholePerHour: 2 } }, signedBy: [] },
                ],
              },
            },
          },
        }),
      },
    ],
    schema: { type: "object" },
    signal: new AbortController().signal,
  } as never);
it("distinguishes a withheld contact from an observed absence without inventing fresh consent", async () => {
  const provider = positiveSpecialistProvider();
  const first = await call(provider, [{ kingdomId: "peer" }], { observed: 1, delivered: 1, omitted: 0 });
  expect(first.decision).toMatchObject({ decision: { payload: { kind: "game.message.send" } } });
  const withheld = await call(provider, [], { observed: 1, delivered: 0, omitted: 1 });
  expect(withheld.decision).toMatchObject({ decision: { payload: { kind: "game.supply.sign" } } });
  const absent = await call(provider, [], { observed: 0, delivered: 0, omitted: 0 });
  expect(absent.decision).toMatchObject({ decision: { payload: { kind: "game.contact.request" } } });
});
it("does not infer contact from an offer or an omitted page without a prior observed contact", async () => {
  const response = await call(positiveSpecialistProvider(), [], { observed: 1, delivered: 0, omitted: 1 });
  expect(response.decision).toMatchObject({ decision: { kind: "read", query: { tool: "pact_kingdom_discover_v2" } } });
});
