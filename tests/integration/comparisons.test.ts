import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Comparisons } from "../../src/comparisons.js";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { Observability } from "../../src/observability.js";
import { buildServer } from "../../src/server.js";
import { budget, FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

const template = {
  version: 1,
  name: "Synthetic pair",
  countPerArm: 5,
  intervalMinutes: 15,
  seed: "paired",
  strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
  model: { route: "ollama", model: "fake-model", thinking: true },
  budget,
  recallAssist: "laya-recall-v1",
};
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  return { ...f, comparisons: new Comparisons(f.store) };
}
describe("comparison drafts and evidence", () => {
  it("creates matched independent drafts without changing existing accounts, history, budgets or execution", async () => {
    const f = await setup(),
      existing = await ready(f.store, 1);
    const oldClaim = await f.store.claim("existing-fixture");
    if (!oldClaim) throw Error("missing original claim");
    await new Engine(f.store, new FakeModel(), async () => new FakeGame(oldClaim), true).run(oldClaim);
    await f.pool.query(
      "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'total',40000,$4,'unknown')",
      [randomUUID(), existing, oldClaim.id, f.now()],
    );
    const oldTurns = (await f.pool.query("SELECT * FROM turns ORDER BY id")).rows,
      oldLedger = (await f.pool.query("SELECT * FROM compute_ledger ORDER BY id")).rows,
      before = await f.store.cohort(existing),
      oldAgents = (await f.pool.query("SELECT * FROM agents WHERE cohort_id=$1", [existing])).rows;
    const created = await f.comparisons.create({ requestId: randomUUID(), template }),
      report = await f.comparisons.inspect(created.id);
    expect(report.matchesTemplate).toBe(true);
    expect(report.arms.map((a) => a.state)).toEqual(["draft", "draft"]);
    for (const id of created.cohortIds) {
      const c = await f.store.cohort(id),
        agents = (await f.pool.query("SELECT * FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id])).rows;
      expect(c.budget).toEqual(budget);
      expect(c.anchor_at).toBeNull();
      expect(c.observation_consent).toBe(false);
      expect(agents).toHaveLength(5);
      expect(
        agents.every((a) => !a.account_id && !a.secret_cipher && !a.next_due_at && a.state === "unconnected"),
      ).toBe(true);
    }
    expect(await f.store.cohort(existing)).toEqual(before);
    expect((await f.pool.query("SELECT * FROM agents WHERE cohort_id=$1", [existing])).rows).toEqual(oldAgents);
    expect((await f.pool.query("SELECT * FROM turns ORDER BY id")).rows).toEqual(oldTurns);
    expect((await f.pool.query("SELECT * FROM compute_ledger ORDER BY id")).rows).toEqual(oldLedger);
    expect(report.arms.every((a) => a.metrics.calls === 0 && a.metrics.turns === 0)).toBe(true);
  });
  it("recovers concurrent retries without duplicate drafts and rejects changed requests", async () => {
    const f = await setup(),
      requestId = randomUUID(),
      request = { requestId, template };
    const [a, b] = await Promise.all([f.comparisons.create(request), f.comparisons.create(request)]);
    expect(a).toEqual(b);
    f.advance(2 * 86400000);
    expect(await f.comparisons.create(request)).toEqual(a); // recover an already saved draft even after its deadline
    await expect(f.comparisons.create({ requestId, template: { ...template, seed: "different" } })).rejects.toThrow(
      "COMPARISON_REQUEST_CONFLICT",
    );
    expect((await f.pool.query("SELECT count(*)::int n FROM cohorts")).rows[0].n).toBe(2);
  });
  it("rolls back both arms on a mid-creation failure and refuses expired new plans", async () => {
    const f = await setup(),
      audit = vi.spyOn(f.store, "audit");
    audit.mockImplementation(async () => {
      throw Error("fixture failure");
    });
    await expect(f.comparisons.create({ requestId: randomUUID(), template })).rejects.toThrow("fixture failure");
    expect((await f.pool.query("SELECT count(*)::int n FROM cohorts")).rows[0].n).toBe(0);
    expect((await f.pool.query("SELECT count(*)::int n FROM agents")).rows[0].n).toBe(0);
    audit.mockRestore();
    f.advance(2 * 86400000);
    await expect(f.comparisons.create({ requestId: randomUUID(), template })).rejects.toThrow("DEADLINE_PASSED");
  });
  it("reports configuration drift without relabeling or resetting the original template", async () => {
    const f = await setup(),
      saved = await f.comparisons.create({ requestId: randomUUID(), template });
    await f.store.configure(saved.cohortIds[0], { model: { ...template.model, cognition: "llm-centered-v1" }, budget });
    const report = await f.comparisons.inspect(saved.id);
    expect(report.matchesTemplate).toBe(false);
    expect(report.arms[0].matchesTemplate).toBe(false);
    expect(report.template.model).toEqual(template.model);
    expect(report.arms[0].metrics.calls).toBe(0);
  });
  it("runs the two modes through existing fake-provider turns and retains unknown allocations separately", async () => {
    const f = await setup(),
      saved = await f.comparisons.create({
        requestId: randomUUID(),
        template: { ...template, countPerArm: 1, recallAssist: undefined },
      }),
      model = new FakeModel();
    for (const id of saved.cohortIds) {
      await f.pool.query(
        "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE cohort_id=$1",
        [id, randomUUID(), randomUUID()],
      );
      await f.store.consent(id, true);
      await f.store.setState(id, "running", true);
      const claim = await f.store.claim("synthetic");
      if (!claim) throw Error("missing claim");
      await new Engine(f.store, model, async () => new FakeGame(claim), true).run(claim);
    }
    const contexts = model.inputs.map((i) => JSON.parse(i.messages[1].content));
    expect(contexts[0].cognition).toBeUndefined();
    expect(contexts[1].cognition).toBeDefined();
    const initial = await f.comparisons.inspect(saved.id);
    expect(initial.arms.map((a) => a.metrics.calls)).toEqual([1, 1]);
    expect(initial.arms[0].cognition?.decisionsWithRecall).toBe(0);
    expect(initial.arms[1].cognition?.decisionsWithRecall).toBe(1);
    const turn = (await f.pool.query("SELECT id FROM turns WHERE cohort_id=$1", [saved.cohortIds[1]])).rows[0];
    await f.pool.query(
      "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'total',40000,$4,'unknown')",
      [randomUUID(), saved.cohortIds[1], turn.id, f.now()],
    );
    const report = await f.comparisons.inspect(saved.id);
    expect(report.arms[1].metrics.unknown_calls).toBe(1);
    expect(report.arms[1].metrics.allocated_tokens).toBe("80000");
    expect(report.arms[1].metrics.input_tokens).toBe("500");
  });
  it("counts accepted analysis and actual Laya delivery, with consent and coverage respected", async () => {
    const f = await setup(),
      saved = await f.comparisons.create({ requestId: randomUUID(), template: { ...template, countPerArm: 1 } }),
      id = saved.cohortIds[1];
    await f.pool.query(
      "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE cohort_id=$1",
      [id, randomUUID(), randomUUID()],
    );
    await f.store.consent(id, true);
    await f.store.setState(id, "running", true);
    const claim = await f.store.claim("synthetic");
    if (!claim) throw Error("missing claim");
    const observation = new Observability(f.store);
    await observation.record(claim, "ready", "LLM continuity delivered", {
      recallAcceptance: { route: "laya-recall-v1" },
      recallPairDelivered: false,
    });
    await observation.record(claim, "ready", "LLM continuity delivered", {
      recallAcceptance: { route: "laya-recall-v1" },
      recallPairDelivered: true,
    });
    await observation.record(claim, "ready", "LLM continuity delivered", { recallAcceptance: { assist: "abstained" } });
    await observation.record(claim, "ready", "LLM revised memory, plan or social hypotheses", {
      beliefsRevised: 1,
      reflections: 0,
      duplicateReflectionsSkipped: 2,
    });
    const report = await f.comparisons.inspect(saved.id);
    expect(report.arms[0].cognition).toBeNull();
    expect(report.arms[1].cognition).toMatchObject({
      layaAccepted: 2,
      layaDelivered: 1,
      layaAbstained: 1,
      beliefsRevised: 1,
      reflectionsAdded: 0,
      duplicateReflectionsSkipped: 2,
    });
    await f.store.consent(id, false);
    expect((await f.comparisons.inspect(saved.id)).arms[1].cognition).toBeNull();
  });
  it("protects comparison APIs and previews without any database or external side effects", async () => {
    const f = await setup(),
      origin = "http://127.0.0.1:8899",
      password = "synthetic-operator-configuration-only",
      broker = new CredentialBroker(f.store, "http://127.0.0.1:9999", origin, false),
      engine = new Engine(
        f.store,
        new FakeModel(),
        async () => {
          throw Error("no external calls");
        },
        false,
      ),
      app = buildServer({ store: f.store, broker, engine, origin, operatorSecret: password, liveAllowed: false });
    cleanup = async () => {
      await app.close();
      await f.pool.end();
    };
    expect((await app.inject("/api/comparisons")).statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { password } }),
      headers = {
        origin,
        cookie: String(login.headers["set-cookie"]).split(";")[0],
        "x-csrf-token": login.json().csrf,
      };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/comparisons/preview",
          headers: { cookie: headers.cookie, origin },
          payload: template,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "POST", url: "/api/comparisons/preview", headers, payload: template })).json()
        .totalAgents,
    ).toBe(10);
    expect((await f.pool.query("SELECT count(*)::int n FROM cohorts")).rows[0].n).toBe(0);
    const saved = await app.inject({
      method: "POST",
      url: "/api/comparisons",
      headers,
      payload: { requestId: randomUUID(), template },
    });
    expect(saved.statusCode).toBe(200);
    const report = await app.inject({ url: `/api/comparisons/${saved.json().id}`, headers });
    expect(report.statusCode).toBe(200);
    expect(report.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ url: "/api/comparisons", headers })).json().comparisons).toHaveLength(1);
    for (const id of saved.json().cohortIds)
      expect(
        (
          await app.inject({ method: "POST", url: `/api/cohorts/${id}/state`, headers, payload: { state: "running" } })
        ).json().error.code,
      ).toBe("LIVE_EXECUTION_DISABLED");
  });
});
