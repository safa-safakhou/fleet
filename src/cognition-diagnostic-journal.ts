import { createHash, randomUUID } from "node:crypto";
import { type FileHandle, open } from "node:fs/promises";
import { z } from "zod";
import type { RecallPort } from "./cognition.js";
import { FleetError, type ModelPort, safeCode } from "./domain.js";
import { layaRevision } from "./laya.js";
import { qualifyOutput } from "./qualification.js";
import type { Vault } from "./vault.js";

const Approval = z
  .object({
    schemaVersion: z.literal("fleet.cognition-diagnostic.v1"),
    id: z.uuid(),
    authorizationRef: z.string().min(5).max(200),
    approved: z.literal(true),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    startsAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    endpoint: z.string(),
    helperEndpoint: z.string(),
    modelLimit: z.literal(64),
    tokenLimit: z.literal(2560000),
    helperLimit: z.literal(160),
    scope: z.literal("synthetic_fixtures_only"),
  })
  .strict();
export function diagnosticApproval(raw: unknown) {
  const p = Approval.parse(raw);
  for (const [raw, port, helper] of [
    [p.endpoint, "11434", false],
    [p.helperEndpoint, "8832", true],
  ] as const) {
    const u = new URL(raw),
      parts = u.hostname.split(".").map(Number);
    const local =
      u.hostname === "localhost" ||
      (parts.length === 4 &&
        parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
        (parts[0] === 127 ||
          (!helper &&
            (parts[0] === 10 ||
              (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
              (parts[0] === 192 && parts[1] === 168)))));
    if (
      !local ||
      u.protocol !== "http:" ||
      u.port !== port ||
      u.pathname !== "/" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new FleetError("DIAGNOSTIC_LOCAL_ENDPOINT_REQUIRED");
  }
  const span = Date.parse(p.deadlineAt) - Date.parse(p.startsAt);
  if (span <= 0 || span > 7200000) throw new FleetError("DIAGNOSTIC_WINDOW");
  return p;
}
export type DiagnosticApproval = ReturnType<typeof diagnosticApproval>;
export type DiagnosticScope = {
  thinking?: boolean;
  profile?: "legacy-cognition" | "reactive-cognition";
  turn: string;
  lane?: "standalone" | "embedded";
  arm?: string;
  order?: number;
  expected?: string | null;
};
type Entry = {
  id: string;
  kind: "model" | "helper";
  scope: DiagnosticScope;
  state: string;
  inputTokens?: number;
  outputTokens?: number;
};
export class DiagnosticJournal {
  private entries: Entry[] = [];
  private state = "active";
  private previous = "0".repeat(64);
  private busy = false;
  private constructor(
    private file: FileHandle,
    readonly approval: DiagnosticApproval,
    private vault: Vault,
    private now: () => number,
  ) {}
  static async create(path: string, approval: DiagnosticApproval, vault: Vault, now = Date.now) {
    const file = await open(path, "wx", 0o600);
    const journal = new DiagnosticJournal(file, diagnosticApproval(approval), vault, now);
    await journal.write({ type: "approval", approval });
    return journal;
  }
  private async write(value: unknown) {
    const body = { previous: this.previous, at: new Date(this.now()).toISOString(), value };
    const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    await this.file.writeFile(`${JSON.stringify({ ...body, hash })}\n`);
    await this.file.sync();
    this.previous = hash;
  }
  assertActive() {
    if (this.state !== "active") throw new FleetError("DIAGNOSTIC_STOPPED");
    if (this.now() < Date.parse(this.approval.startsAt) || this.now() >= Date.parse(this.approval.deadlineAt))
      throw new FleetError("DIAGNOSTIC_DEADLINE");
  }
  async invoke<T>(
    kind: "model" | "helper",
    scope: DiagnosticScope,
    request: unknown,
    operation: (dispatch: () => Promise<void>) => Promise<T>,
  ) {
    this.assertActive();
    if (this.busy) throw new FleetError("DIAGNOSTIC_SERIAL_REQUIRED");
    const entries = this.entries.filter((e) => e.kind === kind);
    const sameTurn = (e: Entry) =>
      e.scope.thinking === scope.thinking && e.scope.profile === scope.profile && e.scope.turn === scope.turn;
    let exhausted: boolean;
    if (kind === "model") {
      if (
        typeof scope.thinking !== "boolean" ||
        !["legacy-cognition", "reactive-cognition"].includes(scope.profile ?? "")
      )
        throw new FleetError("DIAGNOSTIC_SCOPE");
      exhausted =
        entries.length >= 64 ||
        entries.filter((e) => e.scope.thinking === scope.thinking).length >= 32 ||
        entries.filter((e) => e.scope.thinking === scope.thinking && e.scope.profile === scope.profile).length >= 16 ||
        entries.filter(sameTurn).length >= 2;
    } else {
      if (
        !scope.lane ||
        (scope.lane === "embedded" && (scope.profile !== "legacy-cognition" || typeof scope.thinking !== "boolean"))
      )
        throw new FleetError("DIAGNOSTIC_SCOPE");
      exhausted =
        entries.length >= 160 ||
        entries.filter((e) => e.scope.lane === scope.lane).length >= (scope.lane === "standalone" ? 96 : 64) ||
        (scope.lane === "embedded" && entries.filter(sameTurn).length >= 4);
    }
    if (exhausted) {
      this.state = "blocked";
      await this.write({ type: "stop", code: "DIAGNOSTIC_BUDGET" });
      throw new FleetError("DIAGNOSTIC_BUDGET");
    }
    this.busy = true;
    const entry: Entry = { id: randomUUID(), kind, scope, state: "prepared" };
    this.entries.push(entry);
    try {
      await this.write({
        type: "reserve",
        ...entry,
        reservedTokens: kind === "model" ? 40000 : 0,
        detail: this.vault.encrypt(request, `diagnostic:${entry.id}:request`),
      });
      const result = await operation(async () => {
        this.assertActive();
        if (entry.state !== "prepared") throw new FleetError("DIAGNOSTIC_DOUBLE_DISPATCH");
        await this.write({ type: "dispatch", id: entry.id });
        entry.state = "dispatched";
      });
      if (entry.state !== "dispatched") throw new FleetError("DIAGNOSTIC_DISPATCH_MISSING");
      await this.write({
        type: "result",
        id: entry.id,
        detail: this.vault.encrypt(result, `diagnostic:${entry.id}:result`),
      });
      entry.state = "reported";
      return result;
    } catch (e) {
      const unknown = entry.state === "dispatched";
      entry.state = unknown ? "unknown" : "not_dispatched";
      this.state = "blocked";
      await this.write({ type: "failure", id: entry.id, state: entry.state, code: safeCode(e) });
      throw e;
    } finally {
      this.busy = false;
    }
  }
  model(provider: ModelPort, scope: DiagnosticScope): ModelPort {
    return {
      tracksDispatch: true,
      decide: async (input) => {
        if (
          input.model.route !== "ollama" ||
          input.model.model !== "nemotron-3-nano:4b" ||
          input.model.thinking !== scope.thinking ||
          input.maxOutputTokens > 2000 ||
          Buffer.byteLength(JSON.stringify(input.messages)) > 24000
        )
          throw new FleetError("DIAGNOSTIC_MODEL_SCOPE");
        const result = await this.invoke(
          "model",
          scope,
          { messages: input.messages, schema: input.schema, model: input.model },
          async (mark) => {
            const dispatch = async () => {
              await mark();
              await input.onDispatch?.();
            };
            if (!provider.tracksDispatch) await dispatch();
            const response = await provider.decide({
              ...input,
              signal: AbortSignal.any([input.signal, AbortSignal.timeout(90000)]),
              onDispatch: dispatch,
            });
            if (
              ![response.inputTokens, response.outputTokens].every(
                (n) => n !== null && Number.isSafeInteger(n) && n >= 0,
              ) ||
              Number(response.inputTokens) + Number(response.outputTokens) > 40000
            )
              throw new FleetError("DIAGNOSTIC_UNKNOWN_OR_EXCESS_USAGE");
            return { ...response, validation: qualifyOutput(input.schema, input.messages, response.decision) };
          },
        );
        const entry = this.entries.at(-1);
        if (!entry || result.inputTokens === null || result.outputTokens === null)
          throw new FleetError("DIAGNOSTIC_RESULT_MISSING");
        entry.inputTokens = result.inputTokens;
        entry.outputTokens = result.outputTokens;
        return result;
      },
    };
  }
  recall(scope: DiagnosticScope, transport: typeof fetch = fetch): RecallPort {
    return {
      choose: async (query, candidates, signal) => {
        const raw = await this.invoke("helper", scope, { query, candidates }, async (mark) => {
          if (
            query.length > 240 ||
            candidates.length !== 2 ||
            new Set(candidates.map((c) => c.id)).size !== 2 ||
            candidates.some((c) => c.text.length > 220) ||
            ![query, ...candidates.map((c) => c.text)].every((t) => /^[\x20-\x7e\r\n]+$/.test(t))
          )
            throw new FleetError("DIAGNOSTIC_HELPER_INPUT");
          await mark();
          const response = await transport(`${this.approval.helperEndpoint}/recall`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query, candidates }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
            redirect: "error",
          });
          if (!response.ok) throw new FleetError("DIAGNOSTIC_HELPER_HTTP");
          return await response.json();
        });
        if (
          raw.task !== "laya-recall-v1" ||
          raw.runtime !== "0.4.6" ||
          raw.revision !== layaRevision ||
          raw.certificate !== "375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc" ||
          !candidates.some((c) => c.id === raw.id) ||
          typeof raw.probability !== "number" ||
          !Number.isFinite(raw.probability) ||
          raw.probability < 0 ||
          raw.probability > 1 ||
          raw.abstained !== raw.probability < 0.65
        ) {
          this.state = "blocked";
          await this.write({ type: "stop", code: "DIAGNOSTIC_HELPER_RESPONSE" });
          throw new FleetError("DIAGNOSTIC_HELPER_RESPONSE");
        }
        if (raw.abstained) throw new FleetError("LAYA_ABSTAINED");
        return { id: String(raw.id), probability: raw.probability, certificate: raw.certificate };
      },
    };
  }
  summary() {
    const models = this.entries.filter((e) => e.kind === "model"),
      helpers = this.entries.filter((e) => e.kind === "helper");
    return {
      state: this.state,
      modelCalls: models.length,
      reservedTokens: models.length * 40000,
      reportedTokens: models.reduce((n, e) => n + (e.inputTokens ?? 0) + (e.outputTokens ?? 0), 0),
      helperCalls: helpers.length,
      standalone: helpers.filter((e) => e.scope.lane === "standalone").length,
      embedded: helpers.filter((e) => e.scope.lane === "embedded").length,
      unknown: this.entries.filter((e) => e.state === "unknown").length,
      unresolved: this.entries.filter((e) => ["prepared", "dispatched"].includes(e.state)).length,
      chainHead: this.previous,
    };
  }
  async close() {
    if (this.state === "active") this.state = "closed";
    await this.write({ type: "close", summary: this.summary() });
    await this.file.close();
  }
}
