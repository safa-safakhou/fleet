import { FleetError } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import type { ScopedServices } from "../../platform/engine-context.js";
import type { ResearchModelRequest } from "../broker/model.js";
import { canonical, type RunScope } from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";
import type { MemoryRepository } from "../memory/repository.js";
import { RetrievalService } from "../memory/retrieval.js";
import { ContextAssembler } from "./assembler.js";
import { ScopedContextSources } from "./sources.js";
export async function preparePactContext(
  memory: MemoryRepository,
  scope: RunScope,
  services: ScopedServices,
  observation: Observation | undefined,
  request: ResearchModelRequest,
  queryVector?: number[],
) {
  const manifest = await new ManifestRepository(memory.store.pool).load(scope.manifestDigest);
  if (!observation) throw new FleetError("CONTEXT_SOURCE_UNAVAILABLE", true);
  const now = memory.store.now().toISOString(),
    expiresAt = new Date(memory.store.now().getTime() + 30 * 86400000).toISOString(),
    sources = new ScopedContextSources(memory, scope);
  const refs = [
    sources.register({
      id: "native:owner",
      slot: "owner",
      sourceClass: "owner-guidance",
      text: canonical({
        goal: services.configuration.goal ?? "",
        instructions: services.configuration.instructions ?? "",
      }),
      sourceRefs: [`owner:${scope.agentId}`],
      observedAt: now,
      expiresAt,
    }),
    sources.register({
      id: "native:observation",
      slot: "observation",
      sourceClass: "observation",
      text: canonical(observation),
      sourceRefs: observation.sourceRefs,
      observedAt: observation.observedAt,
      expiresAt,
    }),
  ];
  const turn = (
    await memory.store.pool.query("SELECT pending_command,pending_action FROM turns WHERE id=$1", [scope.turnId])
  ).rows[0];
  if (turn.pending_command)
    refs.push(
      sources.register({
        id: "native:pending-command",
        slot: "pending-command",
        sourceClass: "command-admitted",
        text: canonical({ commandId: turn.pending_command, action: turn.pending_action, status: "pending" }),
        sourceRefs: [`command:${turn.pending_command}`],
        observedAt: now,
        expiresAt,
      }),
    );
  const rejection = (
    await memory.store.pool.query(
      "SELECT command_id,outcome FROM platform_commands WHERE turn_id=$1 AND state='rejected' ORDER BY created_at DESC LIMIT 1",
      [scope.turnId],
    )
  ).rows[0];
  if (rejection)
    refs.push(
      sources.register({
        id: "native:feedback",
        slot: "feedback",
        sourceClass: "feedback",
        text: canonical(rejection.outcome),
        sourceRefs: [`receipt:${rejection.command_id}`],
        observedAt: now,
        expiresAt,
      }),
    );
  const last = (
    await memory.store.pool.query(
      "SELECT event FROM research_events WHERE run_id=$1 AND event->'scope'->>'operationId'=$2 AND event->>'kind'='validation.result' ORDER BY ordinal DESC LIMIT 1",
      [scope.runId, scope.operationId],
    )
  ).rows[0]?.event;
  if (!rejection && last?.artifacts[0]) {
    const chunks = [];
    for await (const chunk of memory.captureSession.artifacts.read(last.scope, last.artifacts[0]))
      chunks.push(Buffer.from(chunk));
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (value.valid === false)
      refs.push(
        sources.register({
          id: "native:feedback",
          slot: "feedback",
          sourceClass: "feedback",
          text: canonical(value),
          sourceRefs: [last.artifacts[0].id],
          observedAt: now,
          expiresAt,
        }),
      );
  }
  const query = Array.from(request.messages.filter((m) => m.role === "user").at(-1)?.content ?? "")
    .slice(0, 2048)
    .join("");
  const retrieval = await new RetrievalService(memory).search(scope, {
    strategy: manifest.retrieval.strategy,
    text: query,
    language: manifest.retrieval.language,
    topK: manifest.retrieval.topK,
    ...(queryVector ? { vector: queryVector } : {}),
  });
  const allRefs = [...refs, ...retrieval.selected.map((r, index) => sources.include(r.record, index + 1))];
  return new ContextAssembler(sources, memory.captureSession).build(scope, {
    refs: allRefs,
    ...(retrieval.eventId ? { retrieval: { eventId: retrieval.eventId, coverage: retrieval.coverage } } : {}),
    baseMessages: request.messages,
    schema: request.schema,
    maxBytes: Math.min(manifest.context.maxBytes, services.configuration.budget.inputByteLimit),
    maxTokens: manifest.context.maxTokens,
    maxOutputTokens: request.maxOutputTokens,
    maxObservationAgeMs: manifest.context.maxObservationAgeMs,
    now,
  });
}
