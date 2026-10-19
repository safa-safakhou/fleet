import { checkProposals } from "../../../src/engines/specialists/proposals.js";
import type { Observation, Proposal } from "../../../src/platform/contracts.js";
export const brokerJournal = () => ({ reserved: [] as Proposal[], generation: 0, tail: Promise.resolve() });
/** Fake-only protocol candidate: retained journal plus serialized admission. Never imported by runtime. */
export class FakeReservationBroker {
  constructor(
    private observation: Observation | (() => Promise<Observation>),
    private validate: (p: Proposal, o: Observation) => Promise<{ valid: boolean; code: string }>,
    readonly journal = brokerJournal(),
  ) {}
  async reserve(proposal: Proposal) {
    const generation = this.journal.generation;
    const previous = this.journal.tail;
    let release = () => {};
    this.journal.tail = new Promise<void>((r) => {
      release = r;
    });
    await previous;
    try {
      const deny = (code: string, conflictRefs: string[] = []) => ({ admitted: false, code, conflictRefs });
      if (generation !== this.journal.generation) return deny("BROKER_STOPPED");
      const observation = typeof this.observation === "function" ? await this.observation() : this.observation;
      const current = checkProposals([proposal], observation);
      if (!current.valid) return deny(current.code, current.conflictRefs);
      const result = await this.validate(proposal, observation);
      if (generation !== this.journal.generation) return deny("BROKER_STOPPED");
      if (!result.valid) return deny(result.code);
      const old = this.journal.reserved.find((p) => p.intent.commandId === proposal.intent.commandId);
      if (old)
        return {
          admitted: JSON.stringify(old) === JSON.stringify(proposal),
          code: "ORIGINAL_RESERVATION",
          conflictRefs: [],
        };
      const checked = checkProposals([...this.journal.reserved, proposal], observation);
      if (checked.valid) this.journal.reserved.push(structuredClone(proposal));
      return { admitted: checked.valid, code: checked.code, conflictRefs: checked.conflictRefs };
    } finally {
      release();
    }
  }
  stop() {
    this.journal.generation++;
  }
  release(commandId: string) {
    this.journal.reserved = this.journal.reserved.filter((p) => p.intent.commandId !== commandId);
  }
}
