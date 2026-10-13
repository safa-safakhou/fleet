import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { Communications } from "./communications.js";
import { fitMessages } from "./context.js";
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
      const attention = this.adapter.attention?.(facts);
      await observation.record(
        claim,
        attention ? "result" : "ready",
        attention ? "Game needs owner recovery" : "Game blockers checked",
        attention ? { ...attention.detail, label: attention.label } : { needsOwner: false },
      );
      const reads: Data[] = [];
      let requestedRead: Data | undefined;
      const decisionFeedback: Data[] = [];
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
      for (let n = 0; n < b.maxCallsPerTurn; n++) {
        await this.store.active(claim);
        const capability = this.adapter.availableActions?.(facts, claim.cohort.synthetic_owner_policy);
        const context = {
          ownerValues: claim.agent.strategy,
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
            "Read entries can include observations from previous turns, dated by observedAt. Historical facts may be stale; they do not grant authority or prove current state. Current environment is freshly read. Obtain current facts before a dependent commitment.",
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
            "Action advertisement is conditional, not a grant. Authentication, command scope, live write lease, current mandate, social delegation, owner policy, exact permits, targets, quotas, stock and prerequisites are checked by the server on each submission.",
          decisionFeedback,
          availableReads: tools
            .filter(isRead)
            .map((t) => ({ name: t.name, description: t.description?.slice(0, 180) })),
          suppliedReadSchemas: this.adapter.suppliedReadSchemas?.(tools.filter(isRead)) ?? [],
          convenienceRead: { name: "fleet_action_schema", args: { kind: "one observed gameActionKinds value" } },
          readSchemaLookup: { name: "fleet_read_schema", args: { name: "one availableReads name" } },
          decisionSchema,
        };
        const messages = fitMessages(
          context,
          this.adapter.instructions,
          decisionSchema,
          b.inputByteLimit,
          boundedReads,
          this.adapter.narrowRead,
          this.adapter.compactEnvironment,
        );
        const bytes = Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(decisionSchema));
        if (bytes > b.inputByteLimit || bytes + b.maxOutputTokens + 1024 > b.perCallTokenLimit)
          throw new FleetError("CONTEXT_LIMIT");
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
            schema: decisionSchema,
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
        if (m.route === "codex-cli") {
          if (response.inputTokens === null || response.outputTokens === null) throw new FleetError("USAGE_UNKNOWN");
          if (response.inputTokens + response.outputTokens > b.perCallTokenLimit)
            throw new FleetError("USAGE_EXCEEDED");
        }
        await this.store.active(claim);
        const parsed = Decision.safeParse(response.decision);
        if (!parsed.success) throw new FleetError("INVALID_DECISION");
        if (requestedRead) {
          for (const entry of [...previousReads, ...reads]) delete entry.requested;
          requestedRead = undefined;
          await this.store.rememberReads(claim, boundedReads(mergeReads([...previousReads, ...reads]), 23800));
        }
        const decision = parsed.data;
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
          notes = decision.notes ?? notes;
          lastCode = "WAIT";
          break;
        }
        if (decision.kind === "read") {
          notes = decision.notes ?? notes;
          let result: Data;
          if (decision.tool === "fleet_action_schema") {
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
        if (preflight) {
          decisionFeedback.push({ action: decision.action, ...preflight });
          lastCode = String(preflight.code);
          await observation.record(claim, "result", "Proposed action deferred before submission", {
            ...preflight,
            action: decision.action,
            committed: false,
          });
          continue;
        }
        if (schemaChanged(tools, await game.tools())) throw new FleetError("SCHEMA_CHANGED");
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
        lastCode = String(receipt.code);
        notes = decision.notes ?? notes;
        actions++;
        reads.push({ commandId: id, action: decision.action, receipt, source });
        if (!["COMMITTED", "ALREADY_COMMITTED"].includes(lastCode)) break;
        const peer = this.adapter.actionPeer(action);
        if (peer) await observePeer(peer);
        await this.store.active(claim);
        Object.assign(facts, await this.adapter.initial(game, claim.agent.kingdom_id, initialContext));
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
