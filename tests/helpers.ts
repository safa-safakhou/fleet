import { randomUUID } from "node:crypto";
import { connect, migrate } from "../src/db.js";
import type { Data, GamePort, ModelPort, Tool } from "../src/domain.js";
import { type Claim, Store } from "../src/store.js";
import { Vault } from "../src/vault.js";
import { assertOwnedFixture } from "./architecture-fixture.js";
export const key = Buffer.alloc(32, 7).toString("base64");
export const testUrl =
  process.env.FLEET_TEST_DATABASE_URL ?? "postgres://fleet_test:isolated_fixture@127.0.0.1:5437/fleet_test";
export const budget = {
  mode: "finite",
  callLimit: 100,
  tokenLimit: 4000000,
  deadlineAt: "2026-10-12T12:00:00.000Z",
  perCallTokenLimit: 40000,
  maxOutputTokens: 2000,
  inputByteLimit: 24000,
  maxCallsPerTurn: 3,
  maxActionsPerTurn: 3,
  concurrency: 2,
};
export const continuousBudget = {
  ...budget,
  mode: "continuous",
  callLimit: null,
  tokenLimit: null,
  deadlineAt: null,
  concurrency: 1,
  continuousExecutionAccepted: true,
  executionAccountingAccepted: true,
};
export async function fixture() {
  if (process.env.FLEET_ARCHITECTURE_TEST === "1")
    await assertOwnedFixture(testUrl, process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const target = new URL(testUrl);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/fleet_test")
    throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  const pool = connect(testUrl);
  await migrate(pool);
  await pool.query(
    "TRUNCATE platform_comparisons,cohorts,agents,turns,turn_events,command_resolutions,communications,compute_ledger,operator_sessions,owner_decisions,oauth_attempts,audit_events,worker_heartbeats,worker_health CASCADE",
  );
  let time = new Date("2026-10-11T12:00:00.000Z");
  const store = new Store(pool, new Vault(key), () => time);
  return {
    pool,
    store,
    advance: (ms: number) => {
      time = new Date(time.getTime() + ms);
    },
    now: () => time,
  };
}
export async function ready(store: Store, count = 2) {
  const { id } = await store.create({
    name: "Fixture kingdoms",
    count,
    intervalMinutes: 15,
    seed: "fixture",
    strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
  });
  await store.configure(id, { model: { route: "ollama", model: "fake-model" }, budget });
  const agents = (await store.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id])).rows;
  for (const a of agents) {
    await store.pool.query(
      "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
      [a.id, randomUUID(), randomUUID()],
    );
  }
  await store.setState(id, "running", true);
  return id;
}
export const tools: Tool[] = [
  { name: "pact_agent_guide_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  {
    name: "pact_world_read_v1",
    inputSchema: { type: "object", properties: { forecastMinutes: { type: "integer", minimum: 1, maximum: 60 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "pact_council_thread_v1",
    inputSchema: { type: "object", required: ["kingdomId"], properties: { kingdomId: { type: "string" } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "pact_game_action_v2",
    inputSchema: {
      type: "object",
      required: ["commandId", "action"],
      properties: { commandId: { type: "string" }, action: { type: "object" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
];
export class FakeGame implements GamePort {
  submits: { commandId: string; action: Data }[] = [];
  reads: { tool: string; args: Data }[] = [];
  acceptedContacts: string[] = [];
  opened = 0;
  closed = 0;
  failSubmit = false;
  receiptValue: Data | null = null;
  constructor(readonly claim: Claim) {}
  async profile() {
    return { accountId: this.claim.agent.account_id ?? "" };
  }
  async tools() {
    return tools;
  }
  async read(tool: string, args: Data): Promise<Data> {
    this.reads.push({ tool, args });
    return tool === "pact_world_read_v1"
      ? { profile: { kingdomId: this.claim.agent.kingdom_id }, balances: { iron: { ordinaryUnits: "1200" } } }
      : tool === "pact_council_thread_v1"
        ? {
            messages: [
              {
                id: randomUUID(),
                senderKingdomId: args.kingdomId,
                body: "A synthetic trade proposal",
                sentGameTimeMs: "1791600000000",
              },
            ],
            next: null,
          }
        : {
            contacts: this.acceptedContacts.map((kingdomId) => ({ kingdomId })),
            contactRequests: [],
            openSupplyOffers: [],
          };
  }
  async open() {
    this.opened++;
  }
  async submit(commandId: string, action: Data) {
    this.submits.push({ commandId, action });
    if (this.failSubmit) throw Error("TRANSPORT_UNCERTAIN");
    return { commandId, code: "COMMITTED" };
  }
  async receipt(commandId: string) {
    return this.receiptValue ?? { commandId, code: "COMMITTED" };
  }
  async close() {
    this.closed++;
  }
}
export class FakeModel implements ModelPort {
  inputs: Parameters<ModelPort["decide"]>[0][] = [];
  constructor(private decisions: unknown[] = [{ kind: "wait", summary: "Wait for actual changes" }]) {}
  async decide(input: Parameters<ModelPort["decide"]>[0]) {
    this.inputs.push(input);
    return {
      decision: this.decisions.shift() ?? { kind: "wait", summary: "Wait" },
      inputTokens: 500,
      outputTokens: 50,
    };
  }
}
