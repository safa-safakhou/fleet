import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { Cognition, deliveredCognition } from "./cognition.js";
import {
  analysisDecisionGuide,
  analysisInstructions,
  analysisOpportunities,
  analysisSchemaForVersion,
  normalizeAnalysis,
} from "./cognitive-analysis.js";
import { Communications } from "./communications.js";
import { fitMessages } from "./context.js";
import { Continuation, intentFingerprint } from "./continuation.js";
import type { DecisionSupport } from "./decision.js";
import { type Data, Decision, FleetError, type GamePort, type ModelPort, object, safeCode } from "./domain.js";
import { promptFeedback } from "./feedback.js";
import type { GameAdapter } from "./game.js";
import { bindGenerationSchema, closedDecisionSchema, executableActionSchema } from "./generation.js";
import { RemoteRejection } from "./http.js";
import { Observability, scrub } from "./observability.js";
import { currentOwnerObjectiveInstruction, ownerRecallQuery, ownerValues } from "./owner-guidance.js";
import type { Claim, Store } from "./store.js";
import { schemaChanged, ToolArgumentError, validateTool } from "./tools.js";

export interface OwnerPort {
  prepare(claim: Claim, action: Data): Promise<Data>;
  submit(claim: Claim, commandId: string, action: Data): Promise<Data>;
}
export class Engine {
  private stopping = false;
  private controller?: AbortController;
  stop() {
    this.stopping = true;
    this.controller?.abort();
  }
  constructor(
    private store: Store,
    private model: ModelPort,
    private game: (agentId: string) => Promise<GamePort>,
    private liveAllowed: boolean,
    private adapter: GameAdapter,
    private owner?: OwnerPort,
    private decisionSupport?: DecisionSupport,
    private cognitionSupport?: Cognition,
  ) {}
  async tick(worker: string, maxConcurrency = 1) {
    await this.store.heartbeat(worker, this.liveAllowed);
    if (!this.liveAllowed || this.stopping) return null;
    const claim = await this.store.claim(worker, maxConcurrency);
    if (claim) await this.run(claim);
    return claim;
  }
  async run(claim: Claim) {
    const b = claim.cohort.budget,
      m = claim.cohort.model;
    if (!this.liveAllowed || !b || !m) throw new FleetError("LIVE_EXECUTION_DISABLED");
    let game: GamePort | undefined,
      lastCode = "WAIT",
      summary = "",
      notes: string | undefined;
    const communications = new Communications(this.store, this.adapter.normalizeCommunications);
    const observation = new Observability(this.store);
    const continuation = new Continuation(this.store);
    let currentDecision = -1;
    const outcome = async (category: string, detail: Data = {}) =>
      continuation.outcome(claim, currentDecision, { category, ...detail });
    const cognition = m.cognition ? (this.cognitionSupport ?? new Cognition(this.store)) : undefined;
    const { actionKinds, actionSchema, boundedReads, mergeReads } = this.adapter;
    const isRead = (tool: import("./domain.js").Tool) =>
      tool.annotations?.readOnlyHint === true && this.adapter.isRead(tool);
    try {
      await this.store.active(claim);
      await observation.record(claim, "observing", "Reading current game state");
      game = await this.game(claim.agentId);
      const original = game;
      const observe = async <T>(operation: () => Promise<T>): Promise<T> => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await operation();
          } catch (error) {
            if (
              attempt >= 2 ||
              !["TRANSPORT_UNCERTAIN", "RATE_LIMITED"].includes(safeCode(error)) ||
              claim.deadline.getTime() - this.store.now().getTime() < 25000
            )
              throw error;
            await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
            await this.store.active(claim);
          }
        }
      };
      game = {
        profile: () => observe(() => original.profile()),
        tools: () => observe(() => original.tools()),
        read: async (tool, args) => {
          const startedAt = this.store.now().getTime();
          await observation.recordDebug(claim, "reading", "Game read request", { tool, args });
          try {
            const result = await observe(() => original.read(tool, args));
            await observation.recordDebug(claim, "ready", "Game read response", {
              tool,
              result,
              elapsedMs: Math.max(0, this.store.now().getTime() - startedAt),
            });
            return result;
          } catch (error) {
            await observation.recordDebug(claim, "reading", "Game read failed", {
              tool,
              code: safeCode(error),
              elapsedMs: Math.max(0, this.store.now().getTime() - startedAt),
            });
            throw error;
          }
        },
        open: () => original.open(),
        submit: (id, action) => original.submit(id, action),
        receipt: (id) => original.receipt(id),
        close: () => original.close(),
      };
      const profile = await game.profile();
      if (profile.accountId !== claim.agent.account_id) throw new FleetError("IDENTITY_MISMATCH");
      const tools = await game.tools();
      this.adapter.validateCatalog?.(tools);
      const turnIndex = (
        await this.store.pool.query("SELECT count(*)::int n FROM turns WHERE agent_id=$1", [claim.agentId])
      ).rows[0].n;
      const initialContext = {
        ordinal: claim.agent.ordinal,
        count: claim.cohort.count,
        turn: turnIndex,
        name: claim.cohort.name,
        discoveryCursor: claim.agent.discovery_cursor,
      };
      const facts: Data = await this.adapter.initial(game, claim.agent.kingdom_id, initialContext);
      const nextCursor = this.adapter.nextDiscoveryCursor?.(facts);
      if (nextCursor) await this.store.discoveryCursor(claim, nextCursor);
      await observation.record(claim, "ready", "Owner guidance applied", {
        mode: claim.cohort.owner_guidance ?? "strategy",
        controllerStrategyApplied: claim.cohort.owner_guidance !== "account_autonomy",
      });
      let cognitivePeers: string[] = [],
        currentEvidence = "",
        cognitiveQuery: string | undefined;
      const observeCognitiveState = async (source: string) => {
        if (!cognition) return;
        const view = this.adapter.cognitiveObservation?.(facts);
        if (!view) throw new FleetError("COGNITION_ADAPTER_REQUIRED");
        cognitivePeers = view.peers;
        currentEvidence = await cognition.capture(claim, "observation", source, view.detail);
      };
      await observeCognitiveState(`snapshot:${claim.id}:initial`);
      const attention = this.adapter.attention?.(facts);
      await observation.record(
        claim,
        attention ? "result" : "ready",
        attention ? "Game needs owner recovery" : "Game blockers checked",
        attention ? { ...attention.detail, label: attention.label } : { needsOwner: false },
      );
      const reads: Data[] = [];
      let requestedRead: Data | undefined;
      const decisionFeedback: Data[] =
        claim.agent.decision_feedback_cipher &&
        claim.agent.decision_feedback_at &&
        claim.agent.decision_feedback_at.getTime() > this.store.now().getTime() - 86400000
          ? [this.store.vault.decrypt<Data>(claim.agent.decision_feedback_cipher, `decision-feedback:${claim.agentId}`)]
          : [];
      const rememberFeedback = async (feedback: Data) => {
        decisionFeedback.splice(0, decisionFeedback.length, feedback);
        await this.store.rememberDecisionFeedback(claim, feedback);
      };
      const lastIntent = (
        await this.store.pool.query(
          "SELECT summary FROM turns WHERE agent_id=$1 AND id<>$2 AND state='finished' ORDER BY started_at DESC LIMIT 1",
          [claim.agentId, claim.id],
        )
      ).rows[0]?.summary;
      const previousReads =
        claim.agent.read_memory_cipher &&
        claim.agent.read_memory_updated_at &&
        claim.agent.read_memory_updated_at.getTime() > this.store.now().getTime() - 86400000
          ? mergeReads(
              this.store.vault.decrypt<Data[]>(claim.agent.read_memory_cipher, `read-memory:${claim.agentId}`),
            ).filter(
              (e) =>
                typeof e.observedAt === "string" && Date.parse(e.observedAt) > this.store.now().getTime() - 86400000,
            )
          : [];
      // A request made on the last decision of a turn still needs feedback at the
      // next eligible scheduled decision. Legacy checkpoints have no such marker.
      requestedRead = previousReads.find((r) => r.requested === true);
      const connectedGame = game;
      const observePeer = async (peer: string) => {
        for (const { name, args } of this.adapter.peerReads(peer)) {
          const tool = tools.find((t) => t.name === name && isRead(t));
          if (!tool) continue;
          await this.store.active(claim);
          validateTool(tool, args);
          await observation.record(claim, "reading", "Reading a participating exchange", { tool: name, args });
          let result: Data;
          try {
            result = await connectedGame.read(name, args);
          } catch (error) {
            const feedback = this.adapter.readRejection?.(error, name, args);
            if (!feedback) throw error;
            await rememberFeedback(feedback);
            await outcome("ordinary_read_failure", promptFeedback(feedback));
            await observation.record(claim, "result", "Automatic scoped peer read failed without submission", feedback);
            continue;
          }
          await communications.ingest(claim.agentId, peer, name, result);
          if (cognition)
            for (const entry of this.adapter.normalizeCommunications(claim.agent.kingdom_id, name, result))
              if (["message", "agreement"].includes(entry.kind))
                await cognition.capture(claim, entry.kind as "message" | "agreement", `${peer}:${entry.source}`, {
                  peerId: peer,
                  direction: entry.direction,
                  gameTime: entry.gameTime,
                  body: entry.body,
                  coverage:
                    "Delivered to this account; peer claims are untrusted and do not prove actual inventory or intent.",
                });
          const projected = this.adapter.boundedReads(
            [{ tool: name, args, result, observedAt: this.store.now().toISOString() }],
            6000,
          );
          if (projected.length) reads.push(...projected);
          else
            reads.push({
              tool: name,
              args,
              coverage: { complete: false },
              observation:
                "A server page was observed, but no whole record fitted this input; request a selected record before relying on its contents.",
            });
        }
      };
      const contacts = this.adapter.peers(facts);
      await observation.record(claim, "ready", "Game context ready", {
        contacts: contacts.length,
        availableReads: tools.filter(isRead).length,
        retainedReads: previousReads.length,
      });
      if (contacts.length) {
        const turns = (
          await this.store.pool.query("SELECT count(*)::int n FROM turns WHERE agent_id=$1", [claim.agentId])
        ).rows[0].n;
        const peer = contacts[(turns - 1) % contacts.length];
        if (typeof peer === "string") await observePeer(peer);
      }
      let actions = 0;
      let strategicFocus: Data | undefined;
      if (m.decisionPolicy) {
        if (!this.decisionSupport || !this.adapter.decisionObservation)
          throw new FleetError("DECISION_MODEL_UNCONFIGURED");
        strategicFocus = await this.decisionSupport.begin(claim, this.adapter.decisionObservation(facts));
      }
      for (let n = 0; n < b.maxCallsPerTurn; n++) {
        currentDecision = n;
        await this.store.active(claim);
        const signals = this.adapter.continuationSignals?.(facts) ?? [];
        const ownerFingerprint = intentFingerprint({
          guidance: claim.cohort.owner_guidance,
          objective: this.adapter.accountObjective?.(facts) ?? null,
        });
        const decisionState = await continuation.reconcile(claim, signals, ownerFingerprint);
        const capability = this.adapter.availableActions?.(facts, claim.cohort.synthetic_owner_policy);
        const priorContinuation = continuation.context(decisionState);
        if (Array.isArray(priorContinuation.outcomes))
          priorContinuation.outcomes = priorContinuation.outcomes.map((raw) => {
            const entry = object(raw);
            return {
              ...entry,
              operationMeaning: this.adapter.commandMeaning?.({ kind: entry.actionKind }, { code: entry.code }),
            };
          });
        const context = {
          ownerValues: ownerValues(
            claim.cohort.owner_guidance,
            claim.agent.strategy,
            this.adapter.accountObjective?.(facts),
          ),
          ...(cognition
            ? {
                cognition: await cognition.context(
                  claim,
                  cognitivePeers,
                  currentEvidence,
                  cognitiveQuery ??
                    ownerRecallQuery(
                      claim.cohort.owner_guidance,
                      claim.agent.strategy,
                      this.adapter.accountObjective?.(facts),
                    ),
                ),
              }
            : {}),
          ...(strategicFocus ? { strategicFocus } : {}),
          continuation: priorContinuation,
          continuationGuide: {
            requiredForAction: false,
            schemaLookup: "fleet_continuation_schema",
            meaning:
              "Optional authored plan format only; no gameplay, signature or resource effect. Use only when editing that plan. Choose a game action directly when its facts and shape are already known.",
          },
          privateNotes: claim.agent.notes,
          lastOutcome: claim.agent.reason,
          lastIntent,
          turnBudget: {
            decisionsRemaining: b.maxCallsPerTurn - n,
            actionsRemaining: b.maxActionsPerTurn - actions,
            deadlineAt: claim.deadline.toISOString(),
          },
          environment: this.adapter.compactFacts(facts),
          readResults: boundedReads(
            [...previousReads, ...reads].filter(
              (r) =>
                !requestedRead ||
                JSON.stringify([r.tool, r.args]) !== JSON.stringify([requestedRead.tool, requestedRead.args]),
            ),
          ),
          requestedRead,
          commandResults: reads
            .filter((r) => typeof r.commandId === "string")
            .map((r) => ({
              commandId: r.commandId,
              actionKind: object(r.action).kind,
              outcomeSource: r.source,
              receipt: r.receipt,
              meaning: this.adapter.commandMeaning?.(object(r.action), object(r.receipt)),
            })),
          readHistoryCoverage:
            "Historical facts may be stale. The environment is fresh; re-read current facts before dependent commitments.",
          gameActionKinds: capability?.kinds ?? actionKinds,
          schemaCoverage:
            "Executable shapes are supplied once in the output schema. For another advertised name/kind, inspect fleet_read_schema/fleet_action_schema first; never invent argument fields.",
          humanOnlyActionKinds: capability?.humanOnly ?? [],
          actionPermissions: capability?.matrix
            ? {
                requiredMandates: Object.fromEntries(
                  capability.matrix.filter((c) => c.requiredMandate).map((c) => [String(c.kind), c.requiredMandate]),
                ),
                ownerPolicyKinds: capability.matrix
                  .filter((c) => c.route === "owner_policy_only" && !c.blocked)
                  .map((c) => c.kind),
                blocked: capability.matrix
                  .filter((c) => c.blocked && !capability.humanOnly.includes(String(c.kind)))
                  .map((c) => ({ kind: c.kind, code: c.blocked })),
              }
            : undefined,
          permissionCoverage:
            "Advertisement is conditional. Server checks identity, scope, live lease, mandate, delegation, owner policy, permits, targets, quotas, stock and prerequisites.",
          decisionFeedback: decisionFeedback.map(promptFeedback),
          availableReads: tools
            .filter(isRead)
            .map((t) => ({ name: t.name, description: t.description?.slice(0, 180) })),

          convenienceRead: { name: "fleet_action_schema", args: { kind: "one observed gameActionKinds value" } },
          readSchemaLookup: { name: "fleet_read_schema", args: { name: "one availableReads name" } },
          ...(cognition ? { analysisGuide: analysisDecisionGuide } : {}),
          ...(cognition
            ? {
                memoryRead: {
                  name: "fleet_memory_recall",
                  args: { query: "specific question about your own history" },
                  inputSchema: {
                    type: "object",
                    properties: { query: { type: "string", minLength: 1, maxLength: 240 } },
                    required: ["query"],
                    additionalProperties: false,
                  },
                },
              }
            : {}),
        };
        const lookups = [...previousReads, ...reads]
          .filter((r) =>
            ["fleet_read_schema", "fleet_action_schema", "fleet_continuation_schema"].includes(String(r.tool)),
          )
          .slice(-4);
        const selectedReads = new Set(
          (this.adapter.suppliedReadSchemas?.(tools.filter(isRead)) ?? []).map((r) => String(r.name)),
        );
        if (!selectedReads.size) for (const tool of tools.filter(isRead).slice(0, 3)) selectedReads.add(tool.name);
        for (const entry of lookups)
          if (entry.tool === "fleet_read_schema") selectedReads.add(String(object(entry.args).name));
        const initialShapes = capability?.schemas ? [...capability.schemas] : actionKinds.map(actionSchema);
        const correctionKind = object(decisionFeedback.at(-1)).actionKind;
        const correctionShapes = initialShapes.filter(
          (s) => object(object(s.properties).kind).const === correctionKind,
        );
        // A recorded actionable correction gets its exact shape; every other
        // admitted kind remains accessible through the closed schema lookup.
        const requiredShapes = capability?.requiredSchemas ?? [];
        const actionShapes = [
          ...new Set([...requiredShapes, ...(correctionShapes.length ? correctionShapes : initialShapes)]),
        ];
        for (const entry of lookups)
          if (
            entry.tool === "fleet_action_schema" &&
            (capability?.kinds ?? actionKinds).includes(String(object(entry.args).kind))
          ) {
            const shape = this.adapter.proposalSchema
              ? this.adapter.proposalSchema(String(object(entry.args).kind), facts)
              : actionSchema(String(object(entry.args).kind));
            if (shape && !actionShapes.some((s) => JSON.stringify(s) === JSON.stringify(shape)))
              actionShapes.push(shape);
          }
        const continuationShape =
          decisionState.goal ||
          lookups.some(
            (r) =>
              r.tool === "fleet_continuation_schema" &&
              ["continuation"].includes(String(object(r.args).section ?? "continuation")),
          )
            ? await continuation.schema(claim.agentId)
            : undefined;
        const buildGeneration = (pageOptional: boolean) =>
          closedDecisionSchema({
            actionKinds: capability?.kinds ?? actionKinds,
            actionSchemas: pageOptional
              ? actionShapes.filter(
                  (shape) =>
                    requiredShapes.includes(shape) ||
                    correctionShapes.includes(shape) ||
                    lookups.some(
                      (entry) =>
                        entry === requestedRead &&
                        entry.tool === "fleet_action_schema" &&
                        object(entry.args).kind === object(object(shape.properties).kind).const,
                    ),
                )
              : actionShapes,
            reads: tools.filter(isRead),
            selectedReadNames: pageOptional
              ? lookups
                  .filter((entry) => entry === requestedRead && entry.tool === "fleet_read_schema")
                  .map((entry) => String(object(entry.args).name))
              : [...selectedReads],
            memory: !!cognition,
            continuationLookup: true,
            ...(continuationShape ? { continuationSchema: continuationShape } : {}),
          });
        let pageCognitiveEdits = false;
        const nativeSchema = (delivered: Data) =>
          analysisSchemaForVersion(object(context.cognition).version, delivered, {
            plan:
              !pageCognitiveEdits ||
              lookups.some(
                (r) =>
                  r === requestedRead &&
                  r.tool === "fleet_continuation_schema" &&
                  object(r.args).section === "cognitive_plan",
              ),
            memories:
              !pageCognitiveEdits ||
              lookups.some(
                (r) =>
                  r === requestedRead &&
                  r.tool === "fleet_continuation_schema" &&
                  object(r.args).section === "cognitive_memories",
              ),
          });
        let generation = buildGeneration(false);
        let outputSchema = cognition
          ? bindGenerationSchema(nativeSchema(deliveredCognition(context)), generation)
          : generation;
        const instructions =
          this.adapter.instructions +
          (cognition ? ` ${analysisInstructions}` : "") +
          currentOwnerObjectiveInstruction(
            claim.cohort.owner_guidance === "account_autonomy" ? this.adapter.accountObjective?.(facts) : undefined,
          );
        const packetLimit = Math.min(b.inputByteLimit, b.perCallTokenLimit - b.maxOutputTokens - 1024);
        let messages!: ReturnType<typeof fitMessages>;
        try {
          const packDecision = () => {
            let fittingContext: Data = context;
            for (let pass = 0; ; pass++) {
              if (pass >= 16) throw new FleetError("CONTEXT_LIMIT");
              messages = fitMessages(
                fittingContext,
                instructions,
                outputSchema,
                packetLimit,
                boundedReads,
                this.adapter.narrowRead,
                this.adapter.compactEnvironment,
                cognition
                  ? (deliveredContext) =>
                      bindGenerationSchema(
                        analysisSchemaForVersion(
                          object(context.cognition).version,
                          deliveredCognition(deliveredContext),
                        ),
                        generation,
                      )
                  : undefined,
              );
              if (!cognition) break;
              fittingContext = object(JSON.parse(messages[1].content));
              outputSchema = bindGenerationSchema(nativeSchema(deliveredCognition(fittingContext)), generation);
              if (
                Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(outputSchema)) <=
                packetLimit
              )
                break;
              // Refit only the already delivered subset, then constrain IDs again.
              // No evicted source can become an admissible citation through padding.
            }
          };
          try {
            packDecision();
          } catch (error) {
            if (!(error instanceof FleetError) || error.code !== "CONTEXT_LIMIT") throw error;
            // Optional upfront shapes are pages, not mandatory evidence. Retain
            // correction/requested schemas and every advertised lookup choice.
            // Start again from the original context so accepted recall is intact.
            pageCognitiveEdits = true;
            generation = buildGeneration(true);
            context.schemaCoverage =
              "Other schemas paged; use fleet_read_schema/fleet_action_schema. Requested/correction shapes retained; never guess." +
              (cognition
                ? " Cognitive plan/memory edits: fleet_continuation_schema section cognitive_plan/cognitive_memories."
                : "");
            outputSchema = cognition
              ? bindGenerationSchema(nativeSchema(deliveredCognition(context)), generation)
              : generation;
            packDecision();
          }
        } catch (error) {
          if (error instanceof FleetError && error.code === "CONTEXT_LIMIT")
            await observation.record(claim, "result", "Context packing could not fit", {
              inputByteLimit: b.inputByteLimit,
              instructionsBytes: Buffer.byteLength(instructions),
              schemaBytes: Buffer.byteLength(JSON.stringify(outputSchema)),
              sectionBytes: Object.fromEntries(
                Object.entries(context)
                  .filter(([, value]) => value !== undefined)
                  .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]),
              ),
              meaning: "Size diagnostics only; no model call reserved or evidence discarded.",
            });
          throw error;
        }
        const bytes = Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(outputSchema));
        if (bytes > b.inputByteLimit || bytes + b.maxOutputTokens + 1024 > b.perCallTokenLimit)
          throw new FleetError("CONTEXT_LIMIT");
        if (cognition) {
          const fittedContext = object(JSON.parse(messages[1].content));
          const delivered = object(fittedContext.cognition);
          await observation.record(claim, "ready", "LLM continuity delivered", {
            version: delivered.version,
            planStatus: object(delivered.plan).status ?? null,
            evidence: Array.isArray(delivered.evidence) ? delivered.evidence.length : 0,
            inputBytes: bytes,
            inputByteLimit: b.inputByteLimit,
            sectionBytes: Object.fromEntries(
              Object.entries(fittedContext).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]),
            ),
            beliefs: Array.isArray(delivered.beliefs) ? delivered.beliefs.length : 0,
            reflections: Array.isArray(delivered.reflections) ? delivered.reflections.length : 0,
            analysisOpportunities: analysisOpportunities(delivered),
            recallPairDelivered:
              object(delivered.recall).route === "laya-recall-v1" &&
              Array.isArray(object(delivered.recall).candidateIds) &&
              (object(delivered.recall).candidateIds as unknown[]).every((id) =>
                (Array.isArray(delivered.evidence) ? delivered.evidence : []).some((e) => object(e).id === id),
              ),
            reduced: delivered.reduced === true,
            recall: delivered.recall,
            recallAcceptance: object(context.cognition).recall,
            coverage: "This is memory and subjective intention, not new game authority or an executed plan.",
          });
        }
        if (requestedRead) {
          const delivered = object(object(JSON.parse(messages[1].content)).requestedRead);
          await observation.record(claim, "ready", "Requested read delivered to decision", {
            tool: requestedRead.tool,
            observedAt: requestedRead.observedAt,
            inputBytes: bytes,
            complete: !delivered.omitted && !delivered.coverage && !delivered.narrowing,
            narrowing: delivered.narrowing,
            coverage: delivered.coverage,
          });
        }
        if (this.adapter.deliveredContextSummary)
          await observation.record(claim, "ready", "Decision context delivered", {
            ...this.adapter.deliveredContextSummary(object(JSON.parse(messages[1].content))),
            ownerGuidance: claim.cohort.owner_guidance,
            inputBytes: bytes,
            inputByteLimit: b.inputByteLimit,
          });
        await observation.recordDebug(claim, "ready", "Model request", {
          execution: n + 1,
          model: m,
          messages: messages.map((message) => {
            let content: unknown = message.content;
            try {
              content = JSON.parse(message.content);
            } catch {
              /* System instructions are plain text. */
            }
            return { role: message.role, content };
          }),
          outputSchema,
          maxOutputTokens: b.maxOutputTokens,
          inputBytes: bytes,
        });
        if (this.model.tracksDispatch) await this.store.phase(claim, "model_preparing_tracked");
        const reservation = await this.store.reserveCall(claim);
        await this.store.phase(claim, this.model.tracksDispatch ? "model_reserved_tracked" : "model_reserved");
        await observation.record(claim, "thinking", "Waiting for the model decision", { execution: n + 1 });
        if (this.stopping) throw new FleetError("CLAIM_FENCED");
        const controller = new AbortController();
        this.controller = controller;
        const guard = setInterval(() => {
          void this.store.active(claim).catch(() => controller.abort());
        }, 500);
        let response: Awaited<ReturnType<ModelPort["decide"]>>;
        const modelStartedAt = this.store.now().getTime();
        try {
          response = await this.model.decide({
            model: m,
            messages,
            schema: outputSchema,
            maxOutputTokens: b.maxOutputTokens,
            onDispatch: () => this.store.phase(claim, "model_dispatched"),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(Math.max(1, Math.min(90000, claim.deadline.getTime() - this.store.now().getTime()))),
            ]),
          });
        } catch (error) {
          if (error instanceof FleetError && error.notDispatched) await this.store.notDispatched(reservation);
          await observation.recordDebug(claim, "thinking", "Model execution failed", {
            execution: n + 1,
            code: safeCode(error),
            notDispatched: error instanceof FleetError && error.notDispatched,
            elapsedMs: Math.max(0, this.store.now().getTime() - modelStartedAt),
          });
          throw error;
        } finally {
          clearInterval(guard);
          if (this.controller === controller) this.controller = undefined;
        }
        await this.store.recordUsage(reservation, response.inputTokens, response.outputTokens);
        await observation.recordDebug(claim, "deciding", "Model response", {
          execution: n + 1,
          elapsedMs: Math.max(0, this.store.now().getTime() - modelStartedAt),
          decision: response.decision,
          outputText: response.outputText ?? null,
          decisionError: response.decisionError ?? null,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          coverage: "Provider final answer only; provider internal reasoning is not captured.",
        });
        if (response.inputTokens === null || response.outputTokens === null) throw new FleetError("USAGE_UNKNOWN");
        if (response.inputTokens + response.outputTokens > b.perCallTokenLimit) throw new FleetError("USAGE_EXCEEDED");
        await this.store.active(claim);
        await this.store.phase(claim, "model_settled");
        const rawDecision = object(response.decision);
        const { cognition: cognitiveUpdate, decision: wrappedDecision, ...flatDecision } = rawDecision;
        const baseDecision =
          wrappedDecision === undefined
            ? flatDecision
            : Object.keys(flatDecision).length
              ? { invalidEnvelope: true }
              : wrappedDecision;
        const { continuation: proposedContinuation, ...decisionFields } = object(
          cognition ? baseDecision : response.decision,
        );
        const parsed = Decision.safeParse(decisionFields);
        if (response.decisionError || !parsed.success) {
          lastCode = response.decisionError ?? "INVALID_MODEL_OUTPUT";
          const feedback = {
            code: lastCode,
            errors: parsed.success ? [] : parsed.error.issues.map((e) => ({ path: e.path, code: e.code })),
            guidance:
              "Return exactly one JSON decision matching decisionSchema. An action needs action.kind and its arguments directly inside action. Keep the answer short enough to finish within the existing output limit. No read, lease or command was submitted by this invalid decision. Correct it using only the remaining decisions, or replan next scheduled turn.",
          };
          await rememberFeedback(feedback);
          await observation.record(claim, "result", "Model output rejected; usage recorded", feedback);
          continue;
        }
        if (requestedRead) {
          for (const entry of [...previousReads, ...reads]) delete entry.requested;
          requestedRead = undefined;
          await this.store.rememberReads(claim, boundedReads(mergeReads([...previousReads, ...reads]), 23800));
        }
        const decision = parsed.data;
        if (proposedContinuation !== undefined) {
          try {
            await continuation.apply(claim, n, proposedContinuation, signals, ownerFingerprint);
          } catch (error) {
            if (!(error instanceof FleetError) || !error.code.startsWith("CONTINUATION_")) throw error;
            await rememberFeedback({
              code: error.code,
              submitted: false,
              guidance:
                "Structured continuation was not saved. Use its current version and valid dependencies; the game decision retains all normal checks.",
            });
            await observation.record(claim, "result", "Structured continuation rejected without authority change", {
              code: error.code,
            });
          }
        }
        if (cognition && cognitiveUpdate !== undefined) {
          try {
            await cognition.apply(
              claim,
              n,
              normalizeAnalysis(cognitiveUpdate, deliveredCognition(object(JSON.parse(messages[1].content)))),
              deliveredCognition(object(JSON.parse(messages[1].content))),
            );
          } catch (error) {
            if (!(error instanceof FleetError) || !error.code.startsWith("COGNITION_")) throw error;
            const feedback = {
              code: error.code,
              proposalType: object(object(cognitiveUpdate).analysis).type ?? "canonical",
              opportunity: object(object(cognitiveUpdate).analysis).opportunity ?? null,
              guidance:
                "Analysis not saved. Use an offered analysisOpportunities key with its exact type; choose none if unsupported. Fleet supplies references/test times. The game decision retains normal checks.",
            };
            decisionFeedback.push(feedback);
            await observation.record(claim, "result", "Cognitive update rejected without changing authority", feedback);
          }
        }
        await observation.record(claim, "deciding", "Model selected the next step", {
          kind: decision.kind,
          outputFieldOrder: Object.keys(rawDecision),
          cognitionFirst: Object.keys(rawDecision)[0] === "cognition",
          summary: decision.summary,
          ...(decision.kind === "read" ? { tool: decision.tool } : {}),
          ...(decision.kind === "action" ? { actionKind: String(decision.action.kind ?? "action") } : {}),
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });
        summary = decision.summary;
        if (decision.kind === "wait") {
          await outcome("wait", { code: "WAIT", summary: decision.summary });
          notes = decision.notes ?? notes;
          lastCode = "WAIT";
          break;
        }
        if (decision.kind === "read") {
          notes = decision.notes ?? notes;
          let result: Data;
          if (decision.tool === "fleet_memory_recall" && cognition) {
            if (
              typeof decision.args.query !== "string" ||
              decision.args.query.length < 1 ||
              decision.args.query.length > 240 ||
              Object.keys(decision.args).length !== 1
            )
              throw new FleetError("INVALID_TOOL_ARGUMENTS");
            cognitiveQuery = decision.args.query;
            result = await cognition.context(claim, cognitivePeers, currentEvidence, cognitiveQuery);
          } else if (decision.tool === "fleet_continuation_schema") {
            const section = decision.args.section ?? "continuation";
            if (
              Object.keys(decision.args).some((key) => key !== "section") ||
              !["continuation", "cognitive_plan", "cognitive_memories"].includes(String(section)) ||
              (section !== "continuation" && !cognition)
            )
              throw new FleetError("INVALID_TOOL_ARGUMENTS");
            if (section !== "continuation")
              result = {
                section,
                schemaAtOutput:
                  section === "cognitive_plan"
                    ? "/properties/cognition/properties/plan"
                    : "/properties/cognition/properties/memories",
                coverage:
                  "The exact requested edit schema is supplied in the next decision's output schema. Only that input's delivered source IDs are admissible; normal owned-state/version checks remain.",
              };
            else
              result = {
                schema: await continuation.schema(claim.agentId),
                state: await continuation.load(claim.agentId),
                observedPostconditionFacts: this.adapter.continuationSignals?.(facts) ?? [],
                coverage:
                  "Supported condition kinds and grounded references currently observed by the game adapter. Missing facts remain unknown; authored targets do not grant authority.",
              };
          } else if (decision.tool === "fleet_action_schema") {
            if (typeof decision.args.kind !== "string" || Object.keys(decision.args).length !== 1)
              throw new FleetError("INVALID_TOOL_ARGUMENTS");
            await observation.record(claim, "reading", "Looking up an action schema", {
              tool: decision.tool,
              args: decision.args,
            });
            result = {
              schema: this.adapter.proposalSchema
                ? (this.adapter.proposalSchema(decision.args.kind, facts) ?? null)
                : actionSchema(decision.args.kind),
              coverage:
                "Schema inspection only, not a fresh game-state read. Null means no currently observed eligible proposal; read fresh facts or choose another action/wait.",
            };
          } else if (decision.tool === "fleet_read_schema") {
            const tool = tools.find((t) => t.name === decision.args.name && isRead(t));
            if (!tool || Object.keys(decision.args).length !== 1) throw new FleetError("INVALID_TOOL_ARGUMENTS");
            await observation.record(claim, "reading", "Looking up a read schema", {
              tool: decision.tool,
              args: decision.args,
            });
            result = { inputSchema: tool.inputSchema, description: tool.description };
          } else {
            const t = tools.find((t) => t.name === decision.tool && isRead(t));
            if (!t) {
              const feedback = {
                code: "READ_TOOL_FORBIDDEN",
                tool: decision.tool,
                availableReads: tools.filter(isRead).map((tool) => tool.name),
                guidance:
                  "This read name is not admitted. No read or command was submitted. Choose an exact availableReads name and inspect its input with fleet_read_schema; do not guess tool versions. Correction uses only remaining decisions in this turn.",
              };
              await rememberFeedback(feedback);
              await outcome("ordinary_read_failure", promptFeedback(feedback));
              await observation.record(claim, "result", "Read tool rejected before submission", feedback);
              lastCode = feedback.code;
              continue;
            }
            const attemptedArgs = object(scrub(structuredClone(decision.args)));
            try {
              validateTool(t, decision.args);
            } catch (error) {
              if (!(error instanceof ToolArgumentError)) throw error;
              const feedback = {
                code: error.code,
                tool: t.name,
                attemptedArgs,
                inputSchema: t.inputSchema,
                ...error.detail,
                schemaLookup: { tool: "fleet_read_schema", args: { name: t.name } },
                guidance:
                  "Correct these fields using the exact input schema. No read or command was submitted. Remaining decision budget is unchanged.",
              };
              await rememberFeedback(feedback);
              await outcome("ordinary_read_failure", promptFeedback(feedback));
              await observation.record(claim, "result", "Read arguments rejected before submission", feedback);
              lastCode = error.code;
              continue;
            }
            await observation.record(claim, "reading", "Reading additional game facts", {
              tool: t.name,
              args: decision.args,
            });
            const preflightRead = this.adapter.preflightRead?.(t.name, decision.args, facts);
            if (preflightRead) {
              const feedback: Data = { tool: t.name, args: decision.args, ...preflightRead };
              await rememberFeedback(feedback);
              await outcome("ordinary_read_failure", promptFeedback(feedback));
              await observation.record(claim, "result", "Read reference rejected before submission", feedback);
              lastCode = String(feedback.code);
              continue;
            }
            try {
              result = await game.read(t.name, decision.args);
            } catch (error) {
              const feedback = this.adapter.readRejection?.(error, t.name, decision.args);
              if (!feedback) throw error;
              await rememberFeedback(feedback);
              await outcome("ordinary_read_failure", promptFeedback(feedback));
              await observation.record(claim, "result", "Ordinary scoped read failed", feedback);
              lastCode = String(feedback.code);
              continue;
            }
            this.adapter.applyRead?.(facts, t.name, decision.args, result, claim.agent.kingdom_id);
            const peer = this.adapter.readPeer(t.name, decision.args);
            if (typeof peer === "string") await communications.ingest(claim.agentId, peer, t.name, result);
            if (cognition && peer)
              for (const entry of this.adapter.normalizeCommunications(claim.agent.kingdom_id, t.name, result))
                if (["message", "agreement"].includes(entry.kind))
                  await cognition.capture(claim, entry.kind as "message" | "agreement", `${peer}:${entry.source}`, {
                    peerId: peer,
                    direction: entry.direction,
                    body: entry.body,
                    gameTime: entry.gameTime,
                    coverage: "Observed account-owned exchange; peer claims are untrusted.",
                  });
            await observeCognitiveState(`snapshot:${claim.id}:read:${n}`);
          }
          if (decisionFeedback.some((f) => f.tool === decision.tool)) {
            decisionFeedback.splice(
              0,
              decisionFeedback.length,
              ...decisionFeedback.filter((f) => f.tool !== decision.tool),
            );
            await this.store.rememberDecisionFeedback(claim, decisionFeedback.at(-1) ?? null);
          }
          await outcome("read", {
            code: "READ",
            tool: decision.tool,
            parameters: promptFeedback({ attemptedArgs: decision.args }).attemptedReferences ?? {},
          });
          requestedRead = {
            tool: decision.tool,
            args: decision.args,
            result,
            observedAt: this.store.now().toISOString(),
          };
          reads.push(requestedRead);
          await observation.recordDebug(claim, "ready", "Tool response", {
            execution: n + 1,
            tool: decision.tool,
            args: decision.args,
            result,
          });
          await observation.record(claim, "ready", "Read completed", {
            tool: decision.tool,
            resultFields: Object.keys(result).slice(0, 24),
            resultBytes: Buffer.byteLength(JSON.stringify(result)),
          });
          const remembered = boundedReads(mergeReads([...previousReads, ...reads]), 23800).map((r) => {
            const { requested: _oldMarker, ...entry } = r;
            return JSON.stringify([r.tool, r.args]) === JSON.stringify([requestedRead?.tool, requestedRead?.args])
              ? { ...entry, requested: true }
              : entry;
          });
          await this.store.rememberReads(claim, remembered);
          lastCode = "READ";
          continue;
        }
        if (actions >= b.maxActionsPerTurn) {
          lastCode = "TURN_ACTION_LIMIT";
          break;
        }
        const permission = capability?.matrix?.find((c) => c.kind === decision.action.kind && c.blocked);
        const preflight = permission
          ? {
              code: String(permission.blocked),
              permission,
              guidance:
                "The observed policy does not permit this route. No command or approval was submitted; the actual owner must review authority. Choose another authorized step or wait.",
            }
          : capability?.humanOnly.includes(String(decision.action.kind))
            ? {
                code: "HUMAN_DECISION_REQUIRED",
                guidance:
                  "This action requires the actual owner. No command or approval was submitted. Choose another authorized step or wait.",
              }
            : this.adapter.preflight?.(decision.action, facts);
        const recordNotSubmitted = async (code: string) => {
          await outcome("not_submitted", {
            code,
            actionKind: decision.action.kind,
            submitted: false,
            reference: promptFeedback({ attemptedArgs: decision.action }).attemptedReferences ?? {},
          });
          if (cognition)
            await cognition.capture(claim, "receipt", `not-submitted:${claim.id}:${n}`, {
              intent: decision.summary,
              actionKind: decision.action.kind,
              code,
              source: "controller_rejection",
              submitted: false,
              committed: false,
              coverage: "Controller validation outcome. No lease or game command was submitted.",
            });
        };
        if (preflight) {
          await rememberFeedback({ actionKind: decision.action.kind, attemptedArgs: decision.action, ...preflight });
          lastCode = String(preflight.code);
          await recordNotSubmitted(lastCode);
          await observation.record(claim, "result", "Proposed action deferred before submission", {
            ...preflight,
            action: decision.action,
            committed: false,
          });
          continue;
        }
        let attemptedSchema: Data | undefined;
        try {
          attemptedSchema = executableActionSchema(actionSchema(String(decision.action.kind)));
          validateTool({ name: "game-action", inputSchema: attemptedSchema }, decision.action);
        } catch (error) {
          if (!(error instanceof FleetError)) throw error;
          lastCode = "INVALID_GAME_ACTION";
          await recordNotSubmitted(lastCode);
          const feedback = {
            code: lastCode,
            actionKind: decision.action.kind,
            ...(error instanceof ToolArgumentError ? error.detail : {}),
            ...(attemptedSchema && Buffer.byteLength(JSON.stringify(attemptedSchema)) < 5000
              ? { inputSchema: attemptedSchema }
              : {}),
            availableKinds: capability?.kinds ?? actionKinds,
            guidance:
              "Choose an exact admitted game action kind and use fleet_action_schema for its fields. Put command arguments directly inside action. No lease or command was submitted.",
          };
          await rememberFeedback(feedback);
          await observation.record(claim, "result", "Action shape rejected before submission", feedback);
          continue;
        }
        const freshCatalog = await game.tools();
        this.adapter.validateCatalog?.(freshCatalog);
        if (schemaChanged(tools, freshCatalog)) throw new FleetError("SCHEMA_CHANGED");
        await game.open();
        await this.store.active(claim);
        const action = this.owner ? await this.owner.prepare(claim, decision.action) : decision.action;
        const id = randomUUID();
        await this.store.pending(claim, id, action, true);
        let receipt: Data,
          source: "receipt" | "explicit_rejection" = "receipt",
          rejectionEvidence: Data = {};
        try {
          await this.store.active(claim);
          if (this.stopping) throw new FleetError("CLAIM_FENCED");
          await this.store.phase(claim, "command_dispatched");
          receipt = await game.submit(id, action);
        } catch (error) {
          if (error instanceof RemoteRejection && error.status >= 500) throw new FleetError("TRANSPORT_UNCERTAIN");
          if (this.adapter.ownerFallback(error) && this.owner) {
            await this.store.active(claim);
            try {
              receipt = await this.owner.submit(claim, id, action);
            } catch (ownerError) {
              if (ownerError instanceof RemoteRejection && ownerError.status >= 500)
                throw new FleetError("TRANSPORT_UNCERTAIN");
              const rejection =
                safeCode(ownerError) === "OWNER_APPROVAL_REQUIRED" && error instanceof RemoteRejection
                  ? this.adapter.rejection(error, false)
                  : this.adapter.rejection(ownerError, true);
              if (!rejection) throw ownerError;
              receipt = { commandId: id, code: rejection };
              source = "explicit_rejection";
              rejectionEvidence = {
                code: rejection,
                status: ownerError instanceof RemoteRejection ? ownerError.status : null,
                path: "owner_policy_or_endpoint",
              };
            }
          } else {
            const rejection = this.adapter.rejection(error, false);
            if (!rejection) throw error;
            receipt = { commandId: id, code: rejection };
            source = "explicit_rejection";
            rejectionEvidence = {
              code: rejection,
              status: error instanceof RemoteRejection ? error.status : null,
              path: "game_submission",
            };
          }
        }
        await this.store.receipt(claim, receipt, source, rejectionEvidence);
        if (cognition)
          await cognition.capture(claim, "receipt", id, {
            commandId: id,
            peerId: this.adapter.actionPeer(decision.action),
            submitted: true,
            intent: decision.summary,
            action: decision.action,
            receipt,
            source,
            committed: ["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code)),
          });
        lastCode = String(receipt.code);
        notes = decision.notes ?? notes;
        actions++;
        reads.push({ commandId: id, action: decision.action, receipt, source });
        await outcome(["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code)) ? "committed" : "rejected", {
          code: receipt.code,
          commandId: id,
          actionKind: action.kind,
          source,
          recordVersions: receipt.recordVersions ?? {},
        });
        if (!["COMMITTED", "ALREADY_COMMITTED"].includes(lastCode)) {
          await rememberFeedback({
            code: lastCode,
            actionKind: action.kind,
            commandId: id,
            submitted: true,
            committed: false,
            source,
            detail: rejectionEvidence,
            guidance:
              "This known rejection did not commit. Original receipt/reference and failure remain recorded; replan from fresh facts without treating WAIT as resolution.",
          });
          break;
        }
        const resolved = decisionFeedback.filter(
          (feedback) =>
            feedback.actionKind === decision.action.kind &&
            ["INVALID_GAME_ACTION", "OBSERVED_MANDATE_VERSION_MISMATCH"].includes(String(feedback.code)),
        );
        if (resolved.length) {
          decisionFeedback.splice(
            0,
            decisionFeedback.length,
            ...decisionFeedback.filter((feedback) => !resolved.includes(feedback)),
          );
          await this.store.rememberDecisionFeedback(claim, decisionFeedback.at(-1) ?? null);
          await observation.record(claim, "ready", "Prior input rejection resolved by a committed action", {
            actionKind: decision.action.kind,
            resolvedCodes: resolved.map((feedback) => feedback.code),
            meaning: "Old rejection history retained; resolved input feedback omitted from subsequent decisions.",
          });
        }
        const peer = this.adapter.actionPeer(action);
        if (peer) await observePeer(peer);
        await this.store.active(claim);
        Object.assign(facts, await this.adapter.initial(game, claim.agent.kingdom_id, initialContext));
        await observeCognitiveState(`snapshot:${claim.id}:after:${n}`);
      }
    } catch (error) {
      lastCode = safeCode(error);
      summary = "Turn interrupted; inspect the recorded status before resuming.";
      try {
        const pending = (await this.store.pool.query("SELECT pending_command FROM turns WHERE id=$1", [claim.id]))
          .rows[0]?.pending_command;
        await outcome(pending ? "uncertain" : "interrupted", {
          code: lastCode,
          ...(pending ? { commandId: pending, source: "actual_original_pending_command" } : { submitted: false }),
        });
      } catch {
        /* Fencing must not allow a late continuation write or erase the original turn outcome. */
      }
    } finally {
      if (game)
        try {
          await game.close();
        } catch {
          summary = "Lease close uncertain; normal expiry applies. Inspect the turn outcome.";
        }
      await this.store.finish(claim, lastCode, summary, notes);
    }
  }
  async reviewRejected(turnId: string, commandId: string, code: string, note: string) {
    if (!this.liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
    const t = (await this.store.pool.query("SELECT * FROM turns WHERE id=$1", [turnId])).rows[0];
    if (
      !t ||
      t.pending_command !== commandId ||
      t.code !== code ||
      !this.adapter.reviewableRejection?.(code, object(t.pending_action))
    )
      throw new FleetError("REJECTION_REVIEW_UNSUPPORTED");
    const a = await this.store.agent(t.agent_id),
      cohort = await this.store.cohort(t.cohort_id);
    if (cohort.state !== "paused") throw new FleetError("PAUSED_REVIEW_REQUIRED");
    const game = await this.game(t.agent_id);
    try {
      if ((await game.profile()).accountId !== a.account_id) throw new FleetError("IDENTITY_MISMATCH");
      await this.adapter.initial(game, a.kingdom_id);
      try {
        await game.receipt(commandId);
        throw new FleetError("RECEIPT_EXISTS_RECONCILE_REQUIRED");
      } catch (error) {
        if (!(error instanceof RemoteRejection) || error.status !== 200 || error.code !== "RECEIPT_NOT_FOUND")
          throw error;
      }
      await this.store.reviewRejectedCommand(turnId, commandId, code, note);
      return { commandId, code, source: "operator_review", replayed: false };
    } finally {
      await game.close();
    }
  }
  async reconcile(turnId: string) {
    if (!this.liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
    const t = (await this.store.pool.query("SELECT * FROM turns WHERE id=$1 AND pending_command IS NOT NULL", [turnId]))
      .rows[0];
    if (!t) throw new FleetError("NO_PENDING_COMMAND");
    const game = await this.game(t.agent_id);
    try {
      const receipt = await game.receipt(t.pending_command);
      if (receipt.commandId !== t.pending_command) throw new FleetError("RECEIPT_MISMATCH");
      if (["RECEIPT_NOT_FOUND", "NOT_FOUND", "PENDING"].includes(String(receipt.code))) return receipt;
      await this.store.receipt({ id: t.id, agentId: t.agent_id, cohortId: t.cohort_id }, receipt, "receipt", {}, true);
      return receipt;
    } finally {
      await game.close();
    }
  }
}
export async function enoughDisk(path: string, minBytes = 10 * 1024 ** 3) {
  const stats = await statfs(path);
  return stats.bavail * stats.bsize >= minBytes;
}
