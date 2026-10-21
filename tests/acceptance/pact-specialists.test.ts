import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { hostScopeFactory } from "../../src/app/host-services.js";
import type { GamePort } from "../../src/domain.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { ModelAdmission, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { budget, fixture, tools } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
it.each(["resources-diplomacy", "full"])(
  "runs %s through independent specialists and real PACT guarded handlers",
  async (preset) => {
    const root = process.env.PACT_ACCEPTANCE_ROOT;
    if (!root || process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("OWNED_PAIRED_FIXTURE_REQUIRED");
    const { actionEffectsFixture } = await import(
      pathToFileURL(resolve(root, "tests/fixtures/action-effects.ts")).href
    );
    const pact = await actionEffectsFixture(),
      f = await fixture();
    close = async () => {
      await f.pool.end();
      await pact.close();
    };
    f.advance(Date.now() - f.now().getTime());
    const own = await pact.owner(),
      peer = await pact.owner(),
      selected = { id: "pact", version: "1", instanceId: "owned-specialist-fixture" },
      bindings = new Bindings(f.store, selected);
    const game: GamePort = {
      profile: async () => ({ accountId: own.accountId }),
      tools: async () => [
        ...tools,
        { name: "pact_action_effects_quote_v1", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
        {
          name: "pact_action_effects_execute_v1",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: false },
        },
      ],
      read: async (name, args) =>
        name === "pact_world_read_v1"
          ? await pact.views.readSelf(own.accountId)
          : name === "pact_agent_guide_v1"
            ? await pact.guide.read(own.accountId, args.topic ?? "start")
            : Promise.reject(Error("UNSUPPORTED_READ")),
      open: async () => {},
      close: async () => {},
      submit: async () => {
        throw Error("UNGUARDED_LANE_FORBIDDEN");
      },
      effects: (command) => pact.effects.quote(own.principal, command),
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
    });
    const environments = new EnvironmentRegistry([adapter], selected),
      tasks = new TaskStore(f.store, bindings, 1, environments),
      group = await f.store.create({
        name: "Paired specialists",
        count: 1,
        intervalMinutes: 15,
        seed: "owned-fixture",
        strategies: ["guardian"],
      });
    await f.store.configure(group.id, {
      model: { route: "ollama", model: "authored-fake" },
      budget: { ...budget, deadlineAt: new Date(f.now().getTime() + 3 * 3600000).toISOString(), inputByteLimit: 40000 },
    });
    await tasks.enroll(group.id, { id: "autonomous-specialists", version: "1" });
    await f.pool.query("UPDATE cohort_engine_profiles SET architecture_config=$2 WHERE cohort_id=$1", [
      group.id,
      { preset, maxActiveGoals: 8, memoryBytes: 6000 },
    ]);
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
    const seen: string[] = [];
    const model = {
      decide: async (request: { messages: { content: string }[] }) => {
        const packet = JSON.parse(request.messages[1].content),
          role = packet.specialist.id;
        seen.push(role);
        const action =
          role === "diplomacy"
            ? {
                kind: "game.contact.request",
                recipientKingdomId: peer.kingdomId,
                note: "Owned synthetic specialist contact",
              }
            : role === "development"
              ? { kind: "game.building.queue", slot: 1, building: "farm", targetLevel: 2 }
              : role === "defense"
                ? { kind: "game.training.queue", type: "spearman", count: 1 }
                : undefined;
        return {
          decision: {
            decision: action
              ? { kind: "action", schemaId: "pact.action.v1", payload: action, summary: "Own authorized action" }
              : { kind: "wait", summary: "Resource check complete" },
          },
          inputTokens: 20,
          outputTokens: 20,
        };
      },
    };
    const admission = new ModelAdmission(
        f.store,
        tasks,
        model,
        new RouteCapacity(f.store, () => ({ key: "paired", capacity: 1 })),
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
    for (const category of preset === "full"
      ? ["resource", "message", "building", "threat"]
      : ["resource", "message"]) {
      const ids = await tasks.publishFromEvent(
        binding,
        {
          id: randomUUID(),
          type: "owned-fixture",
          sourceRef: "synthetic:" + category,
          observedAt: f.now().toISOString(),
          environmentTime: { clockId: "pact.game-time-ms", value: "0" },
          metadata: { category },
        },
        category,
      );
      const claim = await tasks.claim("paired-worker", f.now(), ids[0]?.id);
      if (!claim) throw Error("CLAIM_REQUIRED");
      await host.run(claim);
      f.advance(16 * 60000);
      pact.advance(16 * 60000);
    }
    expect(seen).toEqual(
      preset === "full" ? ["resources", "diplomacy", "development", "defense"] : ["resources", "diplomacy"],
    );
    expect((await pact.pool.query("SELECT * FROM command_receipts")).rowCount).toBe(preset === "full" ? 3 : 1);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(seen.length);
    expect((await f.pool.query("SELECT * FROM specialist_states")).rowCount).toBe(preset === "full" ? 4 : 2);
    expect(adapter.capabilities).not.toHaveProperty("coordination", true);
  },
);
