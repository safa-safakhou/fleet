import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FleetError } from "./domain.js";
import type { NegotiationAssessment, NegotiationClaimReviews } from "./negotiation-evaluation.js";
import { createNegotiationCellGuard } from "./negotiation-guard.js";
import { executeNativeNegotiationProtocol } from "./negotiation-native-protocol.js";
import { designDigest, type NegotiationCell, negotiationPlan } from "./negotiation-plan.js";
import { immutable } from "./platform/architecture.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.string().regex(/^[a-f0-9]{40}$/);
const sources = z.object({ fleet: revision, pact: revision }).strict();
const profile = z.object({ id: z.literal("reactive-cognition"), version: z.enum(["1", "1.1", "2"]) }).strict();
const Selection = z
  .object({
    stage: z.enum(["E1", "E2", "E3", "E4"]).default("E1"),
    sources: sources.nullable().default(null),
    modelDigest: hash.nullable().default(null),
    policyDigest: hash.nullable().default(null),
    settingsDigest: hash.nullable().default(null),
    selectedProfile: profile.default({ id: "reactive-cognition", version: "1" }),
    batchNonce: z.uuid().optional(),
    baselineAmendment: hash.optional(),
  })
  .strict();
type SelectionValue = z.infer<typeof Selection>;
type PreviewCell = Omit<NegotiationCell, "sources" | "modelDigest" | "policyDigest" | "configurationDigest"> & {
  sources: SelectionValue["sources"];
  modelDigest: string | null;
  policyDigest: string | null;
  configurationDigest: string | null;
};
export type ProtocolPreview = {
  schemaVersion: "fleet.negotiation-protocol.v1";
  selection: SelectionValue;
  batchNonce: string;
  ready: false;
  realProviderAuthorized: false;
  scope: "new_owned_synthetic_worlds";
  startsAt: null;
  cutoffAt: null;
  cells: PreviewCell[];
  maxima: { calls: number; reservedTokens: number; wallDeadlineMs: number };
  native: {
    periodicMinutes: 15;
    providerSlots: 1;
    callsPerTurn: 3;
    inputBytes: 24000;
    outputTokens: 2000;
    eventTriggeredTurns: false;
  };
  missingReadiness: string[];
  digest: string;
};
function planned(selection: SelectionValue) {
  return negotiationPlan(selection.stage, {
    sources: selection.sources ?? { fleet: "0".repeat(40), pact: "0".repeat(40) },
    modelDigest: selection.modelDigest ?? "0".repeat(64),
    policyDigest: selection.policyDigest ?? "0".repeat(64),
    selectedProfile: selection.selectedProfile,
    ...(selection.baselineAmendment ? { baselineAmendment: selection.baselineAmendment } : {}),
  });
}
/** Pure/disarmed. Unknown selections stay null; placeholder hashes never leave this function. */
export function prepareNegotiationProtocol(raw: unknown): ProtocolPreview {
  const selection = Selection.parse(raw),
    batchNonce = selection.batchNonce ?? randomUUID();
  selection.batchNonce = batchNonce;
  const cells = planned(selection),
    resolved = Boolean(
      selection.sources && selection.modelDigest && selection.policyDigest && selection.settingsDigest,
    );
  const missingReadiness = [
    ...(!selection.sources ? ["source_revisions"] : []),
    ...(!selection.modelDigest ? ["model_digest"] : []),
    ...(!selection.policyDigest ? ["policy_digest"] : []),
    ...(!selection.settingsDigest ? ["settings_digest"] : []),
    "private_approved_grant",
    "owned_native_preflight",
    "exact_fixture_bindings",
    "utc_window",
    "evidence_and_key_references",
  ];
  const value = {
    schemaVersion: "fleet.negotiation-protocol.v1" as const,
    selection,
    batchNonce,
    ready: false as const,
    realProviderAuthorized: false as const,
    scope: "new_owned_synthetic_worlds" as const,
    startsAt: null,
    cutoffAt: null,
    cells: cells.map((c) => ({
      ...c,
      sources: selection.sources,
      modelDigest: selection.modelDigest,
      policyDigest: selection.policyDigest,
      configurationDigest: resolved ? c.configurationDigest : null,
    })),
    maxima: cells.reduce(
      (sum, c) => ({
        calls: sum.calls + c.limits.callsPerWorld,
        reservedTokens: sum.reservedTokens + c.limits.reservedTokensPerWorld,
        wallDeadlineMs: sum.wallDeadlineMs + c.limits.wallDeadlineMs,
      }),
      { calls: 0, reservedTokens: 0, wallDeadlineMs: 0 },
    ),
    native: {
      periodicMinutes: 15 as const,
      providerSlots: 1 as const,
      callsPerTurn: 3 as const,
      inputBytes: 24000 as const,
      outputTokens: 2000 as const,
      eventTriggeredTurns: false as const,
    },
    missingReadiness,
  };
  return immutable({ ...value, digest: designDigest(value) });
}
const reference = z.string().min(1).max(8000);
export const NegotiationGrantSchema = z
  .object({
    schemaVersion: z.literal("fleet.negotiation-grant.v1"),
    approved: z.literal(true),
    authorizationRef: reference,
    protocolDigest: hash,
    batchNonce: z.uuid(),
    sources,
    modelDigest: hash,
    policyDigest: hash,
    settingsDigest: hash,
    startsAt: z.iso.datetime(),
    cutoffAt: z.iso.datetime(),
    scope: z.literal("new_owned_synthetic_worlds"),
    bindings: z
      .array(
        z
          .object({
            cellId: reference,
            worldId: z.uuid(),
            controlWorldId: z.uuid(),
            cohortId: z.uuid(),
            actorIds: z.array(z.uuid()).length(2),
            bindingIds: z.array(z.uuid()).length(2),
            fixtureNonce: hash,
            evidenceRef: reference,
            keyRef: reference,
          })
          .strict(),
      )
      .min(1)
      .max(35),
  })
  .strict();
export type NegotiationGrant = z.infer<typeof NegotiationGrantSchema>;
export type NegotiationBinding = NegotiationGrant["bindings"][number];
export type ValidationResult = { valid: boolean; reasons: string[] };
function protocolValid(protocol: ProtocolPreview) {
  try {
    return designDigest(prepareNegotiationProtocol(protocol.selection)) === designDigest(protocol);
  } catch {
    return false;
  }
}
export function validateNegotiationAuthorization(
  protocol: ProtocolPreview,
  raw: unknown,
  state: { now?: number; usedNonces?: readonly string[] } = {},
): ValidationResult {
  const reasons: string[] = [];
  if (!protocolValid(protocol)) reasons.push("PROTOCOL_CHANGED");
  const parsed = NegotiationGrantSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, reasons: [...reasons, "PRIVATE_APPROVED_GRANT_REQUIRED"] };
  const grant = parsed.data,
    selection = protocol.selection,
    now = state.now ?? Date.now();
  if (!selection.sources || !selection.modelDigest || !selection.policyDigest || !selection.settingsDigest)
    reasons.push("UNRESOLVED_SELECTION");
  if (
    grant.protocolDigest !== protocol.digest ||
    grant.batchNonce !== protocol.batchNonce ||
    designDigest(grant.sources) !== designDigest(selection.sources) ||
    grant.modelDigest !== selection.modelDigest ||
    grant.policyDigest !== selection.policyDigest ||
    grant.settingsDigest !== selection.settingsDigest
  )
    reasons.push("GRANT_SOURCE_MODEL_OR_SETTINGS_DRIFT");
  const start = Date.parse(grant.startsAt),
    cutoff = Date.parse(grant.cutoffAt);
  if (
    !Number.isSafeInteger(now) ||
    cutoff <= start ||
    cutoff - start > protocol.maxima.wallDeadlineMs ||
    now < start ||
    now >= cutoff
  )
    reasons.push("UTC_WINDOW_CLOSED_OR_INVALID");
  if (state.usedNonces?.includes(grant.batchNonce)) reasons.push("NONCE_ALREADY_CONSUMED");
  const ids = grant.bindings.map((b) => b.cellId);
  if (
    ids.length !== protocol.cells.length ||
    new Set(ids).size !== ids.length ||
    protocol.cells.some((c) => !ids.includes(c.id))
  )
    reasons.push("EXACT_CELL_SET_REQUIRED");
  for (const key of ["worlds", "actors", "bindings", "cohorts"]) {
    const values = grant.bindings.flatMap((b) =>
      key === "worlds"
        ? [b.worldId, b.controlWorldId]
        : key === "actors"
          ? b.actorIds
          : key === "bindings"
            ? b.bindingIds
            : [b.cohortId],
    );
    if (new Set(values).size !== values.length) reasons.push(`REUSED_${key.toUpperCase()}`);
  }
  return { valid: reasons.length === 0, reasons };
}
export type NativeAccounting = {
  allocations: (Omit<NegotiationClaimReviews["allocations"][number], "status"> & {
    status: "reported" | "unknown" | "not_dispatched" | "reserved";
  })[];
  turns: { actorId: string; turnId: string }[];
  inFlight: number;
  uncertainCommands: string[];
  ownershipValid: boolean;
  privacyValid: boolean;
  authorityValid: boolean;
  duplicateEffects: number;
  limitsDigest: string;
  profile: NegotiationCell["profile"];
  deadlineAt: string;
  gameTimeMs: string;
  startGameTimeMs: string;
  nextScheduledGameTimeMs: string | null;
};
export type NegotiationGuardInput = {
  phase: "turn" | "call" | "dispatch" | "action" | "clock" | "native_clock";
  actorId?: string;
  turnId?: string;
  targetGameTimeMs?: string;
};
export interface NegotiationExecutionPorts {
  readonly timingMode?: "controlled" | "native";
  now(): number;
  /** Read-only immediate verification of exact sources/config and owned fresh fixtures. */
  preflight(
    protocol: ProtocolPreview,
    grant: NegotiationGrant,
  ): Promise<{
    sources: NegotiationGrant["sources"];
    modelDigest: string;
    policyDigest: string;
    settingsDigest: string;
    owned: boolean;
    fresh: boolean;
    evidenceReady: boolean;
  }>;
  /** Atomic, durable one-shot control only; spending remains in native compute_ledger. */
  claimNonce(nonce: string, protocolDigest: string, grantDigest: string): Promise<boolean>;
  /** Owned lifecycle preparation after one-shot admission, before native guards. */
  openCell?(binding: NegotiationBinding, window: { startsAt: string; cutoffAt: string }): Promise<void>;
  accounting(binding: NegotiationBinding): Promise<NativeAccounting>;
  /** Trusted native host composition must invoke guard at native turn/call admission,
   * provider onDispatch, game admission, and controlled-clock boundaries. It keeps
   * original task/allocation/command IDs and the existing recovery machinery. */
  runCell(
    cell: NegotiationCell,
    binding: NegotiationBinding,
    controls: {
      startsAt: string;
      cutoffAt: string;
      signal: AbortSignal;
      guard: (input: NegotiationGuardInput) => Promise<void>;
    },
  ): Promise<NegotiationAssessment>;
  closeAdmission(binding: NegotiationBinding, reason: string): Promise<void>;
  finishNonce(nonce: string, status: string, resultDigest: string): Promise<void>;
}
export type NegotiationBatchResult = {
  schemaVersion: "fleet.negotiation-batch.v1";
  protocolDigest: string;
  batchNonce: string;
  status: "complete" | "stopped";
  cells: {
    cellId: string;
    status: "completed" | "failed" | "not_started";
    assessment?: NegotiationAssessment;
    reason?: string;
  }[];
};
async function preflight(protocol: ProtocolPreview, grant: NegotiationGrant, ports: NegotiationExecutionPorts) {
  const observed = await ports.preflight(protocol, grant);
  if (
    !observed.owned ||
    !observed.fresh ||
    !observed.evidenceReady ||
    designDigest(observed.sources) !== designDigest(grant.sources) ||
    observed.modelDigest !== grant.modelDigest ||
    observed.policyDigest !== grant.policyDigest ||
    observed.settingsDigest !== grant.settingsDigest
  )
    throw new FleetError("NEGOTIATION_NATIVE_PREFLIGHT_FAILED", true);
}
/** No second spend counter. Every guard re-reads the native ledger and window;
 * neither semantic grading nor a failed cell can allocate replacement work. */
export async function executeNegotiationProtocol(
  protocol: ProtocolPreview,
  rawGrant: unknown,
  ports: NegotiationExecutionPorts,
): Promise<NegotiationBatchResult> {
  const valid = validateNegotiationAuthorization(protocol, rawGrant, { now: ports.now() });
  if (!valid.valid) throw new FleetError(valid.reasons[0] ?? "NEGOTIATION_UNAUTHORIZED", true);
  const grant = NegotiationGrantSchema.parse(rawGrant);
  if (protocol.selection.stage === "E4" && ports.timingMode !== "native")
    throw new FleetError("OWNED_NATIVE_SCHEDULER_ACCEPTANCE_REQUIRED", true);
  await preflight(protocol, grant, ports);
  if (protocol.selection.stage === "E4")
    return executeNativeNegotiationProtocol(protocol, grant, planned(protocol.selection), ports);
  if (!(await ports.claimNonce(grant.batchNonce, protocol.digest, designDigest(grant))))
    throw new FleetError("NONCE_ALREADY_CONSUMED", true);
  const cells = planned(protocol.selection),
    result: NegotiationBatchResult = {
      schemaVersion: "fleet.negotiation-batch.v1",
      protocolDigest: protocol.digest,
      batchNonce: protocol.batchNonce,
      status: "complete",
      cells: cells.map((c) => ({ cellId: c.id, status: "not_started" })),
    };
  let current: NegotiationBinding | undefined;
  try {
    for (const [i, cell] of cells.entries()) {
      const binding = grant.bindings.find((b) => b.cellId === cell.id);
      if (!binding) throw new FleetError("EXACT_CELL_SET_REQUIRED", true);
      current = binding;
      const started = ports.now(),
        cutoff = Math.min(Date.parse(grant.cutoffAt), started + cell.limits.wallDeadlineMs),
        controller = new AbortController();
      let operationalFailure = false;
      const guard = createNegotiationCellGuard({
        ports,
        protocol,
        grant,
        cell,
        binding,
        cutoff,
        controller,
        onOperationalFailure: () => {
          operationalFailure = true;
        },
      });
      const timer = setTimeout(() => controller.abort(), Math.max(1, cutoff - ports.now()));
      try {
        await ports.openCell?.(binding, {
          startsAt: new Date(started).toISOString(),
          cutoffAt: new Date(cutoff).toISOString(),
        });
        await guard({ phase: "action", actorId: binding.actorIds[0] });
        const assessment = await ports.runCell(cell, binding, {
          startsAt: new Date(started).toISOString(),
          cutoffAt: new Date(cutoff).toISOString(),
          signal: controller.signal,
          guard,
        });
        if (
          designDigest(assessment.cell) !== designDigest(cell) ||
          assessment.worldId !== binding.worldId ||
          assessment.evidenceLevel !== "real-provider"
        )
          throw new FleetError("NEGOTIATION_RESULT_SCOPE", true);
        result.cells[i] = {
          cellId: cell.id,
          status: assessment.status === "pass" ? "completed" : "failed",
          assessment,
        };
        await guard({ phase: "action", actorId: binding.actorIds[0] });
        const native = await ports.accounting(binding);
        if (
          native.allocations.some((a) => a.status === "unknown" || a.status === "reserved") ||
          native.uncertainCommands.length ||
          !native.ownershipValid ||
          !native.privacyValid ||
          !native.authorityValid ||
          native.duplicateEffects
        )
          throw new FleetError("NEGOTIATION_OPERATIONAL_STOP", true);
        if (ports.now() >= cutoff) {
          result.cells[i].status = "failed";
          result.cells[i].reason = "CUTOFF_RETAINED";
        }
        if (
          assessment.criticalFailures.some((code) =>
            [
              "INVALID_AUTHORITATIVE_EVIDENCE",
              "EVIDENCE_SCOPE_MISMATCH",
              "DUPLICATE_COMMAND_EVIDENCE",
              "FOREIGN_MODEL_ALLOCATION",
              "UNKNOWN_MODEL_ALLOCATION",
              "USAGE_EXCEEDS_RESERVATION",
            ].includes(code),
          )
        )
          throw new FleetError("NEGOTIATION_OPERATIONAL_STOP", true);
        if (assessment.criticalFailures.length) {
          await ports.closeAdmission(binding, "CRITICAL_CLAIM");
          if (["E3", "E4"].includes(cell.stage)) {
            result.status = "stopped";
            break;
          }
        }
      } catch (error) {
        const reason = error instanceof FleetError ? error.code : "NEGOTIATION_NATIVE_FAILURE";
        result.cells[i] = { ...result.cells[i], cellId: cell.id, status: "failed", reason };
        await ports.closeAdmission(binding, reason);
        if (!operationalFailure && reason === "CRITICAL_CLAIM" && ["E1", "E2"].includes(cell.stage)) {
          const native = await ports.accounting(binding);
          if (
            native.inFlight === 0 &&
            native.ownershipValid &&
            native.privacyValid &&
            native.authorityValid &&
            native.duplicateEffects === 0 &&
            native.uncertainCommands.length === 0 &&
            native.allocations.every((a) => a.status === "reported" || a.status === "not_dispatched")
          )
            continue;
        }
        result.status = "stopped";
        break;
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
  } finally {
    if (result.status === "stopped" && current) await ports.closeAdmission(current, "BATCH_TERMINAL");
    await ports.finishNonce(grant.batchNonce, result.status, designDigest(result));
  }
  return result;
}
