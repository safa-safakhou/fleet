import { afterEach, expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { hostScopeFactory } from "../../src/app/host-services.js";
import type { Data, ModelPort } from "../../src/domain.js";
import { object } from "../../src/domain.js";
import { definition } from "../../src/engines/continuity/engine-v2.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";
import { ModelAdmission } from "../../src/platform/admission.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { platformFixture } from "../platform-helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it("accepted memory and original default survive restart, ten stock observations, and a later actual engine turn", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.store.consent(f.group.id, true);
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, definition.manifest.ref);
  await f.store.setState(f.group.id, "running", true);
  f.board.adapter.capabilities.continuity = true;
  const connect = f.board.adapter.connect;
  let turn = 0;
  f.board.adapter.connect = async (b) => {
    const s = await connect(b);
    return {
      ...s,
      projectObservation: projectPactObservation,
      observe: async () => {
        const o = await s.observe({});
        const time = String(1000 + turn++);
        return {
          ...o,
          observedAt: f.now().toISOString(),
          revision: time,
          payload: {
            world: { profile: { kingdomId: b.entityRef }, asOfGameTimeMs: time, stock: { iron: String(turn) } },
            guide: { asOfGameTimeMs: time, agreementCoverage: { hasMore: false } },
            agreementSection: {
              coverage: { hasMore: false },
              records:
                turn === 1
                  ? [
                      {
                        type: "SupplyContract",
                        id: "historic-contract",
                        kingdomA: b.entityRef,
                        kingdomB: "peer",
                        status: "defaulted",
                        offerId: "promise",
                        offerVersion: 1,
                        startGameTimeMs: "0",
                        endGameTimeMs: "500",
                        terms: {
                          aToB: { resource: "iron", wholePerHour: 2 },
                          bToA: { resource: "silver", wholePerHour: 1 },
                          aBond: null,
                          bBond: null,
                          durationHours: 1,
                          noticeHours: 0,
                        },
                        deliveries: [
                          {
                            direction: "received",
                            resource: "silver",
                            dueMarked: "600",
                            deliveredMarked: "0",
                            failedInstallments: 1,
                            installments: 1,
                          },
                        ],
                      },
                    ]
                  : [],
            },
          },
        };
      },
    };
  };
  const packets: Data[] = [];
  function host() {
    const model: ModelPort = {
      decide: async (request) => {
        const packet = JSON.parse(request.messages[1].content);
        packets.push(packet);
        const memory = object(packet.negotiationMemory);
        expect(memory.deliveredIds).toBeDefined();
        const ids = (memory.deliveredIds ?? []) as string[];
        return {
          decision: {
            decision: { kind: "wait", summary: "Current stock wait" },
            ...(packets.length === 1
              ? {
                  memory: {
                    memories: [
                      { id: "lesson", text: "One observed default; future consent still unknown", evidenceRefs: ids },
                    ],
                  },
                }
              : {}),
          },
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    };
    const admission = new ModelAdmission(f.store, f.tasks, model, f.route),
      commands = new CommandExecutor(f.store, f.tasks, f.bindings, f.environments),
      engines = new EngineRegistry([], builtinArchitectures());
    return new PlatformHost(
      f.tasks,
      f.bindings,
      f.environments,
      engines,
      admission,
      commands,
      new OperationSupervisor(f.tasks),
      hostScopeFactory({ store: f.store, tasks: f.tasks, bindings: f.bindings, model: admission, commands }),
    );
  }
  for (let i = 0; i < 12; i++) {
    await f.enqueue(f.group.bindings[0], `turn${i}`, `source:${i}`);
    await host().run(await f.claim());
    f.advance(16 * 60000);
  }
  expect(packets).toHaveLength(12);
  const first = object(packets[0].negotiationMemory),
    last = object(packets.at(-1)?.negotiationMemory);
  expect(first.deliveredIds).toHaveLength(1);
  expect(JSON.stringify(last)).toContain("historic-contract");
  expect(JSON.stringify(last)).toContain("defaulted");
  expect(JSON.stringify(last)).toContain("lesson");
  expect(object(packets[1].memoryWriteAck)).toMatchObject({ status: "accepted" });
  expect(object(packets.at(-1)?.memoryWriteAck)).toMatchObject({ status: "no_op" });
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(12);
  expect(f.board.executions).toBe(0);
  await f.store.consent(f.group.id, false);
  expect((await f.pool.query("SELECT * FROM architecture_scoped_state")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM architecture_scoped_evidence")).rowCount).toBe(0);
});

it("narration is not a memory write; no-write retains the original committed receipt", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.store.consent(f.group.id, true);
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, definition.manifest.ref);
  await f.store.setState(f.group.id, "running", true);
  f.board.adapter.capabilities.continuity = true;
  const packets: Data[] = [];
  const model: ModelPort = {
    decide: async (r) => {
      packets.push(JSON.parse(r.messages[1].content));
      return {
        decision: {
          decision:
            packets.length === 1
              ? {
                  kind: "action",
                  schemaId: "board.move.v1",
                  payload: { to: "a4" },
                  summary: "Remember the result for later",
                }
              : { kind: "wait", summary: "No further work" },
        },
        inputTokens: 1,
        outputTokens: 1,
      };
    },
  };
  const build = () => {
    const admission = new ModelAdmission(f.store, f.tasks, model, f.route),
      commands = new CommandExecutor(f.store, f.tasks, f.bindings, f.environments);
    return new PlatformHost(
      f.tasks,
      f.bindings,
      f.environments,
      new EngineRegistry([], builtinArchitectures()),
      admission,
      commands,
      new OperationSupervisor(f.tasks),
      hostScopeFactory({ store: f.store, tasks: f.tasks, bindings: f.bindings, model: admission, commands }),
    );
  };
  for (let i = 0; i < 2; i++) {
    await f.enqueue(f.group.bindings[0], `step${i}`, `event:${i}`);
    await build().run(await f.claim());
    f.advance(60000);
  }
  expect(f.board.executions).toBe(1);
  expect(object(packets[1].negotiationMemory).deliveredIds).toHaveLength(1);
  expect(JSON.stringify(packets[1].negotiationMemory)).toContain("MOVED");
  const row = (await f.pool.query("SELECT * FROM architecture_scoped_state")).rows[0];
  const saved = f.store.vault.decrypt<Data>(
    row.value_cipher,
    `architecture-state:${row.instance_id}:${row.binding_id}:${row.codec}`,
  );
  expect(saved.memories).toEqual([]);
  expect(saved.ack).toMatchObject({ status: "no_op" });
});
it("unsupported memory is explicitly rejected before action and acknowledged on the normal corrective call", async () => {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.store.consent(f.group.id, true);
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, definition.manifest.ref);
  await f.store.setState(f.group.id, "running", true);
  f.board.adapter.capabilities.continuity = true;
  const packets: Data[] = [];
  const model: ModelPort = {
    decide: async (r) => {
      packets.push(JSON.parse(r.messages[1].content));
      return {
        decision: {
          decision: { kind: "wait", summary: "No work" },
          ...(packets.length === 1
            ? { memory: { memories: [{ id: "bad", text: "Imagined consent", evidenceRefs: ["foreign"] }] } }
            : {}),
        },
        inputTokens: 1,
        outputTokens: 1,
      };
    },
  };
  const admission = new ModelAdmission(f.store, f.tasks, model, f.route),
    commands = new CommandExecutor(f.store, f.tasks, f.bindings, f.environments);
  const host = new PlatformHost(
    f.tasks,
    f.bindings,
    f.environments,
    new EngineRegistry([], builtinArchitectures()),
    admission,
    commands,
    new OperationSupervisor(f.tasks),
    hostScopeFactory({ store: f.store, tasks: f.tasks, bindings: f.bindings, model: admission, commands }),
  );
  await f.enqueue();
  await host.run(await f.claim());
  expect(packets).toHaveLength(2);
  expect(packets[1].memoryWriteAck).toMatchObject({ status: "rejected", reason: "missing_delivered_original" });
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(2);
});
