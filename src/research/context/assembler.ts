import { FleetError } from "../../domain.js";
import { canonical, digest, type RunScope } from "../contracts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import type { SourceClass } from "../memory/schema.js";
import type { ContextLineage } from "./lineage.js";
import { account, type Message, type TokenCounter } from "./token-accounting.js";
export type ContextSource = {
  id: string;
  slot: "owner" | "observation" | "feedback" | "pending-command" | "memory" | "working-state";
  sourceClass: SourceClass;
  text: string;
  sourceRefs: string[];
  observedAt: string;
  expiresAt: string;
  version?: string;
  priority?: number;
};
export type ContextSourcePort = { resolve(scope: RunScope, id: string): Promise<ContextSource | undefined> };
export type ContextInput = {
  refs: { id: string; mandatory: boolean }[];
  baseMessages?: Message[];
  schema: Record<string, unknown>;
  maxBytes: number;
  maxTokens: number;
  maxOutputTokens: number;
  maxObservationAgeMs: number;
  now: string;
  retrieval?: ContextLineage["retrieval"];
};
export type ContextPacket = {
  messages: Message[];
  schema: Record<string, unknown>;
  digest: string;
  lineage: ContextLineage;
  accounting: ReturnType<typeof account>;
  eventId?: string;
  limits: { maxBytes: number; maxTokens: number; maxOutputTokens: number };
};
const priorities = { owner: 0, observation: 1, feedback: 2, "pending-command": 3, "working-state": 4, memory: 5 };
export class ContextAssembler {
  constructor(
    readonly sources: ContextSourcePort,
    readonly capture?: CaptureSession,
    readonly tokenizer?: TokenCounter,
  ) {}
  async build(scope: RunScope, input: ContextInput): Promise<ContextPacket> {
    if (
      ![input.maxBytes, input.maxTokens, input.maxOutputTokens, input.maxObservationAgeMs].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ) ||
      input.refs.length > 500
    )
      throw new FleetError("CONTEXT_POLICY_INVALID", true);
    const refs = [
        ...new Map(
          input.refs.map((r) => [r.id, { id: r.id, mandatory: input.refs.some((x) => x.id === r.id && x.mandatory) }]),
        ).values(),
      ],
      omitted: ContextLineage["omitted"] = [],
      resolved: { source: ContextSource; mandatory: boolean }[] = [];
    for (const ref of refs) {
      const source = await this.sources.resolve(scope, ref.id),
        now = Date.parse(input.now);
      const valid =
        source &&
        source.id === ref.id &&
        source.sourceRefs.length &&
        Number.isFinite(Date.parse(source.observedAt)) &&
        Date.parse(source.observedAt) <= now &&
        Date.parse(source.expiresAt) > now &&
        (source.slot !== "observation" || now - Date.parse(source.observedAt) <= input.maxObservationAgeMs);
      if (!valid) {
        if (ref.mandatory) throw new FleetError("CONTEXT_SOURCE_UNAVAILABLE", true);
        omitted.push({ id: ref.id, reason: "source-unavailable" });
        continue;
      }
      resolved.push({ source, mandatory: ref.mandatory });
    }
    resolved.sort(
      (a, b) =>
        priorities[a.source.slot] - priorities[b.source.slot] ||
        (a.source.priority ?? 0) - (b.source.priority ?? 0) ||
        (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0),
    );
    const selected = resolved.filter((r) => r.mandatory);
    const render = () => {
      const messages: Message[] = [...(input.baseMessages ?? []).map((x) => ({ ...x }))],
        spans: ContextLineage["spans"] = [];
      for (let i = 0; i < messages.length; i++)
        spans.push({
          id: `worker-input:${i}`,
          sourceClass: "working-state",
          sourceRefs: [`worker:${scope.operationId}:${i}`],
          messageIndex: i,
          startByte: 0,
          endByte: Buffer.byteLength(messages[i].content),
          unit: "utf8-message-content",
          transform: "identity-utf8@1",
        });
      for (const { source } of selected
        .slice()
        .sort(
          (a, b) =>
            priorities[a.source.slot] - priorities[b.source.slot] ||
            (a.source.priority ?? 0) - (b.source.priority ?? 0) ||
            (a.source.id < b.source.id ? -1 : 1),
        )) {
        const header = `[Fleet source ${canonical({ id: source.id, slot: source.slot, sourceClass: source.sourceClass, sourceRefs: source.sourceRefs, version: source.version ?? null })}]\n`,
          content = header + source.text,
          index = messages.length;
        messages.push({ role: "user", content });
        spans.push({
          id: source.id,
          sourceClass: source.sourceClass,
          sourceRefs: source.sourceRefs,
          messageIndex: index,
          startByte: Buffer.byteLength(header),
          endByte: Buffer.byteLength(content),
          unit: "utf8-message-content",
          transform: "identity-utf8@1",
        });
      }
      return { messages, spans, accounting: account(messages, input.schema, this.tokenizer) };
    };
    const fits = (p: ReturnType<typeof render>) =>
      p.accounting.totalBytes <= input.maxBytes && p.accounting.inputTokens + input.maxOutputTokens <= input.maxTokens;
    if (!fits(render())) throw new FleetError("CONTEXT_CAPACITY_REQUIRED", true);
    for (const optional of resolved.filter((r) => !r.mandatory)) {
      selected.push(optional);
      if (!fits(render())) {
        selected.pop();
        omitted.push({ id: optional.source.id, reason: "capacity" });
      }
    }
    const rendered = render(),
      hash = digest({ messages: rendered.messages, schema: input.schema }),
      lineage: ContextLineage = {
        version: "context-lineage@1",
        schema: { digest: digest(input.schema), bytes: rendered.accounting.schemaBytes, origin: "worker-contract" },
        ...(input.retrieval ? { retrieval: input.retrieval } : {}),
        packetDigest: hash,
        spans: rendered.spans,
        omitted: omitted.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        mandatoryCoverage: {
          expected: refs.filter((r) => r.mandatory).length,
          recorded: selected.filter((r) => r.mandatory).length,
          status: "complete",
        },
      };
    const packet: ContextPacket = {
      messages: rendered.messages,
      schema: input.schema,
      digest: hash,
      lineage,
      accounting: rendered.accounting,
      limits: { maxBytes: input.maxBytes, maxTokens: input.maxTokens, maxOutputTokens: input.maxOutputTokens },
    };
    if (this.capture) {
      const event = await this.capture.emit(
        scope,
        "context.prepared",
        packet,
        { bytes: String(packet.accounting.totalBytes) },
        { required: true, parents: input.retrieval ? [input.retrieval.eventId] : [] },
      );
      if (!event) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
      const artifact = (
        await this.capture.store.pool.query("SELECT event->'artifacts'->0 ref FROM research_events WHERE id=$1", [
          event.id,
        ])
      ).rows[0].ref;
      lineage.artifact = artifact;
      packet.eventId = event.id;
    }
    return packet;
  }
}
