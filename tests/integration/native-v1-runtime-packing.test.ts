import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { composeRuntime } from "../../src/app/composition.js";
import { config } from "../../src/config.js";
import { type Data, object } from "../../src/domain.js";
import { expandFactTables } from "../../src/fact-table.js";
import { compactFacts, pactAdapter } from "../../src/games/pact/adapter.js";
import { HttpModel } from "../../src/model.js";
import { prepareVllmGenerationSchema } from "../../src/model-schema.js";
import { nativePactWorkflow } from "../fixtures/native-pact-workflow.js";
import { fixture, key, testUrl } from "../helpers.js";

const intent =
  "Develop Hall II by completing its actual Farm II and Barracks II prerequisites. Preserve existing construction orders and reserves. Establish useful contacts and evaluate incoming requests against current facts. Treat old plans as revisable; do not attack other kingdoms. Never claim that a quote, queued order or introduction has already delivered its intended result.";

it.each([
  { queued: false, broad: true, fits: true, inputByteLimit: 32000 },
  { queued: true, broad: false, fits: true, inputByteLimit: 32000 },
  { queued: true, broad: true, fits: false, inputByteLimit: 32000 },
  { queued: true, broad: true, fits: true, inputByteLimit: 64000 },
])(
  "native v1 production composition: %j",
  async ({ queued, broad, fits, inputByteLimit }) => {
    const db = await fixture(),
      pact = await nativePactWorkflow({ completeCatalog: true }),
      provider = Fastify();
    let requests = 0;
    const providerErrors: Error[] = [];
    provider.setErrorHandler((error, _request, reply) => {
      providerErrors.push(error as Error);
      return reply.status(500).send({ error: "synthetic provider assertion" });
    });
    const packets: Data[] = [];
    const admitted: Parameters<HttpModel["decide"]>[0][] = [];
    const realDecide = HttpModel.prototype.decide;
    const spy = vi.spyOn(HttpModel.prototype, "decide").mockImplementation(function (this: HttpModel, input) {
      expect(
        Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
      ).toBeLessThanOrEqual(inputByteLimit);
      admitted.push(input);
      return realDecide.call(this, input);
    });
    provider.post("/v1/chat/completions", async (request, reply) => {
      requests++;
      const body = object(request.body),
        messages = body.messages as { role: string; content: string }[];
      expect(body.model).toBe("nemotron-4b");
      const packet = object(JSON.parse(messages[1].content));
      packets.push(packet);
      // Admission budgets the logical schema. The transport expands references for
      // vLLM; verify that exact transformation rather than confusing the two sizes.
      const logical = admitted.at(-1);
      if (!logical) throw Error("UNEXPECTED_PROVIDER_DISPATCH");
      expect(object(object(body.response_format).json_schema).schema).toEqual(
        prepareVllmGenerationSchema(logical.schema),
      );
      const state = object(object(packet.goal).currentState);
      const decision = {
        decision: {
          kind: "wait",
          summary: "Synthetic offline composition check",
          basis: {
            completedLevels: state.completedLevels,
            queuedPhases: state.queuedPhases,
            ...(state.opportunityRevision
              ? {
                  opportunityRevision: state.opportunityRevision,
                  deferral: {
                    reason: "deliberate_pacing",
                    explanation: "Measure this synthetic input without prescribing a game action.",
                    reconsiderWhen: "Next synthetic review.",
                  },
                }
              : {}),
          },
        },
      };
      const event = (v: unknown) => `data: ${JSON.stringify(v)}\n\n`;
      return reply.type("text/event-stream").send(
        event({
          id: "synthetic",
          choices: [{ index: 0, delta: { content: JSON.stringify(decision) }, finish_reason: "stop" }],
        }) +
          event({ id: "synthetic", choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } }) +
          "data: [DONE]\n\n",
      );
    });
    const base = await provider.listen({ host: "127.0.0.1", port: 0 });
    const r = composeRuntime(
      config({
        DATABASE_URL: testUrl,
        FLEET_OPERATOR_SECRET: "synthetic",
        FLEET_VAULT_KEY: key,
        FLEET_ALLOW_HTTP: "1",
        FLEET_LIVE_ENABLED: "1",
        FLEET_GAME_BASE_URL: pact.base,
        MODEL_BASE_URL: `${base}/v1`,
        MODEL_API_KEY: "synthetic",
        FLEET_ENVIRONMENT_INSTANCE: "synthetic-native-packing",
        FLEET_PACT_OUTLOOK_VERSION: "pact.agent-outlook.v1",
        FLEET_PACT_ACTION_EFFECTS_VERSION: "fleet.action-effects.v1",
        FLEET_PACT_EVENT_FEED_VERSION: "pact.agent-events.v1",
        FLEET_PACT_COORDINATION_VERSION: "pact.coordination.v1",
      }),
    );
    try {
      const owner = await pact.addOwner();
      for (let n = 0; n < 8; n++) await pact.addOwner();
      const ownerIntent = broad ? intent : "Develop Hall II; build its Farm II and Barracks II prerequisites first.";
      await pact.pool.query("UPDATE kingdoms SET ambition=$2 WHERE id=$1", [owner.kingdomId, ownerIntent]);
      const allowed = broad
        ? [
            "world.read",
            "inbox.read",
            "message.send.contact",
            "contact.request",
            "building.queue",
            "training.queue",
            "supply.sign",
            "supply.break",
            "garrison.sign",
            "garrison.break",
            "garrison.seize",
            "scout.start",
            "raid.commit",
            "transfer",
          ]
        : ["world.read", "building.queue", "contact.request", "message.send.contact"];
      await pact.pool.query("UPDATE kingdom_mandates SET allowed_actions=$2,version=version+1 WHERE account_id=$1", [
        owner.accountId,
        allowed,
      ]);
      const seed = await pact.game(owner.token);
      await seed.open();
      if (queued)
        expect(
          (await seed.submit(randomUUID(), { kind: "game.building.queue", building: "hall", targetLevel: 2, slot: 1 }))
            .code,
        ).toBe("COMMITTED");
      const full = await seed.tools();
      expect(full).toHaveLength(42);
      const readNames = full.filter(pactAdapter.isRead).map((t) => t.name);
      expect(readNames).toHaveLength(29);
      await seed.close();
      const group = await r.store.create({
        name: "Synthetic runtime packing",
        count: 1,
        intervalMinutes: 15,
        seed: "fixture",
        strategies: ["guardian"],
      });
      await r.tasks.enroll(group.id, { id: "reactive-cognition", version: "1" }, false);
      await r.store.configure(group.id, {
        model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b", thinking: false },
        budget: {
          mode: "finite",
          callLimit: 6,
          tokenLimit: 240000,
          deadlineAt: new Date(Date.now() + 120000).toISOString(),
          perCallTokenLimit: 40000,
          maxOutputTokens: 1536,
          inputByteLimit,
          maxCallsPerTurn: 3,
          maxActionsPerTurn: 1,
          concurrency: 1,
        },
      });
      await r.store.consent(group.id, true);
      const actor = (await r.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [group.id])).rows[0].id;
      await r.pool.query("UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready' WHERE id=$1", [
        actor,
        owner.accountId,
        owner.kingdomId,
      ]);
      const grant = await pact.authorize(owner.accountId);
      await r.broker.save(
        actor,
        {
          accessToken: grant.accessToken,
          refreshToken: grant.refreshToken,
          clientId: grant.clientId,
          expiresAt: Date.now() + 600000,
        },
        "ready",
      );
      const enrollment = r.environments.resolve(r.settings.environment).enrollment;
      if (!enrollment) throw Error("SYNTHETIC_ENROLLMENT_REQUIRED");
      const binding = await enrollment.attachExisting(actor);
      await r.store.setState(group.id, "running", true);
      await r.tasks.upsertFromEvent(
        binding,
        {
          id: randomUUID(),
          type: "scheduled",
          sourceRef: "synthetic-schedule",
          observedAt: r.store.now().toISOString(),
          environmentTime: { clockId: "utc", value: r.store.now().toISOString() },
          metadata: {},
        },
        "scheduled",
      );
      const claim = await r.tasks.claim("synthetic-runtime", r.store.now());
      expect(claim).not.toBeNull();
      if (!claim) throw Error("SYNTHETIC_CLAIM_REQUIRED");
      if (!fits) {
        await expect(r.host.run(claim)).rejects.toMatchObject({ code: "CONTEXT_LIMIT" });
        expect(requests).toBe(0);
        expect(admitted).toHaveLength(0);
        expect((await r.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
        expect((await r.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
        return;
      }
      try {
        await r.host.run(claim);
      } catch (error) {
        throw providerErrors[0] ?? error;
      }
      expect(requests).toBe(1);
      const expanded = object(expandFactTables(packets[0])),
        continuity = object(expanded.continuity);
      expect(continuity.evidence).not.toEqual([]);
      expect(object(continuity.self).capabilities).toEqual(full.slice(0, 40).map((t) => t.name));
      expect((expanded.catalog as Data[]).map((t) => t.name)).toEqual(readNames);
      const delivered = object(object(expanded.observation).payload);
      const env = delivered.environment ? object(delivered.environment) : compactFacts(delivered);
      expect(env.ambition).toBe(ownerIntent);
      expect(env.authority).toBeDefined();
      expect(env.goalFeasibility).toBeDefined();
      expect(env.buildings).not.toEqual([]);
      expect(env.builders).not.toEqual([]);
      expect(object(env.socialAttention).records).toBeDefined();
      expect(object(env.publicDiscovery).players).not.toEqual([]);
      expect(
        (await r.pool.query("SELECT status,input_tokens::int,output_tokens::int FROM compute_ledger")).rows,
      ).toEqual([{ status: "reported", input_tokens: 12, output_tokens: 5 }]);
      expect(
        (await r.pool.query("SELECT state,code,calls,actions FROM turns WHERE id=$1", [claim.turn.id])).rows[0],
      ).toMatchObject({ state: "finished", code: "WAIT", calls: 1, actions: 0 });
    } finally {
      spy.mockRestore();
      await r.host.drain();
      await r.pool.end();
      await db.pool.end();
      await provider.close();
      await pact.close();
    }
  },
  30000,
);
