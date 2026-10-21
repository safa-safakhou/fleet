import { randomUUID } from "node:crypto";
import { hostScopeFactory } from "../src/app/host-services.js";
import type { ModelPort } from "../src/domain.js";
import { ModelAdmission, RouteCapacity } from "../src/platform/admission.js";
import { Bindings } from "../src/platform/bindings.js";
import type { CapabilityRequirements } from "../src/platform/contracts.js";
import { EngineRegistry } from "../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../src/platform/environment-registry.js";
import { CommandExecutor } from "../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../src/platform/supervisor.js";
import { TaskStore } from "../src/platform/tasks.js";
import { boardEnvironment, boardRef } from "./fixtures/environments/board.js";
import { budget, fixture } from "./helpers.js";
export const profile = { id: "fixture-loop", version: "1" };
export async function platformFixture(capacity = 2) {
  const f = await fixture(),
    bindings = new Bindings(f.store, boardRef),
    board = boardEnvironment(),
    environments = new EnvironmentRegistry([board.adapter], boardRef),
    tasks = new TaskStore(f.store, bindings, 4, environments);
  const route = new RouteCapacity(f.store, () => ({ key: `fixture:${key}`, capacity })),
    key = randomUUID();
  async function cohort(count = 2) {
    const { id } = await f.store.create({
      name: "Synthetic boards",
      count,
      intervalMinutes: 15,
      seed: "board",
      strategies: ["guardian"],
    });
    await f.store.configure(id, {
      model: { route: "ollama", model: "fake-model" },
      budget: { ...budget, concurrency: 4 },
    });
    await tasks.enroll(id, profile);
    const agents = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id])).rows;
    const refs = [];
    for (const a of agents) {
      refs.push(
        await bindings.bind(a.id, {
          environment: boardRef,
          accountRef: `player:${a.id}`,
          actorRef: `seat:${a.id}`,
          entityRef: `board:${a.id}`,
        }),
      );
      await f.pool.query("UPDATE agents SET state='ready',credential_state='ready' WHERE id=$1", [a.id]);
    }
    await f.store.setState(id, "running", true);
    return { id, bindings: refs };
  }
  const group = await cohort();
  const enqueue = (
    binding = group.bindings[0],
    key = "work",
    source = "source:1",
    deadline?: { clockId: string; value: string },
  ) =>
    tasks.upsertFromEvent(
      binding,
      {
        id: source,
        type: "fixture",
        sourceRef: source,
        observedAt: f.now().toISOString(),
        environmentTime: { clockId: "board.ply", value: "0" },
        ...(deadline ? { deadline } : {}),
        metadata: {},
      },
      key,
    );
  const claim = async () => {
    const value = await tasks.claim("fixture-worker", f.now());
    if (!value) throw Error("NO_TASK_CLAIM");
    return value;
  };
  const request = (signal = new AbortController().signal) => ({
    model: { route: "ollama" as const, model: "fake-model" },
    messages: [{ role: "user", content: "Observe and decide." }],
    schema: { type: "object" },
    maxOutputTokens: 2000,
    signal,
  });
  function host(
    model: ModelPort,
    run?: import("../src/platform/engine-registry.js").AgentEngine["run"],
    requirements: CapabilityRequirements = {},
    architectureRegistry?: import("../src/platform/architecture.js").ArchitectureRegistry,
  ) {
    const admission = new ModelAdmission(f.store, tasks, model, route),
      commands = new CommandExecutor(f.store, tasks, bindings, environments),
      supervisor = new OperationSupervisor(tasks);
    const engines = new EngineRegistry([], architectureRegistry);
    engines.register({
      ref: profile,
      requiredCapabilities: requirements,
      requiredSchemas: { observations: ["board.position.v1"], actions: ["board.move.v1"] },
      run:
        run ??
        (async (ctx) => {
          await ctx.model.decide(ctx.claim, request(ctx.signal));
        }),
    });
    return {
      host: new PlatformHost(
        tasks,
        bindings,
        environments,
        engines,
        admission,
        commands,
        supervisor,
        hostScopeFactory({ store: f.store, tasks, bindings, model: admission, commands }),
      ),
      admission,
      commands,
      supervisor,
      engines,
    };
  }
  return { ...f, bindings, tasks, board, environments, route, cohort, group, enqueue, claim, request, host };
}
