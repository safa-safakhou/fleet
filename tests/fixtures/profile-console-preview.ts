// Disposable operator-console browser fixture. Never imports runtime/config or connects to a game.
import { randomUUID } from "node:crypto";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { ProfileConsole } from "../../src/platform/profile-console.js";
import { PlatformReports } from "../../src/platform/reports.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { buildServer } from "../../src/server.js";
import { budget, FakeModel, fixture } from "../helpers.js";
import { Engine } from "../pact-engine.js";
import { boardEnvironment, boardRef } from "./environments/board.js";

const f = await fixture(),
  bindings = new Bindings(f.store, boardRef),
  tasks = new TaskStore(f.store, bindings),
  environments = new EnvironmentRegistry([boardEnvironment().adapter], boardRef);
const refs = ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition", "specialist-coordinator"],
  engines = new EngineRegistry(
    refs.map((id) => ({
      ref: { id, version: "1" },
      requiredCapabilities: id === "specialist-coordinator" ? { coordination: true } : {},
      run: async () => {
        throw Error("NO_INFERENCE_IN_PREVIEW");
      },
    })),
  ),
  profiles = new ProfileConsole(f.store, tasks, environments, engines),
  ids = [];
for (const id of refs.slice(0, 4)) {
  const d = await profiles.createProfileDraft({
    name: `Synthetic ${id}`,
    count: 1,
    intervalMinutes: 15,
    seed: "preview",
    strategies: ["guardian"],
    profile: { id, version: "1" },
  });
  await f.store.configure(d.cohortId, {
    model: {
      route: "ollama",
      model: "fake-model",
      ...(id === "legacy-cognition" ? { cognition: "llm-centered-v1" } : {}),
    },
    budget,
  });
  ids.push(d.cohortId);
}
await new PlatformReports(f.store).link({
  requestId: randomUUID(),
  name: "Four engine profiles",
  cohortIds: ids,
  design: "interacting_world",
});
const a = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [ids[0]])).rows[0];
const turnId = randomUUID();
await f.pool.query(
  "INSERT INTO turns(id,agent_id,cohort_id,generation,fence,worker,state,due_at,started_at,deadline_at,finished_at,code,summary) VALUES($1,$2,$3,0,0,'synthetic-preview','finished',$4,$4,$4,$4,'WAIT','Recorded fixture wait; historical detailed evidence unavailable')",
  [turnId, a.id, ids[0], f.now()],
);
const origin = "http://127.0.0.1:8831",
  app = buildServer({
    store: f.store,
    broker: new CredentialBroker(f.store, "http://127.0.0.1:9999", origin, false),
    engine: new Engine(
      f.store,
      new FakeModel(),
      async () => {
        throw Error("NO_GAME_ACCESS_IN_PREVIEW");
      },
      false,
    ),
    tasks,
    environments,
    engines,
    origin,
    operatorSecret: "synthetic-profile-preview-password",
    liveAllowed: false,
    demo: true,
  });
await app.listen({ host: "0.0.0.0", port: 8831 });
console.log(JSON.stringify({ origin, turnId, synthetic: true, liveAllowed: false }));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app
      .close()
      .then(() => f.pool.end())
      .then(() => process.exit(0));
  });
