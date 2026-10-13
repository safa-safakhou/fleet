import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Communications } from "../../src/games/pact/communications.js";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { buildServer } from "../../src/server.js";
import { continuousBudget, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

const origin = "http://127.0.0.1:8820",
  password = "isolated-operator-secret-never-production";
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await fixture(),
    broker = new CredentialBroker(f.store, "http://127.0.0.1:9999", origin, false),
    engine = new Engine(
      f.store,
      new FakeModel(),
      async () => {
        throw Error("no game calls");
      },
      false,
    );
  const app = buildServer({ store: f.store, broker, engine, origin, operatorSecret: password, liveAllowed: false });
  cleanup = async () => {
    await app.close();
    await f.pool.end();
  };
  return { ...f, app };
}
async function login(app: ReturnType<typeof buildServer>) {
  const r = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { password } });
  expect(r.statusCode).toBe(200);
  return { cookie: String(r.headers["set-cookie"]).split(";")[0], origin, "x-csrf-token": r.json().csrf };
}
describe("private operator console", () => {
  it("saves a fresh optional decision policy and exposes authenticated learning status without enrollment", async () => {
    const f = await setup(),
      headers = await login(f.app);
    const { id } = await f.store.create({
      name: "Hybrid fixture",
      count: 5,
      intervalMinutes: 15,
      seed: "hybrid",
      strategies: ["guardian"],
    });
    const selection = {
      model: { route: "ollama", model: "synthetic-nemotron", thinking: true, decisionPolicy: "vw-focus-v1" },
      budget: continuousBudget,
    };
    const rejected = await f.app.inject({
      method: "POST",
      url: `/api/cohorts/${id}/configure`,
      headers,
      payload: { ...selection, budget: { ...continuousBudget, concurrency: 2 } },
    });
    expect(rejected.json().error.code).toBe("DECISION_SERIAL_REQUIRED");
    const saved = await f.app.inject({
      method: "POST",
      url: `/api/cohorts/${id}/configure`,
      headers,
      payload: selection,
    });
    expect(saved.statusCode).toBe(200);
    const state = (await f.app.inject({ url: "/api/state", headers })).json();
    expect(state.cohorts[0].model).toEqual(selection.model);
    expect(state.agents.every((a: { account_id: string | null }) => a.account_id === null)).toBe(true);
    expect(state.turns).toHaveLength(0);
    const summary = await f.app.inject({ url: `/api/cohorts/${id}/decision-policy`, headers });
    expect(summary.json().policy).toBe("vw-focus-v1");
    expect(summary.json().counts).toEqual({});
  });
  it("saves and exposes continuous selection without enrolling or starting any agent", async () => {
    const f = await setup(),
      headers = await login(f.app);
    const created = await f.app.inject({
      method: "POST",
      url: "/api/cohorts",
      headers,
      payload: {
        name: "Continuous fixture",
        count: 50,
        intervalMinutes: 15,
        seed: "synthetic",
        strategies: ["guardian"],
      },
    });
    const id = created.json().id;
    const selected = await f.app.inject({
      method: "POST",
      url: `/api/cohorts/${id}/configure`,
      headers,
      payload: {
        model: { route: "codex-cli", model: "synthetic-luna", reasoningEffort: "medium" },
        budget: continuousBudget,
      },
    });
    expect(selected.statusCode).toBe(200);
    const response = await f.app.inject({ url: "/api/state", headers });
    const state = response.json();
    expect(state.cohorts[0].budget.deadlineAt).toBe(null);
    expect(state.cohorts[0].budget.mode).toBe("continuous");
    expect(state.cohorts[0].state).toBe("draft");
    expect(state.agents).toHaveLength(50);
    expect(state.agents.every((a: { account_id: string | null }) => a.account_id === null)).toBe(true);
    expect(state.turns).toHaveLength(0);
    const start = await f.app.inject({
      method: "POST",
      url: `/api/cohorts/${id}/state`,
      headers,
      payload: { state: "running" },
    });
    expect(start.json().error.code).toBe("LIVE_EXECUTION_DISABLED");
  });
  it("requires login for every private route, including anonymous callback", async () => {
    const f = await setup();
    for (const path of [
      "/api/state",
      "/api/session",
      "/api/agents/anything/inspection",
      "/api/cohorts/anything/turns",
      "/api/cohorts/anything/decision-policy",
      "/api/agents/anything/thread?peer=x",
      "/api/oauth/callback?state=x&code=y",
    ]) {
      expect((await f.app.inject(path)).statusCode).toBe(401);
    }
    expect(
      (await f.app.inject({ method: "POST", url: "/api/turns/anything/review-rejection", payload: {} })).statusCode,
    ).toBe(401);
  });
  it("checks origin and CSRF for writes; permits safe authenticated reads", async () => {
    const f = await setup(),
      headers = await login(f.app);
    expect((await f.app.inject({ url: "/api/state", headers })).statusCode).toBe(200);
    const payload = { name: "Fixture", count: 5, intervalMinutes: 15, seed: "a", strategies: ["guardian"] };
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/cohorts",
          headers: { cookie: headers.cookie, origin },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/cohorts",
          headers: { ...headers, origin: "https://evil.example" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect((await f.app.inject({ method: "POST", url: "/api/cohorts", headers, payload })).statusCode).toBe(200);
  });
  it("disabled installation cannot provision, connect or start", async () => {
    const f = await setup(),
      headers = await login(f.app),
      id = await ready(f.store, 1),
      a = (await f.store.publicState()).agents[0];
    for (const url of [`/api/agents/${a.id}/connect`, `/api/agents/${a.id}/provision`]) {
      const r = await f.app.inject({ method: "POST", url, headers, payload: {} });
      expect(r.json().error.code).toBe("LIVE_EXECUTION_DISABLED");
    }
    const r = await f.app.inject({
      method: "POST",
      url: `/api/cohorts/${id}/state`,
      headers,
      payload: { state: "running" },
    });
    expect(r.json().error.code).toBe("LIVE_EXECUTION_DISABLED");
  });
  it("public state never includes encrypted or plaintext account credentials", async () => {
    const f = await setup(),
      headers = await login(f.app);
    await ready(f.store, 1);
    await f.pool.query("UPDATE agents SET secret_cipher='synthetic-encrypted-secret'");
    const r = await f.app.inject({ url: "/api/state", headers });
    expect(r.body).not.toContain("synthetic-encrypted-secret");
    expect(r.body).not.toContain("secret_cipher");
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("logout invalidates the saved operator session", async () => {
    const f = await setup(),
      headers = await login(f.app);
    expect((await f.app.inject({ method: "POST", url: "/api/logout", headers, payload: {} })).statusCode).toBe(200);
    expect((await f.app.inject({ url: "/api/state", headers })).statusCode).toBe(401);
  });
  it("login failures are rate limited without retaining password text", async () => {
    const f = await setup();
    for (let i = 0; i < 5; i++)
      expect(
        (await f.app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { password: "wrong" } }))
          .statusCode,
      ).toBe(401);
    expect(
      (await f.app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { password } }))
        .statusCode,
    ).toBe(429);
  });
});
describe("communication history", () => {
  it("requires retention consent, encrypts bodies, deduplicates observations and revokes access", async () => {
    const f = await setup(),
      id = await ready(f.store, 1),
      a = (await f.store.publicState()).agents[0],
      peer = randomUUID(),
      comms = new Communications(f.store),
      message = {
        id: randomUUID(),
        senderKingdomId: peer,
        body: "Synthetic secret bargaining text",
        sentGameTimeMs: "123",
      };
    await comms.ingest(a.id, peer, "pact_council_thread_v1", { messages: [message] });
    expect((await f.pool.query("SELECT count(*)::int n FROM communications")).rows[0].n).toBe(0);
    await f.store.consent(id, true);
    await comms.ingest(a.id, peer, "pact_council_thread_v1", { messages: [message] });
    await comms.ingest(a.id, peer, "pact_council_thread_v1", { messages: [message] });
    const rows = (await f.pool.query("SELECT body_cipher FROM communications")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].body_cipher).not.toContain(message.body);
    expect((await comms.thread(a.id, peer)).events[0].body.body).toBe(message.body);
    await f.store.consent(id, false);
    await expect(comms.thread(a.id, peer)).rejects.toThrow("OBSERVATION_NOT_CONSENTED");
    expect((await f.pool.query("SELECT count(*)::int n FROM communications")).rows[0].n).toBe(0);
  });
  it("paginates a long exchange without duplicated or lost records", async () => {
    const f = await setup(),
      id = await ready(f.store, 1),
      a = (await f.store.publicState()).agents[0],
      peer = randomUUID(),
      comms = new Communications(f.store);
    await f.store.consent(id, true);
    const messages = Array.from({ length: 85 }, (_, i) => ({
      id: randomUUID(),
      senderKingdomId: peer,
      body: `Message ${i} ${"long".repeat(1000)}`,
      sentGameTimeMs: String(i),
    }));
    await comms.ingest(a.id, peer, "pact_council_thread_v1", { messages });
    const ids = new Set<string>();
    let cursor: undefined | { at: string; id: string };
    do {
      const page = await comms.thread(a.id, peer, cursor);
      for (const event of page.events) {
        expect(ids.has(event.id)).toBe(false);
        ids.add(event.id);
        expect(String(event.body.body)).toContain("long");
      }
      cursor = page.next ?? undefined;
    } while (cursor);
    expect(ids.size).toBe(85);
  });
  it("separates changing terms, signatures and delivery from prose", async () => {
    const f = await setup(),
      id = await ready(f.store, 1),
      a = (await f.store.publicState()).agents[0],
      peer = randomUUID(),
      comms = new Communications(f.store);
    await f.store.consent(id, true);
    const offer = {
      id: randomUUID(),
      version: 2,
      status: "signed",
      kind: "supply",
      gameTimeMs: "123",
      terms: { trial: "synthetic" },
      versions: [
        { version: 1, terms: { rate: 3 } },
        { version: 2, terms: { rate: 4 } },
      ],
      signatures: [{ kingdomId: a.kingdom_id }, { kingdomId: peer }],
      contract: { status: "active" },
      deliveries: { paid: 1 },
    };
    await comms.ingest(a.id, peer, "pact_conversation_history_v2", { offers: [offer] });
    const t = await comms.thread(a.id, peer);
    expect(t.events[0].kind).toBe("agreement");
    expect(t.events[0].body.signatures).toHaveLength(2);
    expect(t.metrics.negotiationDuration).toBe(null);
  });
});
