import { FleetError } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import type { ResearchModelRequest } from "../broker/model.js";
import { canonical, digest, type RunScope } from "../contracts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import type { ContextPacket } from "./assembler.js";
import { account } from "./token-accounting.js";

type Limits = { maxBytes: number; maxTokens: number; nowMs: number; maxObservationAgeMs: number };
type Packer = (observation: Observation, maxBytes: number) => Observation;

// Domain views historically go through JSON.stringify, where absent object fields
// are omitted. Normalize that representation without accepting non-finite values,
// unsupported prototypes or undefined array entries as invented null facts.
function definedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(definedFields);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, definedFields(v)]),
    );
  return value;
}

/** Only a byte-for-byte equivalent authorized frame may become a domain-owned view.
 * Other worker messages (including feedback and owner instructions) remain whole. */
export function fitObservedRequest(
  request: ResearchModelRequest,
  observation: Observation | undefined,
  pack: Packer | undefined,
  limits: Limits,
) {
  observation = definedFields(observation) as Observation | undefined;
  if (observation) {
    const at = Date.parse(observation.observedAt);
    if (!Number.isFinite(at) || at > limits.nowMs || limits.nowMs - at > limits.maxObservationAgeMs)
      throw new FleetError("OBSERVATION_STALE", true);
  }
  const fits = (r: ResearchModelRequest) =>
    Buffer.byteLength(canonical(r)) <= limits.maxBytes &&
    account(r.messages, r.schema).inputTokens + r.maxOutputTokens <= limits.maxTokens;
  if (fits(request)) return { request, changed: [] as number[], view: undefined };
  if (!observation || !pack) throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
  const original = canonical(observation);
  const changed = request.messages.flatMap((m, index) => {
    if (m.role !== "user") return [];
    try {
      return canonical(JSON.parse(m.content)) === original ? [index] : [];
    } catch {
      return [];
    }
  });
  if (!changed.length) throw new FleetError("MODEL_REQUEST_NOT_ADMITTED", true);
  let viewLimit = limits.maxBytes;
  for (let attempt = 0; attempt < 32 && viewLimit > 0; attempt++) {
    const view = definedFields(pack(structuredClone(observation), viewLimit)) as Observation;
    for (const field of ["schemaId", "revision", "observedAt", "environmentTime", "sourceRefs"] as const)
      if (canonical(view[field]) !== canonical(observation[field]))
        throw new FleetError("CONTEXT_INPUT_MISMATCH", true);
    const prepared = {
      ...request,
      messages: request.messages.map((m, index) => (changed.includes(index) ? { ...m, content: canonical(view) } : m)),
    };
    if (fits(prepared)) return { request: prepared, changed, view };
    const bytesOver = Buffer.byteLength(canonical(prepared)) - limits.maxBytes;
    const tokensOver =
      account(prepared.messages, prepared.schema).inputTokens + request.maxOutputTokens - limits.maxTokens;
    viewLimit -= Math.max(64, bytesOver, tokensOver * 4);
  }
  throw new FleetError("CONTEXT_CAPACITY_REQUIRED", true);
}

export async function prepareObservedContext(
  capture: CaptureSession,
  scope: RunScope,
  observation: Observation | undefined,
  pack: Packer | undefined,
  request: ResearchModelRequest,
  limits: Limits,
): Promise<ContextPacket | undefined> {
  observation = definedFields(observation) as Observation | undefined;
  const fitted = fitObservedRequest(request, observation, pack, limits);
  if (!fitted.view || !observation) return undefined;
  const source = await capture.emit(
    scope,
    "observation.record",
    { label: "Model observation view", policy: "environment-view@1", observation, request, view: fitted.view },
    {},
    { required: true, sourceRefs: observation.sourceRefs },
  );
  if (!source) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
  const ref = (
    await capture.store.pool.query("SELECT event->'artifacts'->0 ref FROM research_events WHERE id=$1", [source.id])
  ).rows[0].ref;
  const accounting = account(fitted.request.messages, fitted.request.schema);
  // Context capture validates messages+schema; the broker independently checks its full envelope.
  const envelopeBytes = Buffer.byteLength(canonical(fitted.request)) - accounting.totalBytes;
  const packet: ContextPacket = {
    messages: fitted.request.messages,
    schema: fitted.request.schema,
    digest: digest({ messages: fitted.request.messages, schema: fitted.request.schema }),
    accounting,
    limits: {
      maxBytes: limits.maxBytes - envelopeBytes,
      maxTokens: limits.maxTokens,
      maxOutputTokens: request.maxOutputTokens,
    },
    lineage: {
      version: "context-lineage@1",
      packetDigest: digest({ messages: fitted.request.messages, schema: fitted.request.schema }),
      schema: { digest: digest(request.schema), bytes: accounting.schemaBytes, origin: "worker-contract" },
      spans: fitted.request.messages.map((m, index) => ({
        id: `worker-input:${index}`,
        sourceClass: fitted.changed.includes(index) ? "observation" : "working-state",
        sourceRefs: fitted.changed.includes(index) ? [ref.id] : [`worker:${scope.operationId}:${index}`],
        messageIndex: index,
        startByte: 0,
        endByte: Buffer.byteLength(m.content),
        unit: "utf8-message-content",
        transform: fitted.changed.includes(index) ? "environment-view@1" : "identity-utf8@1",
      })),
      observationView: {
        policy: "environment-view@1",
        source: ref,
        originalDigest: digest(observation),
        viewDigest: digest(fitted.view),
        coverage: fitted.view.coverage,
      },
      omitted: [
        { id: "native:observation/full-view", reason: "domain-packed; complete raw frame retained in source artifact" },
      ],
      mandatoryCoverage: { expected: 1, recorded: 1, status: "complete" },
    },
  };
  const event = await capture.emit(
    scope,
    "context.prepared",
    packet,
    { bytes: String(accounting.totalBytes) },
    {
      required: true,
      parents: [source.id],
      sourceRefs: [ref.id],
    },
  );
  if (!event) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
  packet.lineage.artifact = (
    await capture.store.pool.query("SELECT event->'artifacts'->0 ref FROM research_events WHERE id=$1", [event.id])
  ).rows[0].ref;
  packet.eventId = event.id;
  return packet;
}
