import type { CognitiveState, Episode } from "../../cognition.js";
import type { SkillVersion } from "../../modules/skills/v1/schema.js";
import type { SpecialistState } from "../../platform/participant-state.js";
import { canonical, type RunScope } from "../contracts.js";
import type { MemoryRepository } from "./repository.js";
import type { MemoryInput, SourceClass } from "./schema.js";
/** Consume already-authorized public records. No reads from legacy private tables and no packet rewrites. */
export class NativeMemoryAdapters {
  constructor(readonly memory: MemoryRepository) {}
  private async project(
    scope: RunScope,
    kind: MemoryInput["kind"],
    sourceClass: SourceClass,
    value: unknown,
    at: string,
  ) {
    if (
      !Number.isFinite(Date.parse(at)) ||
      Date.parse(at) > this.memory.store.now().getTime() ||
      Date.parse(at) + 30 * 86400000 <= this.memory.store.now().getTime()
    )
      throw new Error("MEMORY_SOURCE_UNAVAILABLE");
    const event = await this.memory.captureSession.emit(scope, "memory.read", value, {}, { required: true });
    if (!event) throw new Error("EVIDENCE_UNAVAILABLE");
    const artifact = (
      await this.memory.store.pool.query("SELECT event->'artifacts'->0 ref FROM research_events WHERE id=$1", [
        event.id,
      ])
    ).rows[0].ref;
    await this.memory.registerSource(scope, { artifactId: artifact.id, sourceClass, observedAt: at });
    return this.memory.capture(scope, {
      kind,
      sourceClass,
      text: canonical(value),
      sourceRefs: [artifact.id],
      observedAt: at,
      privacy: "private",
    });
  }
  episode(scope: RunScope, value: Episode) {
    const detail = value.detail,
      receipt = (detail.receipt ?? {}) as Record<string, unknown>;
    const cls: SourceClass =
      value.kind === "message"
        ? detail.direction === "incoming"
          ? "peer-statement"
          : "working-state"
        : value.kind === "receipt"
          ? ["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code ?? detail.code))
            ? "command-admitted"
            : "feedback"
          : "observation";
    return this.project(scope, "episode", cls, value, value.at);
  }
  belief(scope: RunScope, value: CognitiveState["beliefs"][number], at: string) {
    return this.project(scope, "belief", "inference", value, at);
  }
  plan(scope: RunScope, value: NonNullable<CognitiveState["plan"]>, at: string) {
    return this.project(scope, "plan", "inference", value, at);
  }
  reflection(scope: RunScope, value: CognitiveState["reflections"][number], at: string) {
    return this.project(scope, "reflection", "inference", value, at);
  }
  specialistState(scope: RunScope, value: SpecialistState, at: string) {
    return this.project(scope, "working-state", "working-state", value, at);
  }
  skill(scope: RunScope, value: SkillVersion) {
    return this.project(scope, "skill", "skill", value, value.createdAt);
  }
  workingState(scope: RunScope, value: { codec: string; version: number; value: unknown }, at: string) {
    return this.project(scope, "working-state", "working-state", value, at);
  }
}
