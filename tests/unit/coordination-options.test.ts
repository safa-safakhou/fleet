import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { checkProposals, type Proposal } from "../../src/engines/specialists/proposals.js";
import { brokerJournal, FakeReservationBroker } from "../fixtures/engines/reservation-broker.js";

const frame = {
  schemaVersion: "fleet.coordination.v1" as const,
  atomicExpectedVersion: true as const,
  claimSchemas: [
    { id: "energy.v1", kind: "resource" as const },
    { id: "authority.v1", kind: "authority" as const },
    { id: "promise.v1", kind: "promise" as const },
  ],
  capacities: [
    { schemaId: "energy.v1", key: "shared", remainingUnits: "50" },
    { schemaId: "authority.v1", key: "writes", remainingUnits: "2" },
  ],
  promises: [],
  focuses: [],
  ownerPriorities: {},
  coverage: {},
};
const observation = {
  schemaId: "fixture.v1",
  revision: "1",
  observedAt: "2026-10-17T12:00:00Z",
  environmentTime: { clockId: "fixture.tick", value: "1" },
  sourceRefs: ["owned:1"],
  payload: {},
  coverage: {},
  coordination: frame,
};
function proposal(units = "40", promise?: string): Proposal {
  return {
    taskId: "parent",
    intent: { commandId: randomUUID(), bindingId: "binding", schemaId: "move.v1", expectedVersion: "1", payload: {} },
    evidenceRefs: ["owned:1"],
    expectedOutcome: { hypothesis: "Useful" },
    claims: [
      { schemaId: "energy.v1", kind: "resource", key: "shared", units },
      { schemaId: "authority.v1", kind: "authority", key: "writes", units: "1" },
      ...(promise ? [{ schemaId: "promise.v1", kind: "promise" as const, key: "harbor", value: promise }] : []),
    ],
    conflicts: [],
  };
}
it("rejects defense and negotiation sharing insufficient stock or authority exactly", () => {
  expect(checkProposals([proposal(), proposal()], observation)).toMatchObject({
    valid: false,
    code: "STRUCTURED_CAPACITY_CONFLICT",
  });
  expect(checkProposals([proposal("0"), proposal("0"), proposal("0")], observation)).toMatchObject({ valid: false });
});
it("rejects incompatible structured promises even for two individually legal messages", () => {
  const a = proposal("0", "west"),
    b = proposal("0", "east");
  expect(checkProposals([a], observation).valid).toBe(true);
  expect(checkProposals([b], observation).valid).toBe(true);
  expect(checkProposals([a, b], observation)).toMatchObject({ valid: false, code: "STRUCTURED_PROMISE_CONFLICT" });
});
it("rejects stale, expired, foreign-source and unknown claim proposals", () => {
  const p = proposal("0");
  expect(checkProposals([p], { ...observation, revision: "2" }).valid).toBe(false);
  expect(checkProposals([{ ...p, evidenceRefs: ["foreign"] }], observation).valid).toBe(false);
  expect(checkProposals([{ ...p, validUntil: { clockId: "fixture.tick", value: "1" } }], observation).valid).toBe(
    false,
  );
  expect(
    checkProposals(
      [{ ...p, claims: [{ schemaId: "invented", kind: "resource", key: "shared", units: "1" }] }],
      observation,
    ).valid,
  ).toBe(false);
});
it("the fake independent broker reserves resource and promise conflicts without inventing authority", async () => {
  const broker = new FakeReservationBroker(observation, async () => ({ valid: true, code: "CHECKED" }));
  expect(await broker.reserve(proposal())).toMatchObject({ admitted: true });
  expect(await broker.reserve(proposal())).toMatchObject({ admitted: false });
  const promises = new FakeReservationBroker(observation, async () => ({ valid: true, code: "CHECKED" }));
  expect((await promises.reserve(proposal("0", "west"))).admitted).toBe(true);
  expect((await promises.reserve(proposal("0", "east"))).admitted).toBe(false);
});

it("fake broker rejects a declaration the environment cannot verify", async () => {
  const broker = new FakeReservationBroker(observation, async () => ({ valid: false, code: "BAD_EFFECTS" }));
  expect((await broker.reserve(proposal("0"))).admitted).toBe(false);
});

it("fake broker retains reservations across restart and rejects stopped late validation", async () => {
  const journal = brokerJournal(),
    valid = async () => ({ valid: true, code: "CHECKED" });
  const first = new FakeReservationBroker(observation, valid, journal);
  expect((await first.reserve(proposal())).admitted).toBe(true);
  const restarted = new FakeReservationBroker(observation, valid, journal);
  expect((await restarted.reserve(proposal())).admitted).toBe(false);
  let ready = () => {};
  const delayed = new FakeReservationBroker(
    observation,
    async () => {
      await new Promise<void>((r) => {
        ready = r;
      });
      return valid();
    },
    journal,
  );
  const pending = delayed.reserve(proposal("0"));
  await Promise.resolve();
  await Promise.resolve();
  delayed.stop();
  ready();
  expect((await pending).admitted).toBe(false);
  expect(journal.reserved).toHaveLength(1);
});
