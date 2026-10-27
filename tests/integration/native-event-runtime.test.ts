import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Ajv } from "ajv";
import Fastify from "fastify";
import { expect, it } from "vitest";
import {
  type OwnedWorldConfig,
  startOwnedEventPublisher,
  stopOwnedProcess,
} from "../../scripts/lib/owned-local-world.js";
import { composeRuntime } from "../../src/app/composition.js";
import { config } from "../../src/config.js";
import { type Data, object } from "../../src/domain.js";
import { expandFactTables } from "../../src/fact-table.js";
import { nativePactWorkflow } from "../fixtures/native-pact-workflow.js";
import { fixtureSchemaBasis } from "../fixtures/pact-progress-basis.js";
import { fixture, key, testUrl } from "../helpers.js";

it.each([
  { thinking: false, maxOutputTokens: 1536 },
  { thinking: true, maxOutputTokens: 8192 },
])(
  "native publisher → authenticated feed → durable event task → v2 read correction → confirmed contact, without duplicate effects %j",
  async ({ thinking, maxOutputTokens }) => {
    const db = await fixture(),
      pact = await nativePactWorkflow({ completeCatalog: true }),
      provider = Fastify();
    const root = await mkdtemp(resolve(tmpdir(), "fleet-native-events-"));
    await mkdir(resolve(root, "logs"));
    const url = new URL(process.env.TEST_DATABASE_URL!);
    const schema = (await pact.pool.query("SELECT current_schema() s")).rows[0].s;
    expect(schema).toMatch(/^test_effects_[a-z0-9_]+$/);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const owned: OwnedWorldConfig = {
      schemaVersion: "synthetic",
      id: "synthetic",
      postgresImage: "synthetic",
      pactContainer: "synthetic",
      fleetContainer: "synthetic",
      model: {
        endpoint: "http://127.0.0.1",
        servedName: "nemotron-4b",
        repository: "synthetic",
        revision: "synthetic",
      },
      root,
      node: process.execPath,
      pactRepo: resolve(process.cwd(), "../pact"),
      fleetRepo: process.cwd(),
      pactEnv: {
        DATABASE_URL: url.href,
        PACT_ORIGIN: pact.base,
        IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
        PACT_AGENT_EVENTS_ENABLED: "1",
      },
      fleetEnv: { FLEET_PACT_EVENT_FEED_VERSION: "pact.agent-events.v1" },
    };
    let calls = 0,
      requestId = "";
    const providerErrors: Error[] = [];
    provider.setErrorHandler((e, _request, reply) => {
      providerErrors.push(e as Error);
      return reply.status(500).send({ error: "synthetic assertion" });
    });
    provider.post("/v1/chat/completions", async (request, reply) => {
      const body = object(request.body),
        messages = body.messages as { content: string }[];
      expect(body.model).toBe("nemotron-4b");
      const packet = object(expandFactTables(JSON.parse(messages[1].content)));
      calls++;
      if (calls === 2)
        expect(messages[0].content.includes("previous response did not provide a valid final answer")).toBe(true);
      const decision =
        calls === 1
          ? {
              kind: "read",
              query: { schemaId: "pact.observation.v1", query: {}, summary: "nested" },
              summary: "Malformed synthetic read",
            }
          : calls === 2
            ? { kind: "read", query: {}, summary: "Read current authorized facts" }
            : {
                kind: "action",
                schemaId: "pact.action.v1",
                payload: { kind: "game.contact.answer", requestId, accept: true },
                expectedOutcome: {
                  actionKind: "game.contact.answer",
                  basis: fixtureSchemaBasis(object(object(object(body.response_format).json_schema).schema), "action"),
                },
                summary: "Accept the observed synthetic introduction",
              };
      expect(calls).toBeLessThanOrEqual(3);
      if (calls > 1) {
        const valid = new Ajv({ strict: false, validateFormats: false }).compile(
          object(object(object(body.response_format).json_schema).schema),
        );
        expect(valid({ decision }), JSON.stringify(valid.errors)).toBe(true);
      }
      if (calls === 3) expect(JSON.stringify(packet)).toContain(requestId);
      const event = (v: unknown) => `data: ${JSON.stringify(v)}\n\n`;
      return reply.type("text/event-stream").send(
        event({
          id: "synthetic",
          choices: [{ index: 0, delta: { content: JSON.stringify({ decision }) }, finish_reason: "stop" }],
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
        FLEET_ENVIRONMENT_INSTANCE: "synthetic-native-event",
        FLEET_PACT_OUTLOOK_VERSION: "pact.agent-outlook.v1",
        FLEET_PACT_ACTION_EFFECTS_VERSION: "fleet.action-effects.v1",
        FLEET_PACT_EVENT_FEED_VERSION: "pact.agent-events.v1",
        FLEET_PACT_COORDINATION_VERSION: "pact.coordination.v1",
      }),
    );
    try {
      const recipient = await pact.addOwner(),
        sender = await pact.addOwner();
      const group = await r.store.create({
        name: "Synthetic event",
        count: 1,
        intervalMinutes: 15,
        seed: "fixture",
        strategies: ["guardian"],
      });
      await r.tasks.enroll(group.id, { id: "reactive-cognition", version: "2" }, false);
      await r.intake.enroll(group.id, {
        enabled: true,
        categories: ["contact"],
        periodicReviewMinutes: 1440,
        quietCategories: [],
      });
      await r.store.configure(group.id, {
        model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b", thinking },
        budget: {
          mode: "finite",
          callLimit: 3,
          tokenLimit: 240000,
          deadlineAt: new Date(Date.now() + 120000).toISOString(),
          perCallTokenLimit: 40000,
          maxOutputTokens,
          inputByteLimit: 64000,
          maxCallsPerTurn: 3,
          maxActionsPerTurn: 1,
          concurrency: 1,
        },
      });
      await r.store.consent(group.id, true);
      const actor = (await r.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [group.id])).rows[0].id;
      await r.pool.query("UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready' WHERE id=$1", [
        actor,
        recipient.accountId,
        recipient.kingdomId,
      ]);
      const grant = await pact.authorize(recipient.accountId);
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
      const binding = await r.environments.resolve(r.settings.environment).enrollment!.attachExisting(actor);
      await r.store.setState(group.id, "running", true);
      expect((await r.intake.poll(binding))?.inserted).toBe(0);
      expect((await r.pool.query("SELECT count(*)::int n FROM platform_tasks")).rows[0].n).toBe(0);
      const seed = await pact.game(sender.token);
      await seed.open();
      expect(
        (
          await seed.submit(randomUUID(), {
            kind: "game.contact.request",
            recipientKingdomId: recipient.kingdomId,
            note: "Synthetic event-path check",
          })
        ).code,
      ).toBe("COMMITTED");
      await seed.close();
      requestId = (
        await pact.pool.query("SELECT id FROM cold_contact_requests WHERE recipient_kingdom_id=$1", [
          recipient.kingdomId,
        ])
      ).rows[0].id;
      expect((await pact.pool.query("SELECT count(*)::int n FROM agent_events")).rows[0].n).toBe(0);
      await startOwnedEventPublisher(owned);
      await expect
        .poll(
          async () =>
            (
              await pact.pool.query("SELECT count(*)::int n FROM agent_events WHERE account_id=$1", [
                recipient.accountId,
              ])
            ).rows[0].n,
          { timeout: 10000 },
        )
        .toBe(1);
      // A second publisher batch must not republish the same outbox event.
      await new Promise((done) => setTimeout(done, 2200));
      expect(
        (await pact.pool.query("SELECT count(*)::int n FROM agent_events WHERE account_id=$1", [recipient.accountId]))
          .rows[0].n,
      ).toBe(1);
      await stopOwnedProcess(owned, "pact-events");
      const outsider = await pact.addOwner(),
        outsiderGrant = await pact.authorize(outsider.accountId);
      const foreign = await pact.game(outsiderGrant.accessToken);
      const privatePage = object(await foreign.read("pact_agent_events_v1", {}));
      expect(privatePage.events).toEqual([]);
      await foreign.close();
      expect((await r.intake.poll(binding))?.inserted).toBe(1);
      const claim = await r.tasks.claim("synthetic-event-runtime", r.store.now());
      expect(claim).not.toBeNull();
      try {
        await r.host.run(claim!);
      } catch (e) {
        throw providerErrors[0] ?? e;
      }
      expect(calls).toBe(3);
      expect(
        (await r.pool.query("SELECT state,actions,calls FROM turns WHERE id=$1", [claim!.turn.id])).rows[0],
      ).toMatchObject({ state: "finished", actions: 1, calls: 3 });
      expect((await pact.pool.query("SELECT count(*)::int n FROM social_contacts")).rows[0].n).toBe(1);
      expect(
        (await r.pool.query("SELECT count(*)::int n FROM platform_commands WHERE state='confirmed'")).rows[0].n,
      ).toBe(1);
      expect((await r.pool.query("SELECT status FROM compute_ledger")).rows.map((x) => x.status)).toEqual([
        "reported",
        "reported",
        "reported",
      ]);
      const tasks = (await r.pool.query("SELECT count(*)::int n FROM platform_tasks")).rows[0].n;
      // Re-read the same durable source page; it must not create a second task/effect.
      await r.intake.poll(binding);
      expect((await r.pool.query("SELECT count(*)::int n FROM platform_tasks")).rows[0].n).toBe(tasks);
      expect((await pact.pool.query("SELECT count(*)::int n FROM social_contacts")).rows[0].n).toBe(1);
    } finally {
      await stopOwnedProcess(owned, "pact-events", true);
      await r.host.drain();
      await r.pool.end();
      await db.pool.end();
      await provider.close();
      await pact.close();
      await rm(root, { recursive: true, force: true });
    }
  },
  30000,
);
