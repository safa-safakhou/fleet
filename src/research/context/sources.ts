import { FleetError } from "../../domain.js";
import type { RunScope } from "../contracts.js";
import type { MemoryRepository } from "../memory/repository.js";
import type { MemoryRecord } from "../memory/schema.js";
import type { ContextSource, ContextSourcePort } from "./assembler.js";
/** Bound to one authenticated invocation; native records and typed memory retain different provenance. */
export class ScopedContextSources implements ContextSourcePort {
  private native = new Map<string, ContextSource>();
  private memories = new Map<string, MemoryRecord>();
  private ranks = new Map<string, number>();
  constructor(
    readonly memory: MemoryRepository,
    readonly scope: RunScope,
  ) {}
  register(source: ContextSource) {
    this.native.set(source.id, source);
    return { id: source.id, mandatory: true };
  }
  include(record: MemoryRecord, priority = 0) {
    const id = `memory:${record.id}:${record.version}`;
    this.memories.set(id, record);
    this.ranks.set(id, priority);
    return { id, mandatory: false };
  }
  async resolve(scope: RunScope, id: string) {
    if (
      scope.operationId !== this.scope.operationId ||
      scope.operationEpoch !== this.scope.operationEpoch ||
      scope.manifestDigest !== this.scope.manifestDigest
    )
      throw new FleetError("OPERATION_SCOPE_MISMATCH", true);
    await this.memory.journal.assertCurrent(scope);
    const native = this.native.get(id);
    if (native) return native;
    const previous = this.memories.get(id);
    if (!previous) return;
    const current = (await this.memory.get(scope, [previous.id]))[0];
    if (!current || current.version !== previous.version) return;
    return {
      id,
      slot: "memory" as const,
      sourceClass: current.sourceClass,
      text: current.text,
      sourceRefs: current.sourceRefs,
      observedAt: current.observedAt,
      expiresAt: current.expiresAt,
      version: current.version,
      priority: this.ranks.get(id),
    };
  }
}
