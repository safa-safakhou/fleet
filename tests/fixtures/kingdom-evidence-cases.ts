import type { DecisionEvidence } from "../../src/platform/evidence-decision.js";

/** Synthetic exact-arithmetic oracle only; PACT application handlers own real game rules. */
export function kingdomEvidenceCases() {
  return [
    {
      id: "kingdom-a",
      gold: "120",
      reserve: "20",
      offers: [
        { id: "a", cost: "140", iron: "300" },
        { id: "b", cost: "80", iron: "200" },
        { id: "c", cost: "110", iron: "250" },
      ],
      delivery: "unknown" as const,
    },
    {
      id: "kingdom-b",
      gold: "240",
      reserve: "20",
      offers: [
        { id: "a", cost: "140", iron: "300" },
        { id: "b", cost: "80", iron: "200" },
        { id: "c", cost: "110", iron: "250" },
      ],
      delivery: "pending" as const,
    },
    {
      id: "kingdom-c",
      gold: "100",
      reserve: "100",
      offers: [
        { id: "a", cost: "1", iron: "300" },
        { id: "b", cost: "80", iron: "200" },
      ],
      delivery: "unknown" as const,
    },
    {
      id: "kingdom-d",
      gold: "9007199254740993120",
      reserve: "9007199254740993020",
      offers: [
        { id: "a", cost: "101", iron: "999" },
        { id: "b", cost: "100", iron: "450" },
        { id: "c", cost: "80", iron: "250" },
      ],
      delivery: "known" as const,
    },
  ].map((input, index) => {
    const available = (BigInt(input.gold) - BigInt(input.reserve)).toString();
    const feasible = input.offers.filter((o) => BigInt(o.cost) <= BigInt(available));
    const best = [...feasible].sort((a, b) => (BigInt(a.iron) > BigInt(b.iron) ? -1 : 1))[0];
    const delivery =
      input.delivery === "known"
        ? { id: "delivery", state: "known" as const, value: { receiptId: `receipt-${input.id}`, deliveredIron: "17" } }
        : { id: "delivery", state: input.delivery };
    const facts: DecisionEvidence["facts"] = [
      { id: "gold", state: "known", value: input.gold },
      { id: "reserve", state: "known", value: input.reserve },
      { id: "spendable", state: "known", value: available },
      {
        id: "offers",
        state: "known",
        value: feasible.map((o) => ({
          id: `${input.id}:${o.id}`,
          cost: o.cost,
          iron: o.iron,
          remainingGold: (BigInt(input.gold) - BigInt(o.cost)).toString(),
        })),
      },
      delivery,
      { id: "pendingRequest", state: "known", value: { requestId: `request-${input.id}`, status: "answer-required" } },
    ];
    const evidence: DecisionEvidence = {
      bindingId: input.id,
      revision: `snapshot-${100 + index}`,
      choices: [...feasible.map((o) => `${input.id}:${o.id}`), "wait"],
      facts,
      requiredFacts: facts.map((f) => f.id),
    };
    return {
      input,
      evidence,
      expectedChoice: best ? `${input.id}:${best.id}` : "wait",
      canary: `PRIVATE-CONTEXT-${input.id}-ONLY`,
    };
  });
}

export function heldOutKingdomEvidenceCases(long = false) {
  const inputs = long
    ? [
        {
          id: "kingdom-i",
          gold: "377",
          reserve: "51",
          offers: [
            { id: "x", cost: "226", iron: "701" },
            { id: "y", cost: "300", iron: "701" },
            { id: "z", cost: "325", iron: "690" },
          ],
        },
        {
          id: "kingdom-j",
          gold: "410",
          reserve: "180",
          offers: [
            { id: "x", cost: "230", iron: "370" },
            { id: "y", cost: "170", iron: "800" },
            { id: "z", cost: "280", iron: "999" },
          ],
        },
        { id: "kingdom-k", gold: "93", reserve: "93", offers: [{ id: "x", cost: "1", iron: "999" }] },
        {
          id: "kingdom-l",
          gold: "9007199254740993999",
          reserve: "9007199254740993000",
          offers: [
            { id: "x", cost: "1000", iron: "9999" },
            { id: "y", cost: "999", iron: "600" },
            { id: "z", cost: "222", iron: "333" },
          ],
        },
      ]
    : [
        {
          id: "kingdom-e",
          gold: "175",
          reserve: "35",
          offers: [
            { id: "a", cost: "100", iron: "400" },
            { id: "b", cost: "140", iron: "400" },
            { id: "c", cost: "130", iron: "350" },
          ],
        },
        {
          id: "kingdom-f",
          gold: "210",
          reserve: "80",
          offers: [
            { id: "a", cost: "130", iron: "275" },
            { id: "b", cost: "120", iron: "500" },
            { id: "c", cost: "160", iron: "999" },
          ],
        },
        { id: "kingdom-g", gold: "77", reserve: "77", offers: [{ id: "a", cost: "1", iron: "999" }] },
        {
          id: "kingdom-h",
          gold: "9007199254740993555",
          reserve: "9007199254740993000",
          offers: [
            { id: "a", cost: "556", iron: "1000" },
            { id: "b", cost: "550", iron: "600" },
            { id: "c", cost: "111", iron: "333" },
          ],
        },
      ];
  return inputs.map((input, index) => {
    const spendable = BigInt(input.gold) - BigInt(input.reserve),
      feasible = input.offers.filter((o) => BigInt(o.cost) <= spendable);
    const scores: Record<string, string> = Object.fromEntries([
      ...feasible.map((o) => [`${input.id}:${o.id}`, o.iron]),
      ["wait", "0"],
    ]);
    const highest = Object.values(scores).reduce((best, score) => (BigInt(score) > best ? BigInt(score) : best), 0n);
    const expectedChoices = Object.keys(scores).filter((id) => BigInt(scores[id]) === highest);
    const facts: DecisionEvidence["facts"] = [
      { id: "gold", state: "known", value: input.gold },
      { id: "reserve", state: "known", value: input.reserve },
      { id: "spendable", state: "known", value: spendable.toString() },
      {
        id: "offers",
        state: "known",
        value: feasible.map((o) => ({ id: `${input.id}:${o.id}`, iron: o.iron, cost: o.cost })),
      },
      { id: "delivery", state: index === 1 ? "pending" : "unknown" },
      { id: "pendingRequest", state: "known", value: { requestId: `pending-${input.id}`, status: "answer-required" } },
    ];
    const evidence: DecisionEvidence = {
      bindingId: input.id,
      revision: `fresh-${long ? "long" : "short"}-${index}`,
      choices: Object.keys(scores),
      choicePolicy: { kind: "maximize_integer", scores },
      facts,
      requiredFacts: facts.map((f) => f.id),
    };
    return { input, evidence, expectedChoices, canary: `ONLY-${input.id}-PRIVATE-CONTEXT` };
  });
}
