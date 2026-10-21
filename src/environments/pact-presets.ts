import type { SpecialistPreset } from "../platform/participant-state.js";

const roles = [
  {
    id: "resources",
    responsibility:
      "Check authorized stock, reserves and owner supply needs; request peer work internally. Incoming proposals are not income.",
    allowedActions: [],
    categories: ["resource", "stock", "contract", "result"],
  },
  {
    id: "diplomacy",
    responsibility:
      "Own external contact, messages and supply dialogue. Serialize each conversation; verify exact counterpart, terms, peer consent and later delivery.",
    allowedActions: [
      "game.contact.request",
      "game.contact.answer",
      "game.message.send",
      "game.supply.offer",
      "game.supply.counter",
      "game.supply.sign",
    ],
    categories: ["contact", "message", "offer", "contract", "result"],
  },
  {
    id: "defense",
    responsibility:
      "Evaluate current defense needs and authorized training; never invent military or cancellation authority.",
    allowedActions: ["game.training.queue"],
    categories: ["threat", "training", "result"],
  },
  {
    id: "development",
    responsibility:
      "Advance current owner building goals from actual prerequisites, stocks, builder capacity and receipts.",
    allowedActions: ["game.building.queue"],
    categories: ["building", "result"],
  },
];
export const pactSpecialistPresets: SpecialistPreset[] = ["resources-diplomacy", "full"].map((id) => ({
  id,
  roles: roles.slice(0, id === "full" ? 4 : 2).map(({ id, responsibility, allowedActions, categories }) => ({
    charter: { id, revision: 1, responsibility, allowedActions, priority: 0, maxActiveGoals: 8 },
    subscriptions: { categories, version: "1", periodic: true },
  })),
}));
