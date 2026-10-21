import { randomUUID } from "node:crypto";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { buildServer } from "../../src/server.js";
import { Store } from "../../src/store.js";
import { budget, FakeModel, fixture } from "../helpers.js";
import { Engine } from "../pact-engine.js";
import { boardEnvironment, boardRef } from "./environments/board.js";

export async function launchFixture(liveAllowed = true, providerConfigured = true) {
  const f = await fixture(),
    architectures = builtinArchitectures(),
    original = architectures.resolve({ id: "reactive-basic", version: "1" });
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
    { id } = await store.create({
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
  const origin = "http://127.0.0.1:38881",
    secret = "fixture-secret-".repeat(4),
    app = buildServer({
      store,
      broker: new CredentialBroker(store, "http://127.0.0.1:1", origin, false),
      engine: new Engine(
        store,
        new FakeModel([]),
        async () => {
          throw Error("NO_GAME_CONNECTION");
        },
        false,
      ),
      origin,
      operatorSecret: secret,
      liveAllowed,
      providerConfigured: () => providerConfigured,
      tasks,
      environments,
      architectures,
    });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { password: secret },
  });
  const headers = {
    origin,
    "content-type": "application/json",
    cookie: String(login.headers["set-cookie"]).split(";")[0],
    "x-csrf-token": login.json().csrf,
  };
  const api = async <T>(path: string, body?: unknown, method?: "POST" | "PUT"): Promise<T> => {
    const response = await app.inject({
      url: `/api${path}`,
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers,
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    if (response.statusCode >= 400) throw Error(response.json().error.code);
    return response.json();
  };
  const spec = {
    architecture: { id: "fixture", version: "2" },
    environment: boardRef,
    architectureConfig: { depth: 2 },
    model: { route: "ollama", model: "offline-fixture" },
    budget,
    accounts: { agentIds: [agent] },
  };
  return {
    ...f,
    store,
    architectures,
    tasks,
    board,
    environments,
    app,
    api,
    spec,
    headers,
    id,
    agent,
    async close() {
      await app.close();
      await f.pool.end();
    },
  };
}
