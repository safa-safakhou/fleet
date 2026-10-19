import { SpecialistCoordinatorEngine } from "../../../src/engines/specialists/coordinator.js";
import type { EngineContext } from "../../../src/platform/engine-registry.js";
import { brokerJournal, FakeReservationBroker } from "./reservation-broker.js";
/** Test composition only. Reuses identical focused prompts/admission; no coordinator model call. */
export class IndependentSubmitCandidate extends SpecialistCoordinatorEngine {
  readonly journal = brokerJournal();
  denials: string[] = [];
  async run(ctx: EngineContext) {
    if (!ctx.validateProposal) throw Error("FIXTURE_VALIDATOR_REQUIRED");
    const broker = new FakeReservationBroker(
      () => ctx.observe({ continuity: true, coordination: true }),
      ctx.validateProposal,
      this.journal,
    );
    let tail = Promise.resolve();
    await this.focusedProposals(ctx, false, async (p) => {
      const own = tail.then(async () => {
        const result = await broker.reserve(p);
        if (!result.admitted) {
          this.denials.push(result.code);
          return;
        }
        if (ctx.signal.aborted) {
          broker.stop();
          return;
        }
        await ctx.commands.submit(ctx.claim, p.intent);
      });
      tail = own.catch(() => {});
      return own;
    });
  }
}
