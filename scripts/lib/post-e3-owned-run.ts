import { readNegotiationEvidence } from "../../../pact/tests/evaluation/negotiation-outcome.js";
import type { OwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { hostScopeFactory } from "../../src/app/host-services.js";
import { NegotiationNonceStore, readNativeNegotiationAccounting } from "../../src/app/negotiation-ledger.js";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { ParticipantWork } from "../../src/app/participant-work.js";
import { SkillExecutionStore } from "../../src/app/skill-execution.js";
import {
  type Data,
  FleetError,
  type GamePort,
  type ModelPort,
  type ModelSettings,
  object,
  safeCode,
} from "../../src/domain.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { pactSpecialistPresets } from "../../src/environments/pact-presets.js";
import {
  assessPostE3Negotiation,
  type NegotiationAssessment,
  type NegotiationClaimReviews,
  type NegotiationEvidence,
  rc1MechanicallyComplete,
  summarizePostE3Negotiation,
} from "../../src/negotiation-evaluation.js";
import { designDigest } from "../../src/negotiation-plan.js";
import { ModelAdmission, type ModelResult, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { type TaskClaim, TaskStore } from "../../src/platform/tasks.js";
import {
  type PostE3Cell,
  type PostE3Protocol,
  rc8ModelProfile,
  rc13ModelProfile,
  rc14ModelProfile,
  rc15ModelProfile,
  rc16ModelProfile,
  rc17ModelProfile,
  rc18ModelProfile,
  rc19ModelProfile,
  rc20ModelProfile,
  rc21ModelProfile,
  rc22ModelProfile,
  rc23ModelProfile,
  rc24ModelProfile,
  rc25ModelProfile,
  rc26ModelProfile,
  rc27ModelProfile,
  rc28ModelProfile,
  rc29ModelProfile,
  rc30ModelProfile,
  validatePostE3Cell,
} from "../../src/post-e3-rc2-plan.js";
import { type PostE3Grant, validatePostE3Grant } from "../../src/post-e3-run.js";
import type { Store } from "../../src/store.js";
import { nativeCompletionReady } from "./negotiation-native-run.js";
import {
  facade,
  nativePortCall,
  type PreparedNegotiationCell,
  prepareOwnedNegotiationCohort,
} from "./negotiation-owned-run.js";

export type PreparedPostE3Cell = PreparedNegotiationCell<PostE3Cell> & { model: ModelSettings; budgetDeadline: string };
const boundedProfileErrors: Record<string, string> = {
  "negotiation-r8": "RC8_MODEL_PROFILE_REQUIRED",
  "negotiation-r9": "RC9_MODEL_PROFILE_REQUIRED",
  "negotiation-r10": "RC10_MODEL_PROFILE_REQUIRED",
  "negotiation-r11": "RC11_MODEL_PROFILE_REQUIRED",
  "negotiation-r12": "RC12_MODEL_PROFILE_REQUIRED",
  "negotiation-r13": "RC13_MODEL_PROFILE_REQUIRED",
  "negotiation-r14": "RC14_MODEL_PROFILE_REQUIRED",
  "negotiation-r15": "RC15_MODEL_PROFILE_REQUIRED",
  "negotiation-r16": "RC16_MODEL_PROFILE_REQUIRED",
  "negotiation-r17": "RC17_MODEL_PROFILE_REQUIRED",
  "negotiation-r18": "RC18_MODEL_PROFILE_REQUIRED",
  "negotiation-r19": "RC19_MODEL_PROFILE_REQUIRED",
  "negotiation-r20": "RC20_MODEL_PROFILE_REQUIRED",
  "negotiation-r21": "RC21_MODEL_PROFILE_REQUIRED",
  "negotiation-r22": "RC22_MODEL_PROFILE_REQUIRED",
  "negotiation-r23": "RC23_MODEL_PROFILE_REQUIRED",
  "negotiation-r24": "RC24_MODEL_PROFILE_REQUIRED",
  "negotiation-r25": "RC25_MODEL_PROFILE_REQUIRED",
  "negotiation-r26": "RC26_MODEL_PROFILE_REQUIRED",
  "negotiation-r27": "RC27_MODEL_PROFILE_REQUIRED",
  "negotiation-r28": "RC28_MODEL_PROFILE_REQUIRED",
  "negotiation-r29": "RC29_MODEL_PROFILE_REQUIRED",
  "negotiation-r30": "RC30_MODEL_PROFILE_REQUIRED",
};
function requireBoundedModelProfile(study: string, model: ModelSettings) {
  const code = boundedProfileErrors[study];
  if (
    code &&
    designDigest(model) !==
      designDigest(
        study === "negotiation-r30"
          ? rc30ModelProfile
          : study === "negotiation-r29"
            ? rc29ModelProfile
            : study === "negotiation-r28"
              ? rc28ModelProfile
              : study === "negotiation-r27"
                ? rc27ModelProfile
                : study === "negotiation-r26"
                  ? rc26ModelProfile
                  : study === "negotiation-r25"
                    ? rc25ModelProfile
                    : study === "negotiation-r24"
                      ? rc24ModelProfile
                      : study === "negotiation-r23"
                        ? rc23ModelProfile
                        : study === "negotiation-r22"
                          ? rc22ModelProfile
                          : study === "negotiation-r21"
                            ? rc21ModelProfile
                            : study === "negotiation-r20"
                              ? rc20ModelProfile
                              : study === "negotiation-r19"
                                ? rc19ModelProfile
                                : study === "negotiation-r18"
                                  ? rc18ModelProfile
                                  : study === "negotiation-r17"
                                    ? rc17ModelProfile
                                    : study === "negotiation-r16"
                                      ? rc16ModelProfile
                                      : study === "negotiation-r15"
                                        ? rc15ModelProfile
                                        : study === "negotiation-r14"
                                          ? rc14ModelProfile
                                          : study === "negotiation-r13"
                                            ? rc13ModelProfile
                                            : rc8ModelProfile,
      )
  )
    throw new FleetError(code, true);
}
export async function prepareOwnedRC1Cohort(
  store: Store,
  world: OwnedNegotiationWorld<PostE3Cell>,
  control: OwnedNegotiationWorld<PostE3Cell>,
  cell: PostE3Cell,
  model: ModelSettings,
  fixtureNonce: string,
  evidenceRef: string,
  keyRef: string,
): Promise<PreparedPostE3Cell> {
  requireBoundedModelProfile(cell.study, model);
  const p = await prepareOwnedNegotiationCohort(store, world, control, cell, model, fixtureNonce, evidenceRef, keyRef);
  await store.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=$2,non_model_limits=$3 WHERE cohort_id=$1",
    [p.binding.cohortId, cell.configuration, cell.workLimits],
  );
  const preset = pactSpecialistPresets.find((p) => p.id === "full");
  if (!preset) throw new FleetError("RC1_PRESET_REQUIRED", true);
  for (const bindingId of p.binding.bindingIds)
    await new SpecialistRepository(store, {
      instanceId: `${bindingId}:autonomous-specialists@1`,
      bindingId,
    }).initialize(preset.roles.map((r) => r.charter));
  const budgetDeadline = (await store.cohort(p.binding.cohortId)).budget?.deadlineAt;
  if (!budgetDeadline) throw new FleetError("RC1_BUDGET_REQUIRED", true);
  return { ...p, model: structuredClone(model), budgetDeadline };
}
type Dependencies = {
  store: Store;
  prepared: PreparedPostE3Cell[];
  provider: ModelPort;
  evidenceLevel: "fake-provider" | "real-provider";
  verifyArtifacts(): Promise<void>;
  reviewResponse(claim: TaskClaim, result: ModelResult): Promise<void>;
  reviewOutcome(cell: PostE3Cell, e: NegotiationEvidence): Promise<Pick<NegotiationClaimReviews, "claims" | "reviews">>;
  persist(kind: string, detail: unknown): Promise<void>;
};
type CellResult = {
  cellId: string;
  status: "completed" | "failed" | "not_started";
  reason?: string;
  assessment?: NegotiationAssessment<PostE3Cell>;
};

/** Source-owned composition only. No provider startup, fixture reset, uncertain
 * command replay or owner review exists on this path. */
export function executeOwnedRC1Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r1") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC2Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r2") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC3Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r3") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC4Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r4") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC5Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r5") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC6Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r6") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC7Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r7") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC8Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r8") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC9Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r9") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC10Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r10") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC11Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r11") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC12Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r12") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC13Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r13") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC14Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r14") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC15Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r15") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC16Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r16") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC17Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r17") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC18Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r18") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC19Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r19") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC20Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r20") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC21Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r21") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC22Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r22") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC23Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r23") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC24Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r24") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC25Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r25") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC26Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r26") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC27Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r27") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC28Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r28") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC29Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r29") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
export function executeOwnedRC30Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (protocol.study !== "negotiation-r30") throw new FleetError("POST_E3_STUDY_MISMATCH", true);
  return executeOwnedPostE3Protocol(protocol, grant, d);
}
async function executeOwnedPostE3Protocol(protocol: PostE3Protocol, grant: PostE3Grant, d: Dependencies) {
  if (boundedProfileErrors[protocol.study])
    for (const p of d.prepared) requireBoundedModelProfile(protocol.study, p.model);
  const check = validatePostE3Grant(protocol, grant, Date.now());
  if (!check.valid) throw new FleetError(check.reasons[0] ?? "RC1_GRANT_REQUIRED", true);
  const nonces = new NegotiationNonceStore(d.store);
  if (await nonces.consumed(grant.batchNonce)) throw new FleetError("RC1_NONCE_CONSUMED", true);
  if (
    d.prepared.length !== protocol.cells.length ||
    protocol.cells.some(
      (c) =>
        !d.prepared.some(
          (p) =>
            designDigest(p.cell) === designDigest(c) &&
            grant.bindings.some((b) => designDigest(b) === designDigest(p.binding)),
        ),
    )
  )
    throw new FleetError("RC1_PREPARED_SCOPE", true);
  await d.verifyArtifacts();
  for (const p of d.prepared) {
    validatePostE3Cell(protocol, p.cell);
    const count = (
      await d.store.pool.query("SELECT count(*)::int n FROM turns WHERE cohort_id=$1", [p.binding.cohortId])
    ).rows[0].n;
    if (count || (await d.store.cohort(p.binding.cohortId)).state !== "draft")
      throw new FleetError("RC1_FRESH_ROSTER_REQUIRED", true);
  }
  if (!(await nonces.claimNonce(grant.batchNonce, protocol.digest, designDigest(grant))))
    throw new FleetError("RC1_NONCE_CONSUMED", true);
  const cells: CellResult[] = protocol.cells.map((c) => ({ cellId: c.id, status: "not_started" }));
  let stopped = false,
    parkFailed = false;
  try {
    for (const [i, cell] of protocol.cells.entries()) {
      if (stopped) break;
      const p = d.prepared.find((p) => p.cell.id === cell.id);
      if (!p) throw new FleetError("RC1_PREPARED_SCOPE", true);
      // Binding lookup, not array order, determines the published result row.
      const index = protocol.cells.findIndex((c) => c.id === p.cell.id);
      if (index < 0) throw new FleetError("RC1_PREPARED_SCOPE", true);
      try {
        const assessment = await runCell(protocol, grant, p, d);
        cells[index] = { cellId: p.cell.id, status: assessment.status === "pass" ? "completed" : "failed", assessment };
        if (assessment.criticalFailures.length || assessment.status === "unresolved") stopped = true;
      } catch (e) {
        stopped = true;
        cells[index] = { cellId: p.cell.id, status: "failed", reason: safeCode(e) };
        await d.persist("cell-stopped", { cellId: p.cell.id, reason: safeCode(e), sequence: i });
      }
    }
  } finally {
    const parked = await Promise.allSettled(
      d.prepared.flatMap((p) => [
        d.store.setState(p.binding.cohortId, "paused", true),
        p.world.pauseClock("RC1_TERMINAL"),
        p.control.pauseClock("RC1_TERMINAL"),
      ]),
    );
    parkFailed = parked.some((x) => x.status === "rejected");
  }
  if (parkFailed) throw new FleetError("RC1_PARK_FAILED", true);
  const result = {
    schemaVersion:
      protocol.study === "negotiation-r30"
        ? "fleet.rc30-batch.v1"
        : protocol.study === "negotiation-r29"
          ? "fleet.rc29-batch.v1"
          : protocol.study === "negotiation-r28"
            ? "fleet.rc28-batch.v1"
            : protocol.study === "negotiation-r27"
              ? "fleet.rc27-batch.v1"
              : protocol.study === "negotiation-r26"
                ? "fleet.rc26-batch.v1"
                : protocol.study === "negotiation-r25"
                  ? "fleet.rc25-batch.v1"
                  : protocol.study === "negotiation-r24"
                    ? "fleet.rc24-batch.v1"
                    : protocol.study === "negotiation-r23"
                      ? "fleet.rc23-batch.v1"
                      : protocol.study === "negotiation-r22"
                        ? "fleet.rc22-batch.v1"
                        : protocol.study === "negotiation-r21"
                          ? "fleet.rc21-batch.v1"
                          : protocol.study === "negotiation-r20"
                            ? "fleet.rc20-batch.v1"
                            : protocol.study === "negotiation-r19"
                              ? "fleet.rc19-batch.v1"
                              : protocol.study === "negotiation-r18"
                                ? "fleet.rc18-batch.v1"
                                : protocol.study === "negotiation-r17"
                                  ? "fleet.rc17-batch.v1"
                                  : protocol.study === "negotiation-r16"
                                    ? "fleet.rc16-batch.v1"
                                    : protocol.study === "negotiation-r15"
                                      ? "fleet.rc15-batch.v1"
                                      : protocol.study === "negotiation-r14"
                                        ? "fleet.rc14-batch.v1"
                                        : protocol.study === "negotiation-r13"
                                          ? "fleet.rc13-batch.v1"
                                          : protocol.study === "negotiation-r12"
                                            ? "fleet.rc12-batch.v1"
                                            : protocol.study === "negotiation-r11"
                                              ? "fleet.rc11-batch.v1"
                                              : protocol.study === "negotiation-r10"
                                                ? "fleet.rc10-batch.v1"
                                                : protocol.study === "negotiation-r9"
                                                  ? "fleet.rc9-batch.v1"
                                                  : protocol.study === "negotiation-r8"
                                                    ? "fleet.rc8-batch.v1"
                                                    : protocol.study === "negotiation-r7"
                                                      ? "fleet.rc7-batch.v1"
                                                      : protocol.study === "negotiation-r6"
                                                        ? "fleet.rc6-batch.v1"
                                                        : protocol.study === "negotiation-r5"
                                                          ? "fleet.rc5-batch.v1"
                                                          : protocol.study === "negotiation-r4"
                                                            ? "fleet.rc4-batch.v1"
                                                            : protocol.study === "negotiation-r3"
                                                              ? "fleet.rc3-batch.v1"
                                                              : protocol.study === "negotiation-r2"
                                                                ? "fleet.rc2-batch.v1"
                                                                : "fleet.rc1-batch.v1",
    protocolDigest: protocol.digest,
    batchNonce: grant.batchNonce,
    status: stopped ? ("stopped" as const) : ("complete" as const),
    cells,
    summary: summarizePostE3Negotiation(
      protocol,
      cells.flatMap((c) => (c.assessment ? [c.assessment] : [])),
    ),
    productionQualified: false as const,
  };
  await d.persist("batch-terminal", result);
  await nonces.finishNonce(grant.batchNonce, result.status, designDigest(result));
  return result;
}

async function runCell(protocol: PostE3Protocol, grant: PostE3Grant, p: PreparedPostE3Cell, d: Dependencies) {
  const { store } = d,
    { cell, binding, world, control } = p,
    stop = new AbortController(),
    clockStop = new AbortController();
  const cutoff = Math.min(Date.parse(grant.cutoffAt), Date.now() + cell.limits.wallDeadlineMs);
  const timeout = setTimeout(() => stop.abort(), Math.max(1, cutoff - Date.now()));
  const ref = { id: "pact", version: "1", instanceId: world.worldId },
    bindings = new Bindings(store, ref),
    pb = new PactBindings(store, bindings);
  let tasks: TaskStore,
    claim: TaskClaim | undefined,
    closed = false,
    activated = false,
    renewalError: unknown,
    workSequence = 0;
  let expectedDeadline = p.budgetDeadline;
  let bookkeeping = false,
    bookkeepingError: unknown;
  const anchors = new Map<string, string>();
  const authority = async () =>
    designDigest(
      (
        await world.pool.query(
          "SELECT account_id,allowed_actions,resource_limits,reserve_floors,version FROM kingdom_mandates WHERE product_scope='pact' AND account_id=ANY($1::uuid[]) ORDER BY account_id",
          [world.players.map((p) => p.accountId)],
        )
      ).rows,
    );
  const guard = async (phase: "turn" | "call" | "state" = "state", actorId?: string) => {
    if (closed || stop.signal.aborted || Date.now() >= cutoff) throw new FleetError("RC1_CUTOFF", true);
    if (renewalError) throw renewalError;
    await d.verifyArtifacts();
    for (const pool of [store.pool, world.pool]) {
      const marker = (await pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
      if (marker.length !== 1 || marker[0].nonce !== binding.fixtureNonce)
        throw new FleetError("RC1_OWNER_DRIFT", true);
    }
    const leases = await world.leaseFacts(),
      group = await store.cohort(binding.cohortId);
    const profile = (
      await store.pool.query("SELECT * FROM cohort_engine_profiles WHERE cohort_id=$1", [binding.cohortId])
    ).rows[0];
    if (
      designDigest(group.model) !== designDigest(p.model) ||
      group.budget?.deadlineAt !== expectedDeadline ||
      group.interval_minutes !== protocol.native.periodicMinutes ||
      designDigest(profile?.architecture_config) !== designDigest(cell.configuration) ||
      designDigest(profile?.non_model_limits) !== designDigest(cell.workLimits) ||
      profile?.timed_reviews !== (cell.clockMode === "native") ||
      group.budget?.maxActionsPerTurn !== 3 ||
      (activated && group.state !== "running")
    )
      throw new FleetError("RC1_CONFIGURATION_DRIFT", true);
    const state = await readNativeNegotiationAccounting(store, binding, cell, {
      ownershipValid: true,
      privacyValid: group.observation_consent === true,
      authorityValid:
        (await authority()) === p.authorityDigest &&
        (!activated || (leases.length === 2 && leases.every((l) => l.live && l.leaseId))),
      duplicateEffects: Number(
        (
          await world.pool.query(
            "SELECT count(*)::int n FROM (SELECT command_id FROM negotiation_fixture_commands GROUP BY command_id HAVING count(*)>1) duplicates",
          )
        ).rows[0].n,
      ),
      gameTimeMs: String(
        (await world.pool.query("SELECT committed_game_time_ms FROM world_clocks")).rows[0].committed_game_time_ms,
      ),
      startGameTimeMs: String(world.decisionStartGameTimeMs),
      nextScheduledGameTimeMs: null,
    });
    if (
      !state.ownershipValid ||
      !state.privacyValid ||
      !state.authorityValid ||
      state.duplicateEffects ||
      state.uncertainCommands.length ||
      state.allocations.some((a) => a.status === "unknown")
    )
      throw new FleetError("RC1_OPERATIONAL_STOP", true);
    if (designDigest(state.profile) !== designDigest(cell.profile) || state.limitsDigest !== designDigest(cell.limits))
      throw new FleetError("RC1_CONFIGURATION_DRIFT", true);
    if (state.allocations.some((a) => a.status === "reserved" && a.turnId !== claim?.turn.id))
      throw new FleetError("RC1_ORPHAN_RESERVATION", true);
    if (
      state.allocations.length + (phase === "call" ? 1 : 0) > cell.limits.callsPerWorld ||
      state.allocations.some(
        (a) =>
          a.reservedTokens !== 40000 ||
          (a.outputTokens ?? 0) > 2000 ||
          (a.inputTokens ?? 0) + (a.outputTokens ?? 0) > a.reservedTokens,
      )
    )
      throw new FleetError("RC1_MODEL_CAP", true);
    if (
      phase === "turn" &&
      (!actorId ||
        !binding.actorIds.includes(actorId) ||
        state.turns.filter((t) => t.actorId === actorId).length >= cell.limits.turnsPerActor)
    )
      throw new FleetError("RC1_TURN_CAP", true);
    if (phase === "turn" && state.allocations.length >= cell.limits.callsPerWorld)
      throw new FleetError("RC1_MODEL_CAP", true);
    if (BigInt(state.gameTimeMs) - BigInt(state.startGameTimeMs) > BigInt(cell.limits.gameHorizonMinutes) * 60000n)
      throw new FleetError("RC1_GAME_HORIZON", true);
    if (cell.clockMode === "controlled") {
      await world.refreshControlledSchedule();
      await control.refreshControlledSchedule();
    }
  };
  const meter = async (
    work: { reads?: number; actions?: number; steps?: number; messages?: number },
    boundBindingId?: string,
  ) => {
    if (!claim) {
      // Native wake observation has no running role claim. Charge host overhead
      // to that binding's latest completed turn, explicitly outside role work.
      const anchor = boundBindingId && anchors.get(boundBindingId);
      if (!bookkeeping || !boundBindingId || !anchor || work.actions || work.messages)
        throw new FleetError("RC1_CLAIM_REQUIRED", true);
      await new SkillExecutionStore(
        store,
        {
          instanceId: `${boundBindingId}:autonomous-specialists@1`,
          bindingId: boundBindingId,
          specialistId: "host-bookkeeping",
        },
        async (db) => {
          const row = (await db.query("SELECT state FROM cohorts WHERE id=$1", [binding.cohortId])).rows[0];
          if (row?.state !== "running" || closed || stop.signal.aborted || Date.now() >= cutoff)
            throw new FleetError("RC1_CUTOFF", true);
        },
      ).hostWork(anchor, `RC1:bookkeeping:${workSequence++}`, work);
      return;
    }
    if (boundBindingId && claim.bindingId !== boundBindingId) throw new FleetError("RC1_ROLE_SCOPE", true);
    const task = await tasks.get(claim.taskId);
    if (!task.participantId || !["resources", "diplomacy", "defense", "development"].includes(task.participantId))
      throw new FleetError("RC1_ROLE_SCOPE", true);
    await new SkillExecutionStore(
      store,
      {
        instanceId: `${claim.bindingId}:autonomous-specialists@1`,
        bindingId: claim.bindingId,
        specialistId: task.participantId,
      },
      (db) => tasks.check(claim as TaskClaim, db),
    ).hostWork(claim.turn.id, `RC1:owned-port:${workSequence++}`, work);
  };
  const adapter = createPactEnvironment({
    store,
    bindings: pb,
    now: () => new Date(),
    outlookVersion: "pact.agent-outlook.v1",
    eventFeedVersion: "pact.agent-events.v1",
    actionEffectsVersion: "fleet.action-effects.v1",
    game: async (agentId) => {
      const agent = await store.agent(agentId),
        index = world.players.findIndex((p) => p.accountId === agent.account_id && p.kingdomId === agent.kingdom_id);
      if (index < 0) throw new FleetError("RC1_ACTOR_SCOPE", true);
      const actor = world.actor(world.players[index].kingdomId),
        base = facade(world, index, () => guard());
      const boundBindingId = (
        await store.pool.query("SELECT id FROM environment_bindings WHERE agent_id=$1 AND state='active'", [agent.id])
      ).rows[0]?.id;
      if (!binding.bindingIds.includes(boundBindingId)) throw new FleetError("RC1_ACTOR_SCOPE", true);
      const game: GamePort = {
        ...base,
        tools: () => actor.tools(true),
        read: async (name, args) => {
          await guard();
          try {
            await meter({ reads: 1, steps: 1 }, boundBindingId);
            return await base.read(name, args);
          } catch (e) {
            if (bookkeeping) bookkeepingError = e;
            throw e;
          }
        },
        submit: async () => {
          throw new FleetError("RC1_UNGUARDED_LANE_FORBIDDEN", true);
        },
        effects: async (command) => {
          await guard();
          await meter({ reads: 1, steps: 1 }, boundBindingId);
          return (await nativePortCall(() => actor.effects(command))) as unknown as Data;
        },
        submitGuarded: async (command, g) => {
          await guard();
          await meter({ actions: 1, steps: 1 }, boundBindingId);
          return (await nativePortCall(() =>
            actor.submitGuarded(command, g as Parameters<typeof actor.submitGuarded>[1]),
          )) as unknown as Data;
        },
        receipt: async (id) => {
          await guard();
          await meter({ reads: 1, steps: 1 }, boundBindingId);
          return base.receipt(id);
        },
      };
      return game;
    },
  });
  const environments = new EnvironmentRegistry([adapter], ref);
  tasks = new TaskStore(store, bindings, 1, environments);
  const provider: ModelPort = {
    tracksDispatch: true,
    decide: async (request) => {
      const onDispatch = async () => {
        await guard();
        await request.onDispatch?.();
      };
      if (!d.provider.tracksDispatch) await onDispatch();
      return d.provider.decide({ ...request, onDispatch, signal: AbortSignal.any([request.signal, stop.signal]) });
    },
  };
  const admission = new ModelAdmission(
    store,
    tasks,
    provider,
    new RouteCapacity(store, () => ({ key: `RC1:${grant.batchNonce}`, capacity: 1 })),
    async () => guard("call"),
  ).reviewed(async (c, result) => {
    await guard();
    await d.reviewResponse(c, result);
    await guard();
    const update = object(object(result.decision).update);
    if (Array.isArray(update.messages) && update.messages.length)
      await meter({ messages: update.messages.length, steps: update.messages.length });
  });
  const commands = new CommandExecutor(store, tasks, bindings, environments),
    supervisor = new OperationSupervisor(tasks);
  const host = new PlatformHost(
    tasks,
    bindings,
    environments,
    new EngineRegistry([], builtinArchitectures()),
    admission,
    commands,
    supervisor,
    hostScopeFactory({ store, tasks, bindings, model: admission, commands }),
  );
  const work = new ParticipantWork({ store, tasks, bindings, environments, commands, enabled: () => !closed });
  const tickWork = async () => {
    bookkeeping = true;
    bookkeepingError = undefined;
    try {
      await work.tick({ admissionOpen: true, signal: stop.signal });
    } finally {
      bookkeeping = false;
    }
    if (bookkeepingError) throw bookkeepingError;
    const rows = (
      await store.pool.query("SELECT last_code FROM specialist_work_cursors WHERE binding_id=ANY($1::uuid[])", [
        binding.bindingIds,
      ])
    ).rows;
    if (rows.some((r) => r.last_code !== "OK")) throw new FleetError("RC1_BOOKKEEPING_FAILED", true);
  };
  const lifecycle: NegotiationEvidence["lifecycle"] = [],
    exposed = new Set<string>();
  const allocations = async (): Promise<NegotiationClaimReviews["allocations"]> => {
    const rows = (
      await store.pool.query(
        "SELECT l.id,l.turn_id,a.kingdom_id,l.tokens::int,l.input_tokens::int,l.output_tokens::int,l.status FROM compute_ledger l JOIN turns t ON t.id=l.turn_id JOIN agents a ON a.id=t.agent_id WHERE l.cohort_id=$1 ORDER BY l.created_at,l.id",
        [binding.cohortId],
      )
    ).rows;
    return rows.map((a) => ({
      id: a.id,
      actorId: a.kingdom_id,
      turnId: a.turn_id,
      reservedTokens: a.tokens,
      inputTokens: a.input_tokens,
      outputTokens: a.output_tokens,
      status: a.status,
    }));
  };
  const renewal = setInterval(() => {
    if (activated)
      void world.renewLeases().catch((e) => {
        renewalError = e;
        stop.abort();
      });
  }, 300000);
  const pumps: Promise<void>[] = [];
  const runClaim = async (selectedTaskId?: string) => {
    await guard();
    claim =
      (await tasks.claim(`RC1:${grant.batchNonce}`, new Date(), selectedTaskId, (b) => guard("turn", b.entityRef))) ??
      undefined;
    if (!claim) return false;
    const current = claim,
      actorId = current.turn.agent.kingdom_id;
    if (!actorId || !binding.actorIds.includes(actorId)) throw new FleetError("RC1_ACTOR_SCOPE", true);
    const time = String(
      (await world.pool.query("SELECT committed_game_time_ms FROM world_clocks")).rows[0].committed_game_time_ms,
    );
    if (!exposed.has(actorId)) {
      exposed.add(actorId);
      for (const stage of ["opportunity", "exposure"] as const)
        lifecycle.push({
          stage,
          actorId,
          referenceId: current.turn.id,
          gameTimeMs: time,
          wallTime: new Date().toISOString(),
          sourceRefs: [`fleet-turn:${current.turn.id}`],
          scriptedPrefix: false,
        });
    }
    await d.persist("turn-start", { cellId: cell.id, actorId, turnId: current.turn.id });
    await host.run(current);
    lifecycle.push({
      stage: "later_decision",
      actorId,
      referenceId: current.turn.id,
      gameTimeMs: time,
      wallTime: new Date().toISOString(),
      sourceRefs: [`fleet-turn:${current.turn.id}`],
      scriptedPrefix: false,
    });
    await d.persist("turn-finish", { cellId: cell.id, actorId, turnId: current.turn.id });
    anchors.set(current.bindingId, current.turn.id);
    claim = undefined;
    return true;
  };
  const delay = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      }
      signal.addEventListener("abort", done, { once: true });
    });
  try {
    await guard();
    await world.activateLeases();
    activated = true;
    expectedDeadline = new Date(cutoff).toISOString();
    const c = await store.cohort(binding.cohortId);
    await store.configure(binding.cohortId, { model: p.model, budget: { ...c.budget, deadlineAt: expectedDeadline } });
    await store.setState(binding.cohortId, "running", true);
    const start = world.decisionStartGameTimeMs / 60000;
    const advance = async (target: number) => {
      if (target > start + cell.limits.gameHorizonMinutes) throw new FleetError("RC1_GAME_HORIZON", true);
      for (const w of [world, control]) {
        let current =
          Number(
            (await w.pool.query("SELECT committed_game_time_ms FROM world_clocks")).rows[0].committed_game_time_ms,
          ) / 60000;
        while (current < target) {
          await guard();
          await w.advanceTo(++current);
        }
      }
    };
    if (cell.clockMode === "native") {
      await world.startNativeClock();
      await control.startNativeClock();
      for (const w of [world, control])
        pumps.push(
          (async () => {
            try {
              while (!clockStop.signal.aborted && !stop.signal.aborted) {
                await guard();
                await w.tickNativeClock();
                await delay(1000, clockStop.signal);
              }
            } catch (e) {
              renewalError = e;
              stop.abort();
            }
          })(),
        );
      while (!stop.signal.aborted) {
        await guard();
        await tickWork();
        const current =
          Number(
            (await world.pool.query("SELECT committed_game_time_ms FROM world_clocks")).rows[0].committed_game_time_ms,
          ) / 60000;
        if (current >= start + cell.limits.gameHorizonMinutes) break;
        if (!(await runClaim())) await delay(250, stop.signal);
        else {
          const e = await readNegotiationEvidence(world),
            solo = await readNegotiationEvidence(control);
          e.lifecycle.push(...lifecycle);
          if (nativeCompletionReady(cell, e, solo, await allocations(), protocol)) break;
        }
      }
      await guard();
      clockStop.abort();
      await Promise.all(pumps);
      await world.pauseClock("RC1_NATIVE_TERMINAL");
      await control.pauseClock("RC1_NATIVE_TERMINAL");
    } else {
      let complete = false;
      for (let round = 0; round < cell.limits.gameHorizonMinutes / protocol.native.periodicMinutes; round++) {
        const minute = start + round * protocol.native.periodicMinutes;
        await guard();
        await advance(minute);
        for (const bindingId of binding.bindingIds) {
          const b = await bindings.get(bindingId),
            event = {
              id: `${cell.id}:review:${round}:${bindingId}`,
              type: "periodic_review",
              sourceRef: `${cell.id}:review:${round}:${bindingId}`,
              observedAt: new Date().toISOString(),
              environmentTime: { clockId: "pact.game-time-ms", value: String(minute * 60000) },
              metadata: {},
            };
          await tasks.publishFromEvent(b, event, event.id);
        }
        await tickWork();
        while (await runClaim()) await tickWork();
        const e = await readNegotiationEvidence(world),
          s = await readNegotiationEvidence(control);
        e.lifecycle.push(...lifecycle);
        if (rc1MechanicallyComplete(protocol, cell, e, s, await allocations())) {
          complete = true;
          break;
        }
      }
      await guard();
      if (!complete || !["C01", "C02"].includes(cell.family)) await advance(start + cell.limits.gameHorizonMinutes);
    }
    const evidence = await readNegotiationEvidence(world),
      solo = await readNegotiationEvidence(control);
    evidence.lifecycle.push(...lifecycle);
    const reviews = await d.reviewOutcome(cell, evidence);
    const assessment = assessPostE3Negotiation(protocol, cell, evidence, solo, {
      evidenceLevel: d.evidenceLevel,
      allocations: await allocations(),
      ...reviews,
    });
    await d.persist("cell-outcome", { evidence, solo, assessment });
    return assessment;
  } catch (e) {
    if (
      claim &&
      (await store.pool.query("SELECT state FROM turns WHERE id=$1", [claim.turn.id])).rows[0]?.state === "running"
    )
      await tasks.finish(claim, safeCode(e));
    throw e;
  } finally {
    closed = true;
    stop.abort();
    clockStop.abort();
    clearTimeout(timeout);
    clearInterval(renewal);
    await Promise.all(pumps);
    await store.setState(binding.cohortId, "paused", true);
    await supervisor.drain();
  }
}

export const prepareOwnedRC2Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC3Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC4Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC5Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC6Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC7Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC8Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC9Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC10Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC11Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC12Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC13Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC14Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC15Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC16Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC17Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC18Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC19Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC20Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC21Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC22Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC23Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC24Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC25Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC26Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC27Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC28Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC29Cohort = prepareOwnedRC1Cohort;

export const prepareOwnedRC30Cohort = prepareOwnedRC1Cohort;
