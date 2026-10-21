import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { LaunchService } from "../../src/platform/launch.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { buildServer } from "../../src/server.js";
import { Store } from "../../src/store.js";
import { boardEnvironment, boardRef } from "../fixtures/environments/board.js";
import { budget, FakeModel, fixture } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  await end?.();
});
async function setup(liveAllowed = true) {
  const f = await fixture();
  end = () => f.pool.end();
  const architectures = builtinArchitectures();
  const original = architectures.resolve({ id: "reactive-basic", version: "1" });
  for (const version of ["1", "2"])
    architectures.register({
      ...original,
      manifest: {
        ...original.manifest,
        ref: { id: "fixture", version },
        configSchema: {
          type: "object",
          properties: { depth: { type: "integer", minimum: 1, maximum: 3 } },
          required: ["depth"],
          additionalProperties: false,
        },
        defaults: { depth: 1 },
      },
    });
  const store = new Store(f.pool, f.store.vault, f.now, architectures),
    bindings = new Bindings(store, boardRef),
    tasks = new TaskStore(store, bindings),
    board = boardEnvironment();
  board.adapter.capabilities.events = "native";
  const environments = new EnvironmentRegistry([board.adapter], boardRef),
    service = new LaunchService(store, tasks, environments, architectures, {
      liveAllowed,
      providerConfigured: () => true,
    });
  const { id } = await store.create({
    name: "Launch fixture",
    count: 1,
    intervalMinutes: 15,
    seed: "launch",
    strategies: ["guardian"],
  });
  const agent = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [id])).rows[0].id;
  await bindings.bind(agent, {
    environment: boardRef,
    accountRef: randomUUID(),
    actorRef: randomUUID(),
    entityRef: randomUUID(),
  });
  await f.pool.query("UPDATE agents SET credential_state='ready',state='ready' WHERE id=$1", [agent]);
  const spec = {
    architecture: { id: "fixture", version: "2" },
    environment: boardRef,
    architectureConfig: { depth: 2 },
    model: { route: "ollama", model: "offline-fixture" },
    budget,
    accounts: { agentIds: [agent] },
  };
  return { ...f, store, architectures, tasks, environments, service, board, id, agent, spec };
}
it("checks and drafts exact versions without connections or runtime changes", async () => {
  const f = await setup(false),
    before = await f.store.cohort(f.id),
    check = await f.service.check(f.spec);
  expect(check).toMatchObject({ valid: true, ready: false });
  expect(check.checks).toContainEqual(expect.objectContaining({ area: "provider", status: "unknown" }));
  const draft = await f.service.draft({ requestId: randomUUID(), spec: f.spec });
  expect(draft.digest).toBe(check.digest);
  expect(await f.store.cohort(f.id)).toEqual(before);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM turns")).rowCount).toBe(0);
  expect(f.board.connections).toBe(0);
  expect(f.board.executions).toBe(0);
  expect(
    f.service
      .catalog()
      .filter((m) => m.ref.id === "fixture")
      .map((m) => m.ref.version),
  ).toEqual(["1", "2"]);
});
it("idempotently creates and starts one exact immutable launch", async () => {
  const f = await setup(),
    requestId = randomUUID(),
    d = await f.service.draft({ requestId, spec: f.spec });
  expect(await f.service.draft({ requestId, spec: f.spec })).toEqual(d);
  await expect(
    f.service.draft({ requestId, spec: { ...f.spec, architectureConfig: { depth: 3 } } }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const request = { requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest };
  const results = await Promise.all([f.service.start(request), f.service.start(request)]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]).toMatchObject({ cohortId: f.id, state: "running", digest: d.digest });
  expect(
    (
      await f.pool.query("SELECT profile_version,architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        f.id,
      ])
    ).rows[0],
  ).toEqual({ profile_version: "2", architecture_config: { depth: 2 } });
  expect(
    (await f.pool.query("SELECT kind FROM audit_events WHERE cohort_id=$1 AND kind='cohort.running'", [f.id])).rowCount,
  ).toBe(1);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  expect(f.board.connections).toBe(0);
});
it("persists exact finite non-model limits from the reviewed launch without starting work", async () => {
  const f = await setup(),
    limits = { reads: 12, actions: 2, messages: 1, steps: 32, wallTimeMs: 60000 },
    d = await f.service.draft({ requestId: randomUUID(), spec: { ...f.spec, nonModelLimits: limits } });
  await f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest });
  expect(
    (await f.pool.query("SELECT non_model_limits FROM cohort_engine_profiles WHERE cohort_id=$1", [f.id])).rows[0]
      .non_model_limits,
  ).toEqual(limits);
  expect((await f.pool.query("SELECT * FROM turns")).rowCount).toBe(0);
  expect(f.board.executions).toBe(0);
});
it("rejects stale revisions and serializes update against start", async () => {
  const f = await setup(),
    d = await f.service.draft({ requestId: randomUUID(), spec: f.spec });
  const next = await f.service.update({
    draftId: d.draftId,
    expectedDigest: d.digest,
    spec: { ...f.spec, architectureConfig: { depth: 3 } },
  });
  await expect(
    f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest }),
  ).rejects.toMatchObject({ code: "STALE_LAUNCH_DIGEST" });
  const outcomes = await Promise.allSettled([
    f.service.update({
      draftId: d.draftId,
      expectedDigest: next.digest,
      spec: { ...f.spec, architectureConfig: { depth: 1 } },
    }),
    f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: next.digest }),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await f.store.cohort(f.id)).state).toBe(outcomes[1]?.status === "fulfilled" ? "running" : "draft");
});
it("refuses disabled execution without partially configuring a cohort", async () => {
  const f = await setup(false),
    d = await f.service.draft({ requestId: randomUUID(), spec: f.spec }),
    before = await f.store.cohort(f.id);
  await expect(
    f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest }),
  ).rejects.toMatchObject({ code: "LIVE_EXECUTION_DISABLED" });
  expect(await f.store.cohort(f.id)).toEqual(before);
  expect((await f.pool.query("SELECT * FROM cohort_engine_profiles")).rowCount).toBe(0);
});
it("rechecks credentials and terminal state immediately before start", async () => {
  const f = await setup(),
    d = await f.service.draft({ requestId: randomUUID(), spec: f.spec });
  await f.pool.query("UPDATE agents SET credential_state='missing' WHERE id=$1", [f.agent]);
  await expect(
    f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest }),
  ).rejects.toMatchObject({ code: "ACCOUNTS_INCOMPLETE" });
  expect((await f.store.cohort(f.id)).state).toBe("draft");
  expect((await f.pool.query("SELECT * FROM cohort_engine_profiles")).rowCount).toBe(0);
  await f.pool.query("UPDATE agents SET credential_state='ready' WHERE id=$1", [f.agent]);
  await f.store.setState(f.id, "stopped", false);
  await expect(
    f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest }),
  ).rejects.toMatchObject({ code: "TERMINAL_COHORT" });
});
it("never reconfigures consumed cohorts or changes selected account identity", async () => {
  const f = await setup(),
    d = await f.service.draft({ requestId: randomUUID(), spec: f.spec }),
    request = { requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest };
  await f.service.start(request);
  await f.pool.query("UPDATE cohorts SET state='paused' WHERE id=$1", [f.id]);
  // A zero-call task still consumes the immutable configuration.
  const binding = await f.tasks.bindings.forAgent(f.agent);
  if (!binding) throw Error("binding");
  await f.tasks.upsertFromEvent(
    binding,
    {
      id: "consumed",
      type: "fixture",
      sourceRef: "fixture:consumed",
      observedAt: f.now().toISOString(),
      environmentTime: { clockId: "turn", value: "1" },
      metadata: {},
    },
    "consumed",
  );
  await expect(f.store.configure(f.id, { model: f.spec.model, budget: f.spec.budget })).rejects.toMatchObject({
    code: "CONSUMED_CONFIG_IMMUTABLE",
  });
  await expect(f.service.update({ draftId: d.draftId, expectedDigest: d.digest, spec: f.spec })).rejects.toMatchObject({
    code: "LAUNCH_ALREADY_STARTED",
  });
  expect((await f.tasks.bindings.forAgent(f.agent))?.id).toBe(binding.id);
});
it("reports schema environment account and allowance problems locally", async () => {
  const f = await setup();
  for (const spec of [
    { ...f.spec, architecture: { id: "fixture", version: "3" } },
    { ...f.spec, architectureConfig: { depth: 4 } },
    { ...f.spec, accounts: { agentIds: [randomUUID()] } },
    { ...f.spec, environment: { ...boardRef, instanceId: "foreign" } },
    { ...f.spec, budget: { ...budget, deadlineAt: "2020-01-01T00:00:00Z" } },
  ])
    expect((await f.service.check(spec)).ready).toBe(false);
  expect(f.board.connections).toBe(0);
});

it("exposes authenticated launch DTOs with existing origin and CSRF fencing", async () => {
  const f = await setup(false),
    origin = "http://127.0.0.1:38881",
    secret = "fixture-secret-".repeat(4),
    broker = new CredentialBroker(f.store, "http://127.0.0.1:1", origin, false);
  const app = buildServer({
    store: f.store,
    broker,
    engine: new Engine(
      f.store,
      new FakeModel([]),
      async () => {
        throw Error("NO_GAME_CONNECTION");
      },
      false,
    ),
    origin,
    operatorSecret: secret,
    liveAllowed: false,
    tasks: f.tasks,
    environments: f.environments,
    architectures: f.architectures,
  });
  try {
    expect((await app.inject("/api/architectures")).statusCode).toBe(401);
    const login = await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin },
        payload: { password: secret },
      }),
      headers = {
        origin,
        cookie: String(login.headers["set-cookie"]).split(";")[0],
        "x-csrf-token": login.json().csrf,
      };
    expect((await app.inject({ url: "/api/architectures", headers })).json().architectures).toHaveLength(
      f.architectures.list().length,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/launch/check",
          headers: { cookie: headers.cookie },
          payload: f.spec,
        })
      ).statusCode,
    ).toBe(403);
    const checked = await app.inject({ method: "POST", url: "/api/launch/check", headers, payload: f.spec });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ ready: false });
    const draft = await app.inject({
      method: "POST",
      url: "/api/launch/drafts",
      headers,
      payload: { requestId: randomUUID(), spec: f.spec },
    });
    expect(draft.statusCode).toBe(200);
    const d = draft.json();
    expect((await app.inject({ url: `/api/launch/drafts/${d.draftId}`, headers })).json().digest).toBe(d.digest);
    expect((await f.pool.query("SELECT * FROM turns")).rowCount).toBe(0);
  } finally {
    await app.close();
  }
});

it("translates legacy cognition only through its registered descriptor", async () => {
  const f = await setup();
  f.board.adapter.capabilities.timing = "realtime";
  f.board.adapter.schemas = { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] };
  const spec = { ...f.spec, architecture: { id: "legacy-cognition", version: "1" }, architectureConfig: {} };
  const d = await f.service.draft({ requestId: randomUUID(), spec });
  await f.service.start({ requestId: randomUUID(), draftId: d.draftId, expectedDigest: d.digest });
  expect((await f.store.cohort(f.id)).model).toMatchObject({ cognition: "llm-centered-v1" });
  expect(f.board.connections).toBe(0);
});
