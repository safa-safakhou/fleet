import { FleetError } from "./domain.js";
import { designDigest, type NegotiationCell } from "./negotiation-plan.js";
import type {
  NegotiationBinding,
  NegotiationExecutionPorts,
  NegotiationGrant,
  NegotiationGuardInput,
  ProtocolPreview,
} from "./negotiation-run.js";
/** Shared unchanged native accounting rules for sequential and concurrent cells. */
export function createNegotiationCellGuard(input: {
  ports: NegotiationExecutionPorts;
  protocol: ProtocolPreview;
  grant: NegotiationGrant;
  cell: NegotiationCell;
  binding: NegotiationBinding;
  cutoff: number;
  controller: AbortController;
  onOperationalFailure: () => void;
}) {
  const { ports, protocol, grant, cell, binding, cutoff, controller, onOperationalFailure } = input;
  return async (input: NegotiationGuardInput) => {
    try {
      if (controller.signal.aborted) throw new FleetError("NEGOTIATION_ADMISSION_CLOSED", true);
      if (!Number.isSafeInteger(ports.now())) throw new FleetError("NEGOTIATION_CLOCK_UNAVAILABLE", true);
      if (ports.now() < Date.parse(grant.startsAt) || ports.now() >= cutoff)
        throw new FleetError("NEGOTIATION_CUTOFF", true);
      // Sources/model/settings may drift after the first cell or during a response.
      const actual = await ports.preflight(protocol, grant);
      if (
        !actual.owned ||
        !actual.evidenceReady ||
        designDigest(actual.sources) !== designDigest(grant.sources) ||
        actual.modelDigest !== grant.modelDigest ||
        actual.policyDigest !== grant.policyDigest ||
        actual.settingsDigest !== grant.settingsDigest
      )
        throw new FleetError("NEGOTIATION_SOURCE_OR_SCOPE_DRIFT", true);
      const a = await ports.accounting(binding);
      if (
        !a.ownershipValid ||
        !a.privacyValid ||
        !a.authorityValid ||
        a.duplicateEffects ||
        a.uncertainCommands.length ||
        a.allocations.some((row) => row.status === "unknown")
      )
        throw new FleetError("NEGOTIATION_OPERATIONAL_STOP", true);
      if (
        !Number.isFinite(Date.parse(a.deadlineAt)) ||
        a.limitsDigest !== designDigest(cell.limits) ||
        designDigest(a.profile) !== designDigest(cell.profile) ||
        Date.parse(a.deadlineAt) > cutoff ||
        Date.parse(a.deadlineAt) <= ports.now()
      )
        throw new FleetError("NEGOTIATION_NATIVE_LIMITS_DRIFT", true);
      const ids = new Set(a.allocations.map((row) => row.id));
      if (ids.size !== a.allocations.length) throw new FleetError("DUPLICATE_NATIVE_ALLOCATION", true);
      if (
        a.allocations.some(
          (row) =>
            !binding.actorIds.includes(row.actorId) ||
            row.reservedTokens !== 40000 ||
            (row.outputTokens ?? 0) > cell.limits.outputTokens ||
            (row.inputTokens ?? 0) + (row.outputTokens ?? 0) > row.reservedTokens ||
            (row.status === "reserved" && row.turnId !== input.turnId),
        )
      )
        throw new FleetError("NEGOTIATION_ALLOCATION_SCOPE", true);
      if (a.turns.some((t) => !binding.actorIds.includes(t.actorId)))
        throw new FleetError("NEGOTIATION_TURN_SCOPE", true);
      const before = input.phase === "call",
        calls = a.allocations.length,
        reserved = a.allocations.reduce((sum, row) => sum + row.reservedTokens, 0);
      if (
        calls + (before ? 1 : 0) > cell.limits.callsPerWorld ||
        reserved + (before ? 40000 : 0) > cell.limits.reservedTokensPerWorld
      )
        throw new FleetError("NEGOTIATION_NATIVE_BUDGET_EXHAUSTED", true);
      if (input.phase === "turn" && a.inFlight !== 0) throw new FleetError("NEGOTIATION_OPERATION_IN_FLIGHT", true);
      if (input.phase !== "clock") {
        if (!input.actorId || !binding.actorIds.includes(input.actorId))
          throw new FleetError("NEGOTIATION_ACTOR_SCOPE", true);
        const turns = new Set(a.turns.filter((t) => t.actorId === input.actorId).map((t) => t.turnId));
        if (turns.size + (input.phase === "turn" ? 1 : 0) > cell.limits.turnsPerActor)
          throw new FleetError("NEGOTIATION_TURN_CAP", true);
        const own = a.allocations.filter((row) => row.actorId === input.actorId && row.turnId === input.turnId);
        if (own.length + (before ? 1 : 0) > 3) throw new FleetError("NEGOTIATION_CALLS_PER_TURN", true);
      }
      if (BigInt(a.gameTimeMs) - BigInt(a.startGameTimeMs) > BigInt(cell.limits.gameHorizonMinutes) * 60000n)
        throw new FleetError("NEGOTIATION_GAME_HORIZON", true);
      if (input.phase === "clock") {
        if (
          cell.clockMode !== "controlled" ||
          a.inFlight !== 0 ||
          !input.targetGameTimeMs ||
          input.targetGameTimeMs !== a.nextScheduledGameTimeMs ||
          BigInt(input.targetGameTimeMs) < BigInt(a.gameTimeMs) ||
          BigInt(input.targetGameTimeMs) - BigInt(a.startGameTimeMs) > BigInt(cell.limits.gameHorizonMinutes) * 60000n
        )
          throw new FleetError("NEGOTIATION_CLOCK_ADVANCE_FORBIDDEN", true);
      }
    } catch (error) {
      onOperationalFailure();
      controller.abort();
      throw error;
    }
  };
}
