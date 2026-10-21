import {
  assessNegotiation,
  type NegotiationClaimReviews,
  type NegotiationEvidence,
} from "../../src/negotiation-evaluation.js";
import type { NegotiationCell } from "../../src/negotiation-plan.js";
import type { NegotiationBinding, NegotiationGuardInput } from "../../src/negotiation-run.js";
import type { PlatformHost } from "../../src/platform/supervisor.js";
import type { TaskClaim, TaskStore } from "../../src/platform/tasks.js";

/** Ordinary scheduler and clock workers. No periodic event synthesis, clock
 * jump, due-time rewrite or lease reacquisition is available on this path. */
export async function runNativeOwnedCell(input: {
  cell: NegotiationCell;
  binding: NegotiationBinding;
  world: OwnedNegotiationWorld;
  control: OwnedNegotiationWorld;
  tasks: TaskStore;
  host: PlatformHost;
  signal: AbortSignal;
  cutoff: number;
  check: (input: NegotiationGuardInput) => Promise<void>;
  setClaim: (claim: TaskClaim | undefined) => void;
  abortBatch: () => void;
  persist: (kind: string, detail: unknown) => Promise<void>;
  allocations: () => Promise<NegotiationClaimReviews["allocations"]>;
  reviewOutcome: (
    cell: NegotiationCell,
    e: NegotiationEvidence,
  ) => Promise<Pick<NegotiationClaimReviews, "claims" | "reviews">>;
  evidenceLevel: "fake-provider" | "real-provider";
}) {
  const { cell, binding, world, control, signal } = input,
    pumpStop = new AbortController(),
    lifecycle: NegotiationEvidence["lifecycle"] = [],
    exposed = new Set<string>();
  let active: TaskClaim | undefined, pumpError: unknown;
  const check = () =>
    input.check({
      phase: "action",
      actorId: active?.turn.agent.kingdom_id ?? binding.actorIds[0],
      ...(active ? { turnId: active.turn.id } : {}),
    });
  const pump = async (w: OwnedNegotiationWorld) => {
    while (!pumpStop.signal.aborted && !signal.aborted) {
      await check();
      await w.tickNativeClock();
      await delay(1000, undefined, { signal: AbortSignal.any([pumpStop.signal, signal]) });
    }
  };
  const pumps: Promise<void>[] = [];
  const stopClocks = async () => {
    pumpStop.abort();
    await Promise.all(pumps);
    for (const w of [world, control]) await w.pauseClock("NEGOTIATION_NATIVE_TERMINAL");
  };
  try {
    await world.startNativeClock();
    await control.startNativeClock();
    for (const w of [world, control])
      pumps.push(
        pump(w).catch((error) => {
          if (!pumpStop.signal.aborted && !signal.aborted) {
            pumpError = error;
            input.abortBatch();
          }
        }),
      );
    while (!signal.aborted && Date.now() < input.cutoff) {
      if (pumpError) throw pumpError;
      await check();
      active =
        (await input.tasks.claim(`negotiation-native:${binding.worldId}`, new Date(), undefined, async (b) =>
          input.check({ phase: "turn", actorId: b.entityRef }),
        )) ?? undefined;
      input.setClaim(active);
      if (!active) {
        await delay(250, undefined, { signal });
        continue;
      }
      const actorId = active.turn.agent.kingdom_id;
      if (!actorId || !binding.actorIds.includes(actorId)) throw new FleetError("NEGOTIATION_ACTOR_SCOPE", true);
      const time = String(
        (await world.pool.query("SELECT committed_game_time_ms FROM world_clocks")).rows[0].committed_game_time_ms,
      );
      if (!exposed.has(actorId)) {
        exposed.add(actorId);
        for (const stage of ["opportunity", "exposure"] as const)
          lifecycle.push({
            stage,
            actorId,
            referenceId: active.turn.id,
            gameTimeMs: time,
            wallTime: new Date().toISOString(),
            sourceRefs: [`fleet-turn:${active.turn.id}`],
            scriptedPrefix: false,
          });
      }
      await input.persist("turn-start", { cellId: cell.id, actorId, turnId: active.turn.id, native: true });
      await input.host.run(active);
      // A response finishing after a tick may have observed the pre-tick world.
      // Claim-start GAME time is a conservative lower bound on its observation;
      // completion time must never manufacture a post-settlement decision.
      const decision = {
        stage: "later_decision" as const,
        actorId,
        referenceId: active.turn.id,
        gameTimeMs: time,
        wallTime: new Date().toISOString(),
        sourceRefs: [`fleet-turn:${active.turn.id}`],
        scriptedPrefix: false,
      };
      lifecycle.push(decision);
      await input.persist("turn-finish", { cellId: cell.id, actorId, turnId: active.turn.id, native: true, decision });
      active = undefined;
      input.setClaim(undefined);
      const evidence = await readNegotiationEvidence(world),
        solo = await readNegotiationEvidence(control);
      evidence.lifecycle.push(...lifecycle);
      const allocations = await input.allocations();
      if (nativeCompletionReady(cell, evidence, solo, allocations)) {
        await stopClocks();
        const final = await readNegotiationEvidence(world),
          finalSolo = await readNegotiationEvidence(control);
        final.lifecycle.push(...lifecycle);
        if (!nativeCompletionReady(cell, final, finalSolo, allocations))
          throw new FleetError("NEGOTIATION_NATIVE_SNAPSHOT_MISMATCH", true);
        await check();
        const reviews = await input.reviewOutcome(cell, final);
        const assessment = assessNegotiation(cell, final, finalSolo, {
          evidenceLevel: input.evidenceLevel,
          allocations,
          ...reviews,
        });
        if (assessment.criticalFailures.length) input.abortBatch();
        await input.persist("cell-result", { evidence: final, solo: finalSolo, assessment });
        return assessment;
      }
    }
    if (pumpError) throw pumpError;
    throw new FleetError("NEGOTIATION_CUTOFF", true);
  } catch (error) {
    input.abortBatch();
    throw error;
  } finally {
    await stopClocks();
  }
}
/** Mechanical readiness only. Manual reviews remain unresolved and a later
 * exact source-backed review is mandatory before returning any assessment. */
export function nativeCompletionReady(
  cell: NegotiationCell,
  e: NegotiationEvidence,
  solo: NegotiationEvidence,
  allocations: NegotiationClaimReviews["allocations"],
) {
  if (cell.clockMode !== "native" || cell.family !== "C01") return false;
  const provisional = assessNegotiation(cell, e, solo, {
    evidenceLevel: "fake-provider",
    allocations,
    claims: [],
    reviews: [],
  });
  return (
    provisional.material === "pass" &&
    provisional.history === "pass" &&
    !provisional.criticalFailures.length &&
    provisional.reasons.every((r) => r === "UNRESOLVED_FACTUALITY") &&
    e.actors.every((a) =>
      e.lifecycle.some((l) => l.actorId === a.actorId && l.stage === "dialogue" && !l.scriptedPrefix),
    )
  );
}

import { setTimeout as delay } from "node:timers/promises";
import { readNegotiationEvidence } from "../../../pact/tests/evaluation/negotiation-outcome.js";
import type { OwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import { FleetError } from "../../src/domain.js";
