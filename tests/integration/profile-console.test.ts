import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { Observability } from "../../src/observability.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { ProfileConsole } from "../../src/platform/profile-console.js";
import { PlatformReports } from "../../src/platform/reports.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { buildServer } from "../../src/server.js";
import { boardEnvironment, boardRef } from "../fixtures/environments/board.js";
import { budget, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  await end?.();
});
const draft = {
  name: "Private test group",
  count: 1,
  intervalMinutes: 15,
  seed: "private-seed",
  strategies: ["guardian"],
};
async function setup() {
  const f = await fixture();
  end = () => f.pool.end();
  const bindings = new Bindings(f.store, boardRef),
    tasks = new TaskStore(f.store, bindings);
  const board = boardEnvironment(),
    environments = new EnvironmentRegistry([board.adapter], boardRef);
  const engines = new EngineRegistry([
    { ref: { id: "reactive-basic", version: "1" }, requiredCapabilities: {}, run: async () => {} },
    {
      ref: { id: "specialist-coordinator", version: "1" },
      requiredCapabilities: { coordination: true },
      run: async () => {},
    },
  ]);
  return {
    ...f,
    tasks,
    console: new ProfileConsole(f.store, tasks, environments, engines),
    reports: new PlatformReports(f.store),
  };
}
it("creates inactive profile drafts without a study, accounts, turns or model calls; previews incompatibility", async () => {
  const f = await setup();
  const d = await f.console.createProfileDraft({ ...draft, profile: { id: "reactive-basic", version: "1" } });
  expect(d.profile).toEqual({ id: "reactive-basic", version: "1" });
  const state = await f.store.publicState();
  expect(state.cohorts[0].state).toBe("draft");
  expect(state.cohorts[0].engine_profile).toMatchObject({ id: "reactive-basic", version: "1" });
  expect(state.agents[0].account_id).toBeNull();
  expect((await f.reports.exportReport("private", [d.cohortId])).cohorts[0]).toHaveProperty("studyId", null);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  expect(state.turns).toHaveLength(0);
  expect(f.console.preview({ id: "specialist-coordinator", version: "1" })).toMatchObject({
    compatible: false,
    code: "UNSUPPORTED_CAPABILITY",
  });
  await expect(
    f.console.createProfileDraft({ ...draft, profile: { id: "specialist-coordinator", version: "1" } }),
  ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
  expect((await f.store.publicState()).cohorts).toHaveLength(1);
});
it("links four existing cohorts, pins configuration, discloses drift and never reassigns accounts", async () => {
  const f = await setup(),
    ids = [];
  for (let i = 0; i < 4; i++)
    ids.push(
      (await f.console.createProfileDraft({ ...draft, profile: { id: "reactive-basic", version: "1" } })).cohortId,
    );
  const before = (await f.store.publicState()).agents;
  const comparison = await f.reports.compareCohorts(ids);
  expect(comparison.cohorts).toHaveLength(4);
  const link = await f.reports.link({
    requestId: randomUUID(),
    name: "Four profiles",
    cohortIds: ids,
    design: "interacting_world",
  });
  await f.store.configure(ids[0], { model: { route: "ollama", model: "fake-drift" }, budget });
  const report = await f.reports.inspectComparison(link.id);
  expect(report.cohorts[0].configurationDrift).toBe(true);
  expect(report.cohorts[1].configurationDrift).toBe(false);
  expect((await f.store.publicState()).agents).toEqual(before);
  await expect(f.reports.compareCohorts([ids[0], randomUUID()])).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("freezes profiles and model configuration after any turn, including zero-call waits", async () => {
  const f = await setup(),
    id = await ready(f.store, 1),
    claim = await f.store.claim("fixture");
  if (!claim) throw Error("claim");
  await f.store.finish(claim, "WAIT", "Waiting");
  await f.store.setState(id, "paused", true);
  await expect(f.tasks.enroll(id, { id: "reactive-basic", version: "1" })).rejects.toMatchObject({
    code: "CONSUMED_PROFILE_IMMUTABLE",
  });
  await expect(f.store.configure(id, { model: { route: "ollama", model: "different" }, budget })).rejects.toMatchObject(
    { code: "CONSUMED_CONFIG_IMMUTABLE" },
  );
});
it("exports only allowlisted aggregates publicly; private detail expires and consent revocation removes it", async () => {
  const f = await setup(),
    id = await ready(f.store, 1),
    claim = await f.store.claim("fixture");
  if (!claim) throw Error("claim");
  await f.store.consent(id, true);
  await new Observability(f.store).record(claim, "thinking", "Fixture belief", {
    privateMessages: "PEER-PRIVATE",
    belief: "SUBJECTIVE",
  });
  await f.pool.query(
    "INSERT INTO compute_ledger(id,cohort_id,turn_id,status,tokens,period,created_at) VALUES($1,$2,$3,'unknown',40000,'fixture','2026-10-11T12:00:00Z')",
    [randomUUID(), id, claim.id],
  );
  const commandId = randomUUID();
  await f.pool.query(
    "INSERT INTO command_resolutions(command_id,turn_id,agent_id,cohort_id,resolved_at,code,source,action_cipher,evidence) VALUES($1,$2,$3,$4,$5,'COMMITTED','receipt',$6,'{}')",
    [
      commandId,
      claim.id,
      claim.agentId,
      id,
      f.now(),
      f.store.vault.encrypt({ note: "OLD-PRIVATE-ACTION" }, `command-resolution:${commandId}`),
    ],
  );
  const privateReport = await f.reports.exportReport("private", [id]);
  expect(JSON.stringify(privateReport)).toContain("PEER-PRIVATE");
  expect(privateReport.cohorts[0].metrics.unknownAllocatedTokens).toBe("40000");
  const shared = await f.reports.exportReport("shareable", [id]);
  expect(JSON.stringify(shared)).not.toMatch(/PEER-PRIVATE|SUBJECTIVE|Fixture kingdoms|fake-model|private-seed/);
  expect(JSON.stringify(shared)).not.toContain(id);
  expect(shared.cohorts[0].metrics.unknownAllocatedTokens).toBe("40000");
  f.advance(31 * 86400000);
  expect(JSON.stringify(await f.reports.exportReport("private", [id]))).not.toContain("PEER-PRIVATE");
  expect(JSON.stringify(await f.reports.exportReport("private", [id]))).not.toContain("OLD-PRIVATE-ACTION");
  await f.store.consent(id, false);
  expect(JSON.stringify(await f.reports.exportReport("private", [id]))).not.toContain("SUBJECTIVE");
  expect((await f.reports.exportReport("private", [id])).cohorts[0].coverage.details).toBe("withheld");
});

it("protects profile/link/export routes, and viewing/exporting causes no model, game read or acknowledgement", async () => {
  const f = await setup(),
    origin = "http://127.0.0.1:8820",
    secret = "synthetic-profile-console-secret-only";
  const environments = new EnvironmentRegistry([boardEnvironment().adapter], boardRef),
    engines = new EngineRegistry([
      {
        ref: { id: "legacy-loop", version: "1" },
        requiredCapabilities: {},
        run: async () => {
          throw Error("NO_ENGINE_CALL");
        },
      },
    ]);
  const app = buildServer({
    store: f.store,
    broker: new CredentialBroker(f.store, "http://127.0.0.1:9999", origin, false),
    engine: new Engine(
      f.store,
      new FakeModel(),
      async () => {
        throw Error("NO_GAME_CALL");
      },
      false,
    ),
    tasks: f.tasks,
    environments,
    engines,
    origin,
    operatorSecret: secret,
    liveAllowed: false,
  });
  try {
    expect((await app.inject("/api/profiles")).statusCode).toBe(401);
    const logged = await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin },
        payload: { password: secret },
      }),
      headers = {
        origin,
        cookie: String(logged.headers["set-cookie"]).split(";")[0],
        "x-csrf-token": logged.json().csrf,
      };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/profiles/drafts",
          headers: { cookie: headers.cookie },
          payload: { ...draft, profile: { id: "legacy-loop", version: "1" } },
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: "POST",
      url: "/api/profiles/drafts",
      headers,
      payload: { ...draft, profile: { id: "legacy-loop", version: "1" } },
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().cohortId;
    expect((await app.inject({ url: "/api/profiles", headers })).json().profiles[0].compatible).toBe(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reports/export",
          headers,
          payload: { scope: "shareable", cohortIds: [id] },
        })
      ).json().schemaVersion,
    ).toBe("fleet.operation-report.v1");
    expect(
      (
        await app.inject({ method: "POST", url: `/api/cohorts/${id}/state`, headers, payload: { state: "running" } })
      ).json().error.code,
    ).toBe("LIVE_EXECUTION_DISABLED");
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
    expect((await f.store.publicState()).turns).toHaveLength(0);
  } finally {
    await app.close();
  }
});

it("pins the draft environment before binding and rejects a different deployment selection", async () => {
  const f = await setup(),
    d = await f.console.createProfileDraft({ ...draft, profile: { id: "reactive-basic", version: "1" } });
  const ref = { ...boardRef, instanceId: "other-world" },
    environments = new EnvironmentRegistry([boardEnvironment().adapter], ref),
    console = new ProfileConsole(
      f.store,
      f.tasks,
      environments,
      new EngineRegistry([
        { ref: { id: "reactive-basic", version: "1" }, requiredCapabilities: {}, run: async () => {} },
      ]),
    );
  await expect(console.prepareStart(d.cohortId)).rejects.toMatchObject({ code: "ENVIRONMENT_NOT_SELECTED" });
});

it("refuses terminal starts before creating bindings, and accepts an existing generic binding without an enrollment port", async () => {
  const f = await setup(),
    d = await f.console.createProfileDraft({ ...draft, profile: { id: "reactive-basic", version: "1" } });
  await f.store.setState(d.cohortId, "stopped", false);
  await expect(f.console.prepareStart(d.cohortId)).rejects.toMatchObject({ code: "TERMINAL_COHORT" });
  const fresh = await f.console.createProfileDraft({ ...draft, profile: { id: "reactive-basic", version: "1" } });
  await f.store.configure(fresh.cohortId, { model: { route: "ollama", model: "fake-model" }, budget });
  const agent = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [fresh.cohortId])).rows[0];
  await f.tasks.bindings.bind(agent.id, {
    environment: boardRef,
    accountRef: "player",
    actorRef: "seat",
    entityRef: "piece",
  });
  await expect(f.console.prepareStart(fresh.cohortId)).resolves.toBeUndefined();
  expect((await f.store.cohort(fresh.cohortId)).state).toBe("draft");
});
