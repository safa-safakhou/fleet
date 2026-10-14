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
import type { DecisionSupport } from "./decision.js";
import {
  type Data,
  Decision,
  decisionSchema,
  FleetError,
  type GamePort,
  type ModelPort,
  object,
  safeCode,
} from "./domain.js";
import type { GameAdapter } from "./game.js";
import { RemoteRejection } from "./http.js";
import { Observability, scrub } from "./observability.js";
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
    const cognition = m.cognition ? (this.cognitionSupport ?? new Cognition(this.store)) : undefined;
    const { actionKinds, actionSchema, boundedReads, mergeReads } = this.adapter;
    const isRead = (tool: import("./domain.js").Tool) =>
      tool.annotations?.readOnlyHint === true && this.adapter.isRead(tool);
    try {
      await this.store.active(claim);
      await observation.record(claim, "observing", "Reading current game state");
      game = await this.game(claim.agentId);
      const profile = await game.profile();
      if (profile.accountId !== claim.agent.account_id) throw new FleetError("IDENTITY_MISMATCH");
      const tools = await game.tools();
      const turnIndex = (
        await this.store.pool.query("SELECT count(*)::int n FROM turns WHERE agent_id=$1", [claim.agentId])
      ).rows[0].n;
      const initialContext = {
        ordinal: claim.agent.ordinal,
        count: claim.cohort.count,
        turn: turnIndex,
        name: claim.cohort.name,
      };
      const facts: Data = await this.adapter.initial(game, claim.agent.kingdom_id, initialContext);
      let cognitivePeers: string[] = [],
        currentEvidence = "",
        cognitiveQuery = claim.agent.strategy.objective;
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
          const result = await connectedGame.read(name, args);
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
          if (Buffer.byteLength(JSON.stringify(result)) < 6000)
            reads.push({ tool: name, args, result, observedAt: this.store.now().toISOString() });
          else
            reads.push({
              tool: name,
              args,
              observation:
                "A full page was observed and retained if consented. It exceeds this turn's compact context; request the relevant read before relying on its contents.",
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
        await this.store.active(claim);
        const capability = this.adapter.availableActions?.(facts, claim.cohort.synthetic_owner_policy);
        const context = {
          ownerValues: claim.agent.strategy,
          ...(cognition
            ? { cognition: await cognition.context(claim, cognitivePeers, currentEvidence, cognitiveQuery) }
            : {}),
          ...(strategicFocus ? { strategicFocus } : {}),
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
            })),
          readHistoryCoverage:
            "Historical facts may be stale. The environment is fresh; re-read current facts before dependent commitments.",
          gameActionKinds: capability?.kinds ?? actionKinds,
          suppliedActionSchemas: capability?.schemas ?? [],
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
          decisionFeedback,
          availableReads: tools
            .filter(isRead)
            .map((t) => ({ name: t.name, description: t.description?.slice(0, 180) })),
          suppliedReadSchemas: this.adapter.suppliedReadSchemas?.(tools.filter(isRead)) ?? [],
          convenienceRead: { name: "fleet_action_schema", args: { kind: "one observed gameActionKinds value" } },
          readSchemaLookup: { name: "fleet_read_schema", args: { name: "one availableReads name" } },
          decisionSchema: cognition ? analysisDecisionGuide : decisionSchema,
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
        let outputSchema = cognition
          ? analysisSchemaForVersion(object(context.cognition).version, deliveredCognition(context))
          : decisionSchema;
        const instructions = this.adapter.instructions + (cognition ? ` ${analysisInstructions}` : "");
        let messages: ReturnType<typeof fitMessages>;
        try {
          let fittingContext: Data = context;
          for (let pass = 0; ; pass++) {
            if (pass >= 16) throw new FleetError("CONTEXT_LIMIT");
            messages = fitMessages(
              fittingContext,
              instructions,
              outputSchema,
              b.inputByteLimit,
              boundedReads,
              this.adapter.narrowRead,
              this.adapter.compactEnvironment,
            );
            if (!cognition) break;
            fittingContext = object(JSON.parse(messages[1].content));
            outputSchema = analysisSchemaForVersion(
              object(context.cognition).version,
              deliveredCognition(fittingContext),
            );
            if (
              Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(outputSchema)) <=
              b.inputByteLimit
            )
              break;
            // Refit only the already delivered subset, then constrain IDs again.
            // No evicted source can become an admissible citation through padding.
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
        const reservation = await this.store.reserveCall(claim);
        await observation.record(claim, "thinking", "Waiting for the model decision", { execution: n + 1 });
        if (this.stopping) throw new FleetError("CLAIM_FENCED");
        const controller = new AbortController();
        this.controller = controller;
        const guard = setInterval(() => {
          void this.store.active(claim).catch(() => controller.abort());
        }, 500);
        let response: Awaited<ReturnType<ModelPort["decide"]>>;
        try {
          response = await this.model.decide({
            model: m,
            messages,
            schema: outputSchema,
            maxOutputTokens: b.maxOutputTokens,
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(Math.max(1, Math.min(90000, claim.deadline.getTime() - this.store.now().getTime()))),
            ]),
          });
        } finally {
          clearInterval(guard);
          if (this.controller === controller) this.controller = undefined;
        }
        await this.store.recordUsage(reservation, response.inputTokens, response.outputTokens);
        if (response.inputTokens === null || response.outputTokens === null) throw new FleetError("USAGE_UNKNOWN");
        if (response.inputTokens + response.outputTokens > b.perCallTokenLimit) throw new FleetError("USAGE_EXCEEDED");
        await this.store.active(claim);
        const rawDecision = object(response.decision);
        const { cognition: cognitiveUpdate, ...baseDecision } = rawDecision;
        const parsed = Decision.safeParse(cognition ? baseDecision : response.decision);
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
          summary: decision.summary,
          ...(decision.kind === "read" ? { tool: decision.tool } : {}),
          ...(decision.kind === "action" ? { actionKind: String(decision.action.kind ?? "action") } : {}),
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });
        summary = decision.summary;
        if (decision.kind === "wait") {
          await this.store.rememberDecisionFeedback(claim, null);
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
          } else if (decision.tool === "fleet_action_schema") {
            if (typeof decision.args.kind !== "string" || Object.keys(decision.args).length !== 1)
              throw new FleetError("INVALID_TOOL_ARGUMENTS");
            await observation.record(claim, "reading", "Looking up an action schema", {
              tool: decision.tool,
              args: decision.args,
            });
            result = { schema: actionSchema(decision.args.kind) };
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
              decisionFeedback.push(feedback);
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
              decisionFeedback.push(feedback);
              await observation.record(claim, "result", "Read arguments rejected before submission", feedback);
              lastCode = error.code;
              continue;
            }
            await observation.record(claim, "reading", "Reading additional game facts", {
              tool: t.name,
              args: decision.args,
            });
            result = await game.read(t.name, decision.args);
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
          requestedRead = {
            tool: decision.tool,
            args: decision.args,
            result,
            observedAt: this.store.now().toISOString(),
          };
          reads.push(requestedRead);
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
          await rememberFeedback({ actionKind: decision.action.kind, ...preflight });
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
          attemptedSchema = actionSchema(String(decision.action.kind));
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
        if (schemaChanged(tools, await game.tools())) throw new FleetError("SCHEMA_CHANGED");
        await this.store.rememberDecisionFeedback(claim, null);
        await game.open();
        await this.store.active(claim);
        const action = this.owner ? await this.owner.prepare(claim, decision.action) : decision.action;
        const id = randomUUID();
        await this.store.pending(claim, id, action);
        let receipt: Data,
          source: "receipt" | "explicit_rejection" = "receipt",
          rejectionEvidence: Data = {};
        try {
          await this.store.active(claim);
          if (this.stopping) throw new FleetError("CLAIM_FENCED");
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
        if (!["COMMITTED", "ALREADY_COMMITTED"].includes(lastCode)) break;
        const peer = this.adapter.actionPeer(action);
        if (peer) await observePeer(peer);
        await this.store.active(claim);
        Object.assign(facts, await this.adapter.initial(game, claim.agent.kingdom_id, initialContext));
        await observeCognitiveState(`snapshot:${claim.id}:after:${n}`);
      }
    } catch (error) {
      lastCode = safeCode(error);
      summary = "Turn interrupted; inspect the recorded status before resuming.";
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
