import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hostScopeFactory } from "../../src/app/host-services.js";
import type { Data, GamePort, ModelPort } from "../../src/domain.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { ModelAdmission, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { budget, fixture, tools } from "../helpers.js";
export async function pactSkillNativeFixture(model: ModelPort, options: { learning?: boolean } = {}) {
  const root = process.env.PACT_ACCEPTANCE_ROOT;
  if (!root || process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("OWNED_PAIRED_FIXTURE_REQUIRED");
  const { actionEffectsFixture } = await import(pathToFileURL(resolve(root, "tests/fixtures/action-effects.ts")).href),
    pact = await actionEffectsFixture(),
    f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const own = await pact.owner(),
    peer = await pact.owner(),
    selected = { id: "pact", version: "1", instanceId: "owned-skill-fixture" },
    bindings = new Bindings(f.store, selected);
  let reads = 0;
  let afterQuote: (() => Promise<void>) | undefined;
  const game: GamePort = {
    profile: async () => ({ accountId: own.accountId }),
    tools: async () => [
      ...tools,
      { name: "pact_observation_read_v2", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
      { name: "pact_action_effects_quote_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
      { name: "pact_action_effects_execute_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } },
    ],
    read: async (name, args) => {
      reads++;
      return name === "pact_world_read_v1"
        ? pact.views.readSelf(own.accountId)
        : name === "pact_agent_guide_v1"
          ? pact.guide.read(own.accountId, args.topic ?? "start")
          : name === "pact_observation_read_v2"
            ? pact.views.readSection(own.accountId, args)
            : Promise.reject(Error("UNSUPPORTED_READ"));
    },
    open: async () => {},
    close: async () => {},
    submit: async () => {
      throw Error("UNGUARDED_LANE_FORBIDDEN");
    },
    effects: async (c) => {
      const q = await pact.effects.quote(own.principal, c);
      await afterQuote?.();
      return q;
    },
    submitGuarded: (command, guard) => pact.dispatcher.dispatchGuarded(own.principal, { command, guard }),
    receipt: async (id) =>
      (await pact.dispatcher.lookupReceipt(own.principal, id)) ?? { commandId: id, code: "RECEIPT_NOT_FOUND" },
  };
  const adapter = createPactEnvironment({
      store: f.store,
      bindings: new PactBindings(f.store, bindings),
      game: async () => game,
      now: f.now,
      eventFeedVersion: "pact.agent-events.v1",
      actionEffectsVersion: "fleet.action-effects.v1",
    }),
    environments = new EnvironmentRegistry([adapter], selected),
    tasks = new TaskStore(f.store, bindings, 1, environments),
    group = await f.store.create({
      name: "Owned skill fixture",
      count: 1,
      intervalMinutes: 15,
      seed: "owned",
      strategies: ["guardian"],
    });
  await f.store.configure(group.id, {
    model: { route: "ollama", model: "authored-fake" },
    budget: { ...budget, deadlineAt: new Date(f.now().getTime() + 8 * 3600000).toISOString(), inputByteLimit: 24000 },
  });
  await tasks.enroll(group.id, { id: "autonomous-specialists", version: "1" });
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=$2,non_model_limits=$3 WHERE cohort_id=$1",
    [
      group.id,
      {
        preset: "resources-diplomacy",
        maxActiveGoals: 8,
        memoryBytes: 6000,
        skillMode: "guarded",
        learning: options.learning ?? false,
      },
      { reads: 200, actions: 4, messages: 0, steps: 300, wallTimeMs: 8 * 3600000 },
    ],
  );
  const agent = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [group.id])).rows[0].id;
  await f.pool.query(
    "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
    [agent, own.accountId, own.kingdomId],
  );
  const binding = await bindings.bind(agent, {
    environment: selected,
    accountRef: own.accountId,
    actorRef: own.accountId,
    entityRef: own.kingdomId,
  });
  await f.store.consent(group.id, true);
  await f.store.setState(group.id, "running", true);
  const inputSizes: number[] = [];
  const admission = new ModelAdmission(
      f.store,
      tasks,
      {
        decide: async (request) => {
          const size =
            Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema));
          inputSizes.push(size);
          if (size > 24000) throw Error("FIXTURE_PACKET_LIMIT");
          return model.decide(request);
        },
      },
      new RouteCapacity(f.store, () => ({ key: "owned-skill", capacity: 1 })),
    ),
    commands = new CommandExecutor(f.store, tasks, bindings, environments),
    host = new PlatformHost(
      tasks,
      bindings,
      environments,
      new EngineRegistry([], f.store.architectures),
      admission,
      commands,
      new OperationSupervisor(tasks),
      hostScopeFactory({ store: f.store, tasks, bindings, model: admission, commands }),
    );
  const run = async () => {
    const ids = await tasks.publishFromEvent(
      binding,
      {
        id: randomUUID(),
        type: "owned-skill-fixture",
        sourceRef: "synthetic:offer",
        observedAt: f.now().toISOString(),
        environmentTime: { clockId: "pact.game-time-ms", value: "0" },
        metadata: { category: "offer" },
      },
      "offer",
    );
    const claim = await tasks.claim("owned-skill", f.now(), ids[0]?.id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await host.run(claim);
    return claim;
  };
  return {
    ...f,
    pact,
    own,
    peer,
    binding,
    group,
    tasks,
    host,
    setAfterQuote: (f: () => Promise<void>) => {
      afterQuote = f;
    },
    run,
    get reads() {
      return reads;
    },
    get inputSizes() {
      return [...inputSizes];
    },
    advanceBoth: (ms: number) => {
      f.advance(ms);
      pact.advance(ms);
    },
    scope: { instanceId: `${binding.id}:autonomous-specialists@1`, bindingId: binding.id, specialistId: "diplomacy" },
    close: async () => {
      await f.pool.end();
      await pact.close();
    },
  };
}
