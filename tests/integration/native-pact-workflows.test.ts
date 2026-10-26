import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { compatibilityContextFor, hostScopeFactory } from "../../src/app/host-services.js";
import { Cognition } from "../../src/cognition.js";
import { type Data, type ModelPort, object } from "../../src/domain.js";
import { LegacyEngineBridge } from "../../src/engines/legacy/bridge.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { expandFactTables } from "../../src/fact-table.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { pactActionBasis, pactWaitSchema } from "../../src/games/pact/goal-state.js";
import { compileGenerationSchema, prepareVllmGenerationSchema } from "../../src/model-schema.js";
import { Observability } from "../../src/observability.js";
import { ModelAdmission, RouteCapacity } from "../../src/platform/admission.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EngineRegistry } from "../../src/platform/engine-registry.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { CommandExecutor } from "../../src/platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../../src/platform/supervisor.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { Store } from "../../src/store.js";
import { nativePactWorkflow } from "../fixtures/native-pact-workflow.js";
import { fixture } from "../helpers.js";

let pact: Awaited<ReturnType<typeof nativePactWorkflow>>;
const schemas: Data[] = [];
beforeAll(async () => {
  pact = await nativePactWorkflow();
});
afterAll(async () => {
  if (process.env.FLEET_OFFLINE_SCHEMAS)
    await writeFile(process.env.FLEET_OFFLINE_SCHEMAS, JSON.stringify(schemas), { mode: 0o600 });
  await pact?.close();
});
const profiles = [
  "legacy-loop@1",
  "legacy-cognition@1",
  "reactive-basic@1",
  "reactive-cognition@1",
  "reactive-cognition@1.1",
  "reactive-cognition@2",
  "specialist-coordinator@1",
  "autonomous-specialists@1",
];
const prerequisiteOwners: { kingdomId: string; token: string }[] = [];

it.each(
  profiles.flatMap((profile) => ["prerequisite", "introduction", "message"].map((phase) => ({ profile, phase }))),
)(
  "$profile completes native $phase through real MCP and the durable host",
  async ({ profile, phase }) => {
    const f = await fixture(),
      owner = await pact.addOwner();
    if (phase === "prerequisite") prerequisiteOwners.push(owner);
    const ref = { id: "pact", version: "1", instanceId: "owned-native-inactivity-fixture" };
    let model: ModelPort;
    const games = new Map<string, string>();
    const makeGame = async (agent: string) => pact.game(games.get(agent)!);
    let store: Store;
    const architectures = builtinArchitectures(
      Object.fromEntries(
        ["legacy-loop@1", "legacy-cognition@1"].map((key) => [
          key,
          (services: Parameters<typeof compatibilityContextFor>[0]) => ({
            route: () => [],
            run: async () => {
              const ctx = compatibilityContextFor(services);
              await new LegacyEngineBridge(
                store,
                model,
                makeGame,
                true,
                pactAdapter,
                undefined,
                undefined,
                new Cognition(store),
              ).run(ctx.claim.turn);
            },
          }),
        ]),
      ),
    );
    store = new Store(f.pool, f.store.vault, () => new Date(), architectures);
    const bindings = new Bindings(store, ref),
      legacyBindings = new PactBindings(store, bindings);
    const environments = new EnvironmentRegistry(
      [
        createPactEnvironment({
          store,
          bindings: legacyBindings,
          game: makeGame,
          now: store.now,
          eventFeedVersion: "pact.agent-events.v1",
          outlookVersion: "pact.agent-outlook.v1",
          actionEffectsVersion: "fleet.action-effects.v1",
          coordinationVersion: "pact.coordination.v1",
        }),
      ],
      ref,
    );
    const tasks = new TaskStore(store, bindings, 1, environments);
    const [id, version] = profile.split("@"),
      definition = architectures.resolve({ id, version });
    const group = await store.create({
      name: "Synthetic native workflow",
      count: 1,
      intervalMinutes: 15,
      seed: "fixture",
      strategies: ["guardian"],
    });
    await tasks.enroll(group.id, { id, version }, false);
    if (id === "autonomous-specialists")
      await f.pool.query("UPDATE cohort_engine_profiles SET architecture_config=$2 WHERE cohort_id=$1", [
        group.id,
        {
          ...definition.manifest.defaults,
          preset: "full",
          learning: false,
          skillMode: "off",
          decisionContract: "read-final.v3",
          contextPackingContract: "required-first.v2",
          readQueryContract: "environment.v3",
        },
      ]);
    await store.configure(group.id, {
      model: {
        route: "openai-compatible",
        provider: "vllm",
        model: "nemotron-4b",
        ...(id === "legacy-cognition" ? { cognition: "llm-centered-v1" } : {}),
      },
      budget: {
        mode: "finite",
        callLimit: 100,
        tokenLimit: 4000000,
        deadlineAt: new Date(Date.now() + 600000).toISOString(),
        perCallTokenLimit: 40000,
        maxOutputTokens: 1536,
        inputByteLimit: 32000,
        maxCallsPerTurn: 3,
        maxActionsPerTurn: 1,
        concurrency: 1,
      },
    });
    await store.consent(group.id, true);
    const agentId = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [group.id])).rows[0].id;
    await f.pool.query(
      "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
      [agentId, owner.accountId, owner.kingdomId],
    );
    games.set(agentId, owner.token);
    const binding = await legacyBindings.attach(agentId);
    await store.setState(group.id, "running", true);
    const seed = await pact.game(owner.token);
    await seed.open();
    let messagePeer: string | undefined;
    if (phase === "prerequisite")
      expect(
        (await seed.submit(randomUUID(), { kind: "game.building.queue", building: "hall", targetLevel: 2, slot: 1 }))
          .code,
      ).toBe("COMMITTED");
    if (phase === "message") {
      const peer = await pact.addOwner();
      messagePeer = peer.kingdomId;
      expect(
        (
          await seed.submit(randomUUID(), {
            kind: "game.contact.request",
            recipientKingdomId: peer.kingdomId,
            note: "Synthetic introduction.",
          })
        ).code,
      ).toBe("COMMITTED");
      const request = (
        await pact.pool.query(
          "SELECT id FROM cold_contact_requests WHERE sender_kingdom_id=$1 AND recipient_kingdom_id=$2",
          [owner.kingdomId, peer.kingdomId],
        )
      ).rows[0].id;
      const peerGame = await pact.game(peer.token);
      await peerGame.open();
      expect(
        (await peerGame.submit(randomUUID(), { kind: "game.contact.answer", requestId: request, accept: true })).code,
      ).toBe("COMMITTED");
      await peerGame.close();
    }
    await seed.close();
    if (phase !== "prerequisite")
      await pact.pool.query("UPDATE kingdom_mandates SET allowed_actions=$2,version=version+1 WHERE account_id=$1", [
        owner.accountId,
        [phase === "introduction" ? "contact.request" : "message.send.contact"],
      ]);
    const preview = await pact.game(owner.token),
      nativeFacts = await pactAdapter.initial(preview, owner.kingdomId);
    await preview.close();
    if (phase === "prerequisite") expect(pactWaitSchema(nativeFacts)).toBeDefined();
    const targetAction: Data =
      phase === "prerequisite"
        ? { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 2 }
        : phase === "introduction"
          ? {
              kind: "game.contact.request",
              recipientKingdomId: object((object(nativeFacts.discovery).players as Data[])[0]).kingdomId,
              note: "Synthetic introduction; no agreement or delivery promised.",
            }
          : {
              kind: "game.message.send",
              recipientKingdomId: messagePeer,
              body: "Synthetic contact follow-up. This message makes no agreement or delivery guarantee.",
            };
    let calls = 0,
      callsThisTurn = 0,
      rejectedIdle = phase !== "prerequisite";
    model = {
      decide: async (request) => {
        calls++;
        callsThisTurn++;
        expect(callsThisTurn).toBeLessThanOrEqual(3);
        expect(
          Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
        ).toBeLessThanOrEqual(32000);
        schemas.push(prepareVllmGenerationSchema(request.schema));
        const packets = request.messages.flatMap((m) => {
          try {
            return [object(JSON.parse(m.content))];
          } catch {
            return [];
          }
        });
        const p = packets.find((p) => p.stage === "worker" || p.stage === "coordinator") ?? packets[0];
        let decision: Data;
        if (p.stage === "coordinator")
          decision = {
            commandIds: [object((p.proposals as Data[])[0].intent).commandId],
            judgement: "Use the selected actual prerequisite.",
          };
        else if (p.stage === "worker") {
          if (!rejectedIdle) {
            rejectedIdle = true;
            decision = { summary: "Wait for prerequisites", proposal: null };
          } else {
            const focus = object(p.focus),
              options = object(expandFactTables(focus.observation)).options as Data[];
            const o = options.find(
              (o) =>
                object(o.payload).kind === targetAction.kind &&
                (phase !== "prerequisite" || object(o.payload).building === "farm"),
            )!;
            decision = o
              ? {
                  summary: "Propose the ready farm prerequisite.",
                  proposal: {
                    intent: { schemaId: "pact.action.v1", payload: o.payload },
                    evidenceRefs: focus.sourceRefs,
                    claims: o.claims,
                    conflicts: [],
                    expectedOutcome: o.expectedOutcome,
                  },
                }
              : {
                  summary: "The selected goal concerns another action family.",
                  proposal: null,
                  deferral: {
                    reason: "different_owner_priority",
                    explanation: "This synthetic owner task selects a different action family.",
                    reconsiderWhen: "Next focused review.",
                  },
                };
          }
        } else {
          const legacy = id.startsWith("legacy");
          const action = targetAction;
          const env = object(p.observation),
            goal = object(p.goal),
            state = object(goal.currentState);
          const facts = Object.keys(object(env.payload).world ?? {}).length ? object(env.payload) : undefined;
          const basis = pactActionBasis(nativeFacts);
          const inner = !rejectedIdle
            ? { kind: "wait", summary: "Wait for prerequisites" }
            : legacy
              ? { kind: "action", action, summary: "Queue a ready prerequisite." }
              : {
                  kind: "action",
                  schemaId: "pact.action.v1",
                  payload: action,
                  ...(basis ? { expectedOutcome: { actionKind: action.kind, basis } } : {}),
                  summary: id === "autonomous-specialists" ? "Action proposed." : "Queue a ready prerequisite.",
                };
          rejectedIdle = true;
          decision = (legacy && id !== "legacy-cognition") || id === "reactive-basic" ? inner : { decision: inner };
          if (id === "legacy-cognition")
            decision = {
              cognition: {
                expectedVersion: object(p.cognition).version,
                analysis: {
                  type: "none",
                  reason: "No new subjective interpretation is needed in this synthetic workflow.",
                },
              },
              decision: inner,
            };
          // The intentionally invalid first wait exercises the host's bounded correction.
          if (calls > 1) {
            let check = compileGenerationSchema(request.schema);
            if (legacy && !check(decision)) {
              const read = {
                kind: "read",
                tool: "fleet_action_schema",
                args: { kind: action.kind },
                summary: "Read the paged action shape before submitting.",
              };
              decision = id === "legacy-cognition" ? { ...object(decision), decision: read } : read;
              check = compileGenerationSchema(request.schema);
            }
            expect(check(decision), JSON.stringify({ profile, packetKeys: Object.keys(p), errors: check.errors })).toBe(
              true,
            );
          }
          void facts;
        }
        return { decision, inputTokens: 1, outputTokens: 1 };
      },
    };
    const admission = new ModelAdmission(
        store,
        tasks,
        model,
        new RouteCapacity(store, () => ({ key: "offline-native", capacity: 1 })),
      ),
      commands = new CommandExecutor(store, tasks, bindings, environments);
    const host = new PlatformHost(
      tasks,
      bindings,
      environments,
      new EngineRegistry([], architectures),
      admission,
      commands,
      new OperationSupervisor(tasks),
      hostScopeFactory({ store, tasks, bindings, model: admission, commands }),
    );
    try {
      const event = {
        id: randomUUID(),
        type: "fixture",
        sourceRef: "synthetic:prerequisite",
        observedAt: store.now().toISOString(),
        environmentTime: { clockId: "pact.game-time-ms", value: "0" },
        metadata: {},
      };
      if (id === "autonomous-specialists")
        await tasks.publishFromEvent(
          binding,
          { ...event, metadata: { category: phase === "prerequisite" ? "building" : "contact" } },
          `native-${phase}`,
        );
      else await tasks.upsertFromEvent(binding, event, "native-prerequisite");
      const claim = await tasks.claim("offline-native", store.now());
      expect(claim).not.toBeNull();
      await host.run(claim!);
      if (id === "specialist-coordinator" && phase !== "prerequisite") {
        for (let review = 1; review < 8; review++) {
          const table = phase === "introduction" ? "cold_contact_requests" : "direct_messages";
          if (
            (
              await pact.pool.query(`SELECT count(*)::int n FROM ${table} WHERE sender_kingdom_id=$1`, [
                owner.kingdomId,
              ])
            ).rows[0].n
          )
            break;
          callsThisTurn = 0;
          await tasks.upsertFromEvent(binding, { ...event, id: randomUUID() }, `native-${phase}:${review}`);
          const next = await tasks.claim("offline-native", store.now());
          expect(next).not.toBeNull();
          await host.run(next!);
        }
      }
      expect(rejectedIdle).toBe(true);
      const actual =
        phase === "prerequisite"
          ? (
              await pact.pool.query(
                "SELECT building_kind,target_level FROM building_instructions WHERE kingdom_id=$1",
                [owner.kingdomId],
              )
            ).rows
          : phase === "introduction"
            ? (
                await pact.pool.query(
                  "SELECT recipient_kingdom_id FROM cold_contact_requests WHERE sender_kingdom_id=$1",
                  [owner.kingdomId],
                )
              ).rows
            : (
                await pact.pool.query("SELECT recipient_kingdom_id FROM direct_messages WHERE sender_kingdom_id=$1", [
                  owner.kingdomId,
                ])
              ).rows;
      const report = await new Observability(store).run(claim!.turn.id);
      expect(
        actual,
        JSON.stringify({
          profile,
          phase,
          calls,
          turn: (await f.pool.query("SELECT state,code,calls FROM turns")).rows,
          events: report.turn.events
            .filter((e) => !e.label.startsWith("Debug:"))
            .map((e) => ({ label: e.label, code: object(e.detail).code, reason: object(e.detail).reason })),
        }),
      ).toContainEqual(
        expect.objectContaining(
          phase === "prerequisite"
            ? { building_kind: "farm", target_level: 2 }
            : { recipient_kingdom_id: targetAction.recipientKingdomId },
        ),
      );
      expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='unknown'")).rows[0].n).toBe(
        0,
      );
      expect(
        (
          await pact.pool.query(
            "SELECT count(*)::int n FROM write_leases WHERE subject_id=$1 AND released_at IS NULL",
            [owner.accountId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect((await f.pool.query("SELECT max(calls)::int n FROM turns")).rows[0].n).toBeLessThanOrEqual(3);
    } finally {
      await f.pool.end();
    }
  },
  60000,
);

it("native ticks complete the prerequisite chain and then the existing Hall order, without duplicating it", async () => {
  expect(prerequisiteOwners).toHaveLength(8);
  await pact.settleSupply(31 * 60000);
  for (const owner of prerequisiteOwners) {
    const levels = () =>
      pact.pool.query(
        "SELECT kind,level FROM kingdom_buildings WHERE kingdom_id=$1 AND kind IN ('farm','barracks','hall') ORDER BY kind",
        [owner.kingdomId],
      );
    expect((await levels()).rows).toContainEqual({ kind: "farm", level: 2 });
    expect((await levels()).rows).toContainEqual({ kind: "hall", level: 1 });
    const game = await pact.game(owner.token);
    try {
      await game.open();
      expect(
        (
          await game.submit(randomUUID(), {
            kind: "game.building.queue",
            building: "barracks",
            targetLevel: 2,
            slot: 2,
          })
        ).code,
      ).toBe("COMMITTED");
    } finally {
      await game.close();
    }
  }
  await pact.settleSupply(93 * 60000);
  for (const owner of prerequisiteOwners) {
    expect(
      (
        await pact.pool.query(
          "SELECT kind,level FROM kingdom_buildings WHERE kingdom_id=$1 AND kind IN ('farm','barracks','hall') ORDER BY kind",
          [owner.kingdomId],
        )
      ).rows,
    ).toEqual([
      { kind: "barracks", level: 2 },
      { kind: "farm", level: 2 },
      { kind: "hall", level: 2 },
    ]);
    expect(
      (
        await pact.pool.query(
          "SELECT count(*)::int n FROM building_instructions WHERE kingdom_id=$1 AND building_kind='hall'",
          [owner.kingdomId],
        )
      ).rows[0].n,
    ).toBe(1);
  }
}, 60000);
