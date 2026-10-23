import { z } from "zod";
import { designDigest } from "./negotiation-plan.js";
import { NegotiationGrantSchema } from "./negotiation-run.js";
import type { RC1Protocol } from "./post-e3-plan.js";
import {
  canonicalPostE3Protocol,
  type PostE3Protocol,
  type RC2Protocol,
  type RC3Protocol,
  type RC4Protocol,
  type RC5Protocol,
  type RC6Protocol,
  type RC7Protocol,
  type RC8Protocol,
  type RC9Protocol,
  type RC10Protocol,
  type RC11Protocol,
  type RC12Protocol,
  type RC13Protocol,
  type RC14Protocol,
  type RC15Protocol,
  type RC16Protocol,
  type RC17Protocol,
  type RC18Protocol,
  type RC19Protocol,
  type RC20Protocol,
  type RC21Protocol,
  type RC22Protocol,
  type RC23Protocol,
  type RC24Protocol,
  type RC25Protocol,
} from "./post-e3-rc2-plan.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const RC1GrantSchema = NegotiationGrantSchema.extend({
  schemaVersion: z.literal("fleet.rc1-grant.v2"),
  seedCommitment: hash,
  bundleDigest: hash,
}).strict();
export type RC1Grant = z.infer<typeof RC1GrantSchema>;
export const RC2GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc2-grant.v1") }).strict();
export type RC2Grant = z.infer<typeof RC2GrantSchema>;
export const RC3GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc3-grant.v1") }).strict();
export type RC3Grant = z.infer<typeof RC3GrantSchema>;
export const RC4GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc4-grant.v1") }).strict();
export type RC4Grant = z.infer<typeof RC4GrantSchema>;
export const RC5GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc5-grant.v1") }).strict();
export type RC5Grant = z.infer<typeof RC5GrantSchema>;
export const RC6GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc6-grant.v1") }).strict();
export type RC6Grant = z.infer<typeof RC6GrantSchema>;
export const RC7GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc7-grant.v1") }).strict();
export type RC7Grant = z.infer<typeof RC7GrantSchema>;
export const RC8GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc8-grant.v1") }).strict();
export type RC8Grant = z.infer<typeof RC8GrantSchema>;
export const RC9GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc9-grant.v1") }).strict();
export type RC9Grant = z.infer<typeof RC9GrantSchema>;
export const RC10GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc10-grant.v1") }).strict();
export type RC10Grant = z.infer<typeof RC10GrantSchema>;
export const RC11GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc11-grant.v1") }).strict();
export type RC11Grant = z.infer<typeof RC11GrantSchema>;
export const RC12GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc12-grant.v1") }).strict();
export type RC12Grant = z.infer<typeof RC12GrantSchema>;
export const RC13GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc13-grant.v1") }).strict();
export type RC13Grant = z.infer<typeof RC13GrantSchema>;
export const RC14GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc14-grant.v1") }).strict();
export type RC14Grant = z.infer<typeof RC14GrantSchema>;
export const RC15GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc15-grant.v1") }).strict();
export type RC15Grant = z.infer<typeof RC15GrantSchema>;
export const RC16GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc16-grant.v1") }).strict();
export type RC16Grant = z.infer<typeof RC16GrantSchema>;
export const RC17GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc17-grant.v1") }).strict();
export type RC17Grant = z.infer<typeof RC17GrantSchema>;
export const RC18GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc18-grant.v1") }).strict();
export type RC18Grant = z.infer<typeof RC18GrantSchema>;
export const RC19GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc19-grant.v1") }).strict();
export type RC19Grant = z.infer<typeof RC19GrantSchema>;
export const RC20GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc20-grant.v1") }).strict();
export type RC20Grant = z.infer<typeof RC20GrantSchema>;
export const RC21GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc21-grant.v1") }).strict();
export type RC21Grant = z.infer<typeof RC21GrantSchema>;
export const RC22GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc22-grant.v1") }).strict();
export type RC22Grant = z.infer<typeof RC22GrantSchema>;
export const RC23GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc23-grant.v1") }).strict();
export type RC23Grant = z.infer<typeof RC23GrantSchema>;
export const RC24GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc24-grant.v1") }).strict();
export type RC24Grant = z.infer<typeof RC24GrantSchema>;
export const RC25GrantSchema = RC1GrantSchema.extend({ schemaVersion: z.literal("fleet.rc25-grant.v1") }).strict();
export type RC25Grant = z.infer<typeof RC25GrantSchema>;
export type PostE3Grant =
  | RC1Grant
  | RC2Grant
  | RC3Grant
  | RC4Grant
  | RC5Grant
  | RC6Grant
  | RC7Grant
  | RC8Grant
  | RC9Grant
  | RC10Grant
  | RC11Grant
  | RC12Grant
  | RC13Grant
  | RC14Grant
  | RC15Grant
  | RC16Grant
  | RC17Grant
  | RC18Grant
  | RC19Grant
  | RC20Grant
  | RC21Grant
  | RC22Grant
  | RC23Grant
  | RC24Grant
  | RC25Grant;
/** Validation is not an authorization source. Private operator grants and
 * platform policy approval are distinct from this pure scope/time check. */
export function validateRC1Grant(protocol: RC1Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r1") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC2Grant(protocol: RC2Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r2") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC3Grant(protocol: RC3Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r3") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC4Grant(protocol: RC4Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r4") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC5Grant(protocol: RC5Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r5") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC6Grant(protocol: RC6Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r6") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC7Grant(protocol: RC7Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r7") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC8Grant(protocol: RC8Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r8") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC9Grant(protocol: RC9Protocol, raw: unknown, now: number, usedNonces: readonly string[] = []) {
  if (protocol.study !== "negotiation-r9") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC10Grant(
  protocol: RC10Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r10") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC11Grant(
  protocol: RC11Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r11") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC12Grant(
  protocol: RC12Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r12") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC13Grant(
  protocol: RC13Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r13") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC14Grant(
  protocol: RC14Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r14") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC15Grant(
  protocol: RC15Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r15") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC16Grant(
  protocol: RC16Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r16") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC17Grant(
  protocol: RC17Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r17") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC18Grant(
  protocol: RC18Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r18") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC19Grant(
  protocol: RC19Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r19") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC20Grant(
  protocol: RC20Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r20") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC21Grant(
  protocol: RC21Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r21") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC22Grant(
  protocol: RC22Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r22") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC23Grant(
  protocol: RC23Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r23") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC24Grant(
  protocol: RC24Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r24") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validateRC25Grant(
  protocol: RC25Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  if (protocol.study !== "negotiation-r25") return { valid: false, reasons: ["POST_E3_STUDY_MISMATCH"] };
  return validatePostE3Grant(protocol, raw, now, usedNonces);
}
export function validatePostE3Grant(
  protocol: PostE3Protocol,
  raw: unknown,
  now: number,
  usedNonces: readonly string[] = [],
) {
  const reasons: string[] = [];
  let canonical: PostE3Protocol | undefined;
  try {
    canonical = canonicalPostE3Protocol(protocol);
  } catch {
    /* Refuse malformed selections. */
  }
  if (!canonical || designDigest(canonical) !== designDigest(protocol)) reasons.push("RC1_PROTOCOL_CHANGED");
  const parsed = (
    protocol.study === "negotiation-r25"
      ? RC25GrantSchema
      : protocol.study === "negotiation-r24"
        ? RC24GrantSchema
        : protocol.study === "negotiation-r23"
          ? RC23GrantSchema
          : protocol.study === "negotiation-r22"
            ? RC22GrantSchema
            : protocol.study === "negotiation-r21"
              ? RC21GrantSchema
              : protocol.study === "negotiation-r20"
                ? RC20GrantSchema
                : protocol.study === "negotiation-r19"
                  ? RC19GrantSchema
                  : protocol.study === "negotiation-r18"
                    ? RC18GrantSchema
                    : protocol.study === "negotiation-r17"
                      ? RC17GrantSchema
                      : protocol.study === "negotiation-r16"
                        ? RC16GrantSchema
                        : protocol.study === "negotiation-r15"
                          ? RC15GrantSchema
                          : protocol.study === "negotiation-r14"
                            ? RC14GrantSchema
                            : protocol.study === "negotiation-r13"
                              ? RC13GrantSchema
                              : protocol.study === "negotiation-r12"
                                ? RC12GrantSchema
                                : protocol.study === "negotiation-r11"
                                  ? RC11GrantSchema
                                  : protocol.study === "negotiation-r10"
                                    ? RC10GrantSchema
                                    : protocol.study === "negotiation-r9"
                                      ? RC9GrantSchema
                                      : protocol.study === "negotiation-r8"
                                        ? RC8GrantSchema
                                        : protocol.study === "negotiation-r7"
                                          ? RC7GrantSchema
                                          : protocol.study === "negotiation-r6"
                                            ? RC6GrantSchema
                                            : protocol.study === "negotiation-r5"
                                              ? RC5GrantSchema
                                              : protocol.study === "negotiation-r4"
                                                ? RC4GrantSchema
                                                : protocol.study === "negotiation-r3"
                                                  ? RC3GrantSchema
                                                  : protocol.study === "negotiation-r2"
                                                    ? RC2GrantSchema
                                                    : RC1GrantSchema
  ).safeParse(raw);
  if (!parsed.success) return { valid: false, reasons: [...reasons, "RC1_EXACT_GRANT_REQUIRED"] };
  const grant = parsed.data;
  if (
    grant.protocolDigest !== protocol.digest ||
    grant.batchNonce !== protocol.selection.batchNonce ||
    grant.seedCommitment !== protocol.seedCommitment ||
    grant.bundleDigest !== protocol.selection.bundleDigest
  )
    reasons.push("RC1_GRANT_SCOPE");
  for (const field of ["sources", "modelDigest", "policyDigest", "settingsDigest"] as const)
    if (designDigest(grant[field]) !== designDigest(protocol.selection[field]))
      reasons.push("RC1_SOURCE_OR_SETTINGS_DRIFT");
  if (
    !Number.isSafeInteger(now) ||
    Date.parse(grant.startsAt) > now ||
    Date.parse(grant.cutoffAt) <= now ||
    Date.parse(grant.cutoffAt) <= Date.parse(grant.startsAt) ||
    Date.parse(grant.cutoffAt) - Date.parse(grant.startsAt) > protocol.maxima.wallDeadlineMs
  )
    reasons.push("RC1_UTC_WINDOW");
  if (usedNonces.includes(grant.batchNonce)) reasons.push("RC1_NONCE_CONSUMED");
  if (
    grant.bindings.length !== protocol.cells.length ||
    new Set(grant.bindings.map((b) => b.cellId)).size !== protocol.cells.length ||
    protocol.cells.some((c) => !grant.bindings.some((b) => b.cellId === c.id))
  )
    reasons.push("RC1_CELL_BINDINGS");
  const ids = new Set<string>();
  for (const b of grant.bindings) {
    for (const id of [b.worldId, b.controlWorldId, b.cohortId, ...b.actorIds, ...b.bindingIds]) {
      if (ids.has(id)) reasons.push("RC1_DUPLICATE_IDENTITY");
      ids.add(id);
    }
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}
