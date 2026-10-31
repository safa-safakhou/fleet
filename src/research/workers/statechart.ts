import { createMachine, initialTransition, transition } from "xstate";
import { z } from "zod";
import { FleetError } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import { type DecisionProposal, ProposalSchema } from "../broker/server.js";
import { Decimal, digest } from "../contracts.js";
export const POLICY_VERSION = "pact-scripted@1";
export type PolicyInput = {
  eventRef: string;
  nowUtc: string;
  maxObservationAgeMs: number;
  clock: { clockId: string; value: string; paused: boolean };
  deadline: { clockId: string; value: string };
  authority: "actor" | "advisory";
  observation: Observation;
  candidate?: DecisionProposal;
};
const CheckpointSchema = z
  .object({
    policyVersion: z.literal(POLICY_VERSION),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: z.object({ value: z.enum(["selected", "waiting", "advising"]) }).strict(),
    consumedEvents: z.array(z.string()).length(1),
    proposal: ProposalSchema,
    proposalId: z.string().regex(/^[a-f0-9]{64}$/),
    trace: z
      .object({ from: z.literal("ready"), to: z.enum(["selected", "waiting", "advising"]), eventRef: z.string() })
      .strict(),
  })
  .strict();
export type PolicyCheckpoint = z.infer<typeof CheckpointSchema>;
// Closed machine: no invokes, actors, effects, clocks, randomness or entry/exit actions.
const machine = createMachine({
  id: POLICY_VERSION,
  initial: "ready",
  states: {
    ready: { on: { SELECT: "selected", WAIT: "waiting", ADVISE: "advising" } },
    selected: {},
    waiting: {},
    advising: {},
  },
});
export class StatechartPolicy {
  step(input: PolicyInput, checkpoint?: unknown) {
    const { observation: o, clock, deadline } = input;
    if (
      clock.clockId !== "pact.game-time-ms" ||
      o.environmentTime.clockId !== clock.clockId ||
      deadline.clockId !== clock.clockId ||
      o.environmentTime.value !== clock.value
    )
      throw new FleetError("CLOCK_INCOMPATIBLE", true);
    Decimal.parse(clock.value);
    Decimal.parse(deadline.value);
    const age = Date.parse(input.nowUtc) - Date.parse(o.observedAt);
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      !Number.isSafeInteger(input.maxObservationAgeMs) ||
      input.maxObservationAgeMs < 0 ||
      age > input.maxObservationAgeMs
    )
      throw new FleetError("OBSERVATION_STALE", true);
    const identity = digest(input);
    if (checkpoint) {
      const cp = CheckpointSchema.safeParse(checkpoint);
      if (!cp.success || cp.data.proposalId !== digest(cp.data.proposal))
        throw new FleetError("CHECKPOINT_INCOMPATIBLE", true);
      if (cp.data.inputDigest !== identity || cp.data.consumedEvents[0] !== input.eventRef)
        throw new FleetError("POLICY_CHECKPOINT_TERMINAL", true);
      return { proposal: cp.data.proposal, checkpoint: cp.data, trace: cp.data.trace };
    }
    let proposal: DecisionProposal;
    if (clock.paused || BigInt(clock.value) >= BigInt(deadline.value) || !input.candidate)
      proposal = {
        kind: "wait",
        payload: { reason: clock.paused ? "CLOCK_PAUSED" : "NO_ADMITTED_WORK" },
        sourceRefs: o.sourceRefs,
        preconditions: {},
      };
    else {
      proposal = ProposalSchema.parse(input.candidate);
      if (proposal.kind === "read") throw new FleetError("POLICY_CANDIDATE_INVALID", true);
      if (!proposal.sourceRefs.length || proposal.sourceRefs.some((ref) => !o.sourceRefs.includes(ref)))
        throw new FleetError("SOURCE_REF_REQUIRED", true);
      if (input.authority === "advisory" && proposal.kind === "action")
        proposal = {
          kind: "advisory",
          payload: { recommendation: proposal.payload },
          sourceRefs: proposal.sourceRefs,
          preconditions: {},
        };
      if (proposal.kind === "action")
        proposal = {
          ...proposal,
          preconditions: { revision: o.revision, clockId: clock.clockId, clockValue: clock.value },
        };
    }
    const [initial, initialActions] = initialTransition(machine),
      [next, actions] = transition(machine, initial, {
        type: proposal.kind === "action" ? "SELECT" : proposal.kind === "advisory" ? "ADVISE" : "WAIT",
      });
    if (initialActions.length || actions.length) throw new FleetError("POLICY_EFFECT_FORBIDDEN", true);
    const trace = { from: "ready" as const, to: next.value, eventRef: input.eventRef };
    const cp = CheckpointSchema.parse({
      policyVersion: POLICY_VERSION,
      inputDigest: identity,
      snapshot: { value: next.value },
      consumedEvents: [input.eventRef],
      proposal,
      proposalId: digest(proposal),
      trace,
    });
    return { proposal, checkpoint: cp, trace: cp.trace };
  }
}
