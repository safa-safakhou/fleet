import { type Data, FleetError, type GamePort, object, type Tool } from "../../domain.js";
import { RemoteRejection, readJSONResponse } from "../../http.js";
import { isRead, validateActionTool, validateTool } from "./contracts.js";

export class McpGame implements GamePort {
  private seq = 0;
  private session: string | undefined;
  private catalog: Tool[] = [];
  constructor(
    private base: string,
    private token: string,
    private isolated = false,
    private credentialRequest?: (request: (token: string) => Promise<Response>) => Promise<Response>,
  ) {}
  private headers(token = this.token) {
    return {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      origin: new URL(this.base).origin,
      ...(this.session ? { "Mcp-Session-Id": this.session, "MCP-Protocol-Version": "2025-11-25" } : {}),
    };
  }
  private request(init: RequestInit) {
    const send = (token: string) =>
      fetch(`${this.base}/mcp`, {
        ...init,
        headers: this.headers(token),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    return this.credentialRequest ? this.credentialRequest(send) : send(this.token);
  }
  private async rpc(method: string, params: Data) {
    const { data, headers } = await readJSONResponse(
      await this.request({
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.seq, method, params }),
      }),
    );
    this.session = headers.get("Mcp-Session-Id") ?? this.session;
    if (data.error) throw new FleetError("MCP_REQUEST_REJECTED");
    return object(data.result);
  }
  async init() {
    const initialized = await this.rpc("initialize", {
      protocolVersion: "2025-11-25",
      clientInfo: { name: "fleet", version: "0.1.0" },
      capabilities: {},
      ...(this.isolated ? { _meta: { "pact/session-scope": "connection" } } : {}),
    });
    if (this.isolated && object(initialized._meta)["pact/session-scope"] !== "connection")
      throw new FleetError("SESSION_ISOLATION_UNSUPPORTED", true);
    const r = await this.request({
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (r.status !== 202) throw new FleetError("MCP_INIT_FAILED");
    this.catalog = await this.tools();
  }
  async tools() {
    const r = await this.rpc("tools/list", {});
    if (!Array.isArray(r.tools)) throw new FleetError("SCHEMA_CHANGED");
    this.catalog = r.tools as Tool[];
    return this.catalog;
  }
  private async call(name: string, args: Data) {
    const tool = this.catalog.find((t) => t.name === name);
    if (!tool) throw new FleetError("SCHEMA_CHANGED");
    validateTool(tool, args);
    const r = await this.rpc("tools/call", { name, arguments: args });
    let data = object(r.structuredContent);
    if (!r.structuredContent && Array.isArray(r.content)) {
      const t = r.content.map(object).find((c) => c.type === "text");
      try {
        data = object(JSON.parse(String(t?.text)));
      } catch {
        throw new FleetError("INVALID_REMOTE_RESPONSE");
      }
    }
    if (r.isError && !data.commandId) {
      const code = object(data.error).code ?? data.code;
      throw new RemoteRejection(typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code) ? code : "GAME_DENIED", 200);
    }
    return data;
  }
  async profile() {
    const r = await this.call("pact_profile_v1", {});
    if (typeof r.id !== "string") throw new FleetError("IDENTITY_MISMATCH");
    return { accountId: r.id };
  }
  async read(name: string, args: Data) {
    const t = this.catalog.find((t) => t.name === name);
    if (!t || !isRead(t)) throw new FleetError("READ_TOOL_FORBIDDEN");
    return this.call(name, args);
  }
  async open() {
    await this.call("run.open", {});
  }
  async submit(id: string, action: Data) {
    validateActionTool(this.catalog, id, action);
    return this.call("pact_game_action_v2", { commandId: id, action });
  }
  async effects(command: Data) {
    return this.call("pact_action_effects_quote_v1", { command });
  }
  async submitGuarded(command: Data, guard: Data) {
    return this.call("pact_action_effects_execute_v1", { command, guard });
  }
  async receipt(commandId: string) {
    return this.call("pact_receipt_read_v1", { commandId });
  }
  async close() {
    if (!this.session) return;
    const r = await this.request({
      method: "DELETE",
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new FleetError("LEASE_CLOSE_UNCERTAIN");
    this.session = undefined;
  }
}
