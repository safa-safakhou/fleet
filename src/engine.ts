import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { Communications } from "./communications.js";
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
import { Observability } from "./observability.js";
import type { Claim, Store } from "./store.js";
import { schemaChanged, validateTool } from "./tools.js";

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
      const facts: Data = await this.adapter.initial(game, claim.agent.kingdom_id);
      const reads: Data[] = [];
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
          if (Buffer.byteLength(JSON.stringify(result)) < 6000) reads.push({ tool: name, args, result });
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
          readResults: boundedReads([...previousReads, ...reads]),
          commandResults: reads
            .filter((r) => typeof r.commandId === "string")
            .map((r) => ({ commandId: r.commandId, actionKind: object(r.action).kind, receipt: r.receipt })),
          readHistoryCoverage:
            "Read entries can include observations from previous turns, dated by observedAt. Historical facts may be stale; they do not grant authority or prove current state. Current environment is freshly read. Obtain current facts before a dependent commitment.",
          gameActionKinds: actionKinds,
          availableReads: tools
            .filter(isRead)
            .map((t) => ({ name: t.name, description: t.description?.slice(0, 180) })),
          convenienceRead: { name: "fleet_action_schema", args: { kind: "one observed gameActionKinds value" } },
          readSchemaLookup: { name: "fleet_read_schema", args: { name: "one availableReads name" } },
          decisionSchema,
        };
        let messages = [
          { role: "system", content: this.adapter.instructions },
          { role: "user", content: JSON.stringify(context) },
        ];
        if (Buffer.byteLength(JSON.stringify(messages)) > b.inputByteLimit) {
          const smaller = {
            ...context,
            availableReads: tools.filter(isRead).map((t) => ({ name: t.name })),
            readResults: boundedReads([...previousReads, ...reads], 8000),
            environment: this.adapter.compactFacts(facts),
            omissions: [
              "Read descriptions omitted for space; use fleet_read_schema for exact arguments. Partial observations label missing facts explicitly.",
            ],
          };
          messages = [
            { role: "system", content: this.adapter.instructions },
            { role: "user", content: JSON.stringify(smaller) },
          ];
        }
        const bytes = Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(decisionSchema));
        if (bytes > b.inputByteLimit || bytes + b.maxOutputTokens + 1024 > b.perCallTokenLimit)
          throw new FleetError("CONTEXT_LIMIT");
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
            if (!t) throw new FleetError("READ_TOOL_FORBIDDEN");
            validateTool(t, decision.args);
            await observation.record(claim, "reading", "Reading additional game facts", {
              tool: t.name,
              args: decision.args,
            });
            result = await game.read(t.name, decision.args);
            const peer = this.adapter.readPeer(t.name, decision.args);
            if (typeof peer === "string") await communications.ingest(claim.agentId, peer, t.name, result);
          }
          reads.push({ tool: decision.tool, args: decision.args, result, observedAt: this.store.now().toISOString() });
          await observation.record(claim, "ready", "Read completed", {
            tool: decision.tool,
            resultFields: Object.keys(result).slice(0, 24),
            resultBytes: Buffer.byteLength(JSON.stringify(result)),
          });
          await this.store.rememberReads(claim, boundedReads(mergeReads([...previousReads, ...reads]), 24000));
          lastCode = "READ";
          continue;
        }
        if (actions >= b.maxActionsPerTurn) {
          lastCode = "TURN_ACTION_LIMIT";
          break;
        }
        if (schemaChanged(tools, await game.tools())) throw new FleetError("SCHEMA_CHANGED");
        await game.open();
        await this.store.active(claim);
        const action = this.owner ? await this.owner.prepare(claim, decision.action) : decision.action;
        const id = randomUUID();
        await this.store.pending(claim, id, action);
        let receipt: Data;
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
              const rejection = this.adapter.rejection(ownerError, true);
              if (!rejection) throw ownerError;
              receipt = { commandId: id, code: rejection };
            }
          } else {
            const rejection = this.adapter.rejection(error, false);
            if (!rejection) throw error;
            receipt = { commandId: id, code: rejection };
          }
        }
        await this.store.receipt(claim, receipt);
        lastCode = String(receipt.code);
        notes = decision.notes ?? notes;
        actions++;
        reads.push({ commandId: id, action: decision.action, receipt });
        if (!["COMMITTED", "ALREADY_COMMITTED"].includes(lastCode)) break;
        const peer = this.adapter.actionPeer(action);
        if (peer) await observePeer(peer);
        await this.store.active(claim);
        Object.assign(facts, await this.adapter.initial(game, claim.agent.kingdom_id));
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
      await this.store.pool.query(
        "UPDATE turns SET state='finished',code=$2,pending_command=NULL,pending_action=NULL,finished_at=$3,actions=actions+$5 WHERE id=$1 AND pending_command=$4",
        [
          t.id,
          receipt.code,
          this.store.now(),
          t.pending_command,
          ["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code)) ? 1 : 0,
        ],
      );
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
