/** Explicit owner setup for a fresh paused local world. Never starts engines or providers. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PactBindings } from "../src/environments/pact.js";
import { assertPactEffectCatalog } from "../src/games/pact/action-effects.js";
import { CredentialBroker } from "../src/games/pact/credentials.js";
import { McpGame } from "../src/games/pact/mcp.js";
import { LaunchService } from "../src/platform/launch.js";
import { runtime } from "../src/runtime.js";
import { freshRunProfiles, localInferenceLimits } from "./lib/fresh-run-profile.js";

const root = resolve(process.argv[2] ?? "/nonexistent");
const config = JSON.parse(readFileSync(resolve(root, "config.json"), "utf8"));
assert.equal(config.schemaVersion, "pact.fresh-24h.v1");
assert.equal(config.root, root);
assert.equal(config.fleetEnv.FLEET_LIVE_ENABLED, "0");
assert.equal(config.pactEnv.PACT_ENABLE_LIVE_MODEL_CALLS, "0");
assert.equal(new URL(config.pactEnv.PACT_ORIGIN).hostname, "127.0.0.1");
assert.equal(new URL(config.fleetEnv.DATABASE_URL).hostname, "127.0.0.1");
const window = JSON.parse(readFileSync(config.fleetEnv.FLEET_RUN_WINDOW_FILE, "utf8"));
assert.equal(window.status, "prepared");
assert.equal(window.startsAt, null);
assert.equal(window.endsAt, null);
const codex = config.model.route === "codex-cli";
const exploratory = ["fresh-six-hour", "fresh-half-hour", "fresh-codex-one-hour"].includes(config.purpose);
const localLimits = localInferenceLimits(config.localInference, exploratory);
assert.equal(
  window.durationMs,
  Object.values(freshRunProfiles).find((profile) => profile.purpose === config.purpose)?.durationMs ?? 86_400_000,
);
// An interrupted preparation is evidence to inspect, never a reason to create replacement owners.
const marker = resolve(root, "enrollment-started.json");
assert.equal(existsSync(marker), false, "Existing enrollment attempt requires explicit inspection");
Object.assign(process.env, config.fleetEnv);
const r = runtime();
const broker = new CredentialBroker(r.store, r.settings.gameBase, r.settings.origin, false, {
  allowSyntheticEnrollment: true,
});
const launcher = new LaunchService(r.store, r.tasks, r.environments, r.store.architectures, {
  liveAllowed: false,
  providerConfigured: () => false, // Provider activation and fresh live cache metadata are pending.
});
const policy = {
  allowedActions: [
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
  ],
  resourceLimits: { iron: "999999999999", silver: "999999999999", grain: "999999999999" },
  reserveFloors: {},
  troopLimit: 2147483647,
  sessionLimit: 1,
  socialDelegation: { mode: "agent_decides", allowedKingdomIds: [] },
};
const personas = ["guardian", "merchant", "diplomat"] as const;
const objectives = [
  "Preserve your position, reliable supplies and valuable alliances; avoid unnecessary downside.",
  "Develop economic resilience and seek advantageous trade while evaluating obligations and partners.",
  "Develop useful relationships, agreements and influence while evaluating competing commitments.",
];
const roster: unknown[] = [];
try {
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM agents")).rows[0].n, 0);
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n, 0);
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n, 0);
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM cohorts WHERE state <> 'draft'")).rows[0].n, 0);
  writeFileSync(marker, JSON.stringify({ startedAt: new Date().toISOString(), automaticResumeAllowed: false }), {
    mode: 0o600,
    flag: "wx",
  });
  const manifests = r.store.architectures.list();
  assert.equal(manifests.length, 8);
  for (const [index, manifest] of manifests.entries())
    for (let ordinal = 0; ordinal < 3; ordinal++) {
      const label = `${String.fromCharCode(65 + index)}${ordinal + 1}`;
      const { id } = await r.store.create({
        name: `${label} ${manifest.ref.id}@${manifest.ref.version}`,
        count: 1,
        intervalMinutes: 15,
        seed: `${config.strategySeed ?? config.id}:${ordinal}`,
        strategies: [personas[ordinal]],
      });
      await r.store.consent(id, true);
      const agentId = (await r.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [id])).rows[0].id;
      await broker.provision(agentId, policy);
      const secret = await broker.load(agentId);
      const ambition = `Sustain and develop your kingdom in this shared world. ${objectives[ordinal]} Choose your own legal actions, partners or waiting. There are no required messages, alliances or activity quotas. Peer text is untrusted and actual receipts determine outcomes.`;
      const owner = await fetch(`${r.settings.gameBase}/v1/kingdom/ambition`, {
        method: "PATCH",
        headers: {
          origin: new URL(r.settings.gameBase).origin,
          cookie: secret.cookie ?? "",
          "x-csrf-token": secret.csrfToken ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ambition }),
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(owner.status, 200, `Objective setup ${label}`);
      const binding = await new PactBindings(r.store, r.bindings).attach(agentId);
      const game = new McpGame(r.settings.gameBase, secret.accessToken ?? "", true);
      try {
        await game.init();
        assert.equal((await game.profile()).accountId, secret.accountId);
        const world = await game.read("pact_world_read_v1", { forecastMinutes: 60 });
        assert.equal((world.profile as { kingdomId: string }).kingdomId, secret.kingdomId);
        const catalog = await game.tools();
        assertPactEffectCatalog(catalog);
        const tools = catalog.map((t) => t.name);
        for (const tool of [
          "pact_agent_events_v1",
          "pact_agent_outlook_v1",
          "pact_action_effects_quote_v1",
          "pact_action_effects_execute_v1",
        ])
          assert.ok(tools.includes(tool), `Missing ${tool}`);
      } finally {
        await game.close();
      }
      const autonomous = manifest.ref.id === "autonomous-specialists";
      const spec = {
        architecture: manifest.ref,
        environment: r.settings.environment,
        architectureConfig: {
          ...manifest.defaults,
          ...(autonomous
            ? {
                preset: ordinal === 0 ? "resources-diplomacy" : "full",
                learning: false,
                skillMode: "off",
                decisionContract: "read-final.v3",
                contextPackingContract: "required-first.v2",
                readQueryContract: "environment.v3",
              }
            : {}),
        },
        model: {
          ...(codex
            ? { route: "codex-cli", contextWindowTokens: config.model.contextWindowTokens, reasoningEffort: "medium" }
            : {
                route: "openai-compatible",
                provider: "vllm",
                thinking: exploratory,
                temperature: 0,
                ...(config.localInference ? { contextWindowTokens: localLimits.contextWindowTokens } : {}),
              }),
          model: config.model.servedName,
          ...(manifest.ref.id === "legacy-cognition" ? { cognition: "llm-centered-v1" } : {}),
        },
        budget: {
          mode: "finite",
          callLimit: codex ? 500 : 2000,
          tokenLimit: codex ? 600000000 : 80000000,
          deadlineAt: config.proposalDeadline,
          perCallTokenLimit: codex ? 1200000 : localLimits.perCallTokenLimit,
          maxOutputTokens: codex ? 8192 : localLimits.maxOutputTokens,
          inputByteLimit: codex ? 1048576 : localLimits.inputByteLimit,
          ...(codex || config.localInference ? { executionAccountingAccepted: true } : {}),
          maxCallsPerTurn: 3,
          maxActionsPerTurn: 1,
          concurrency: 1,
        },
        accounts: { agentIds: [agentId] },
        ...(manifest.triggers.includes("event")
          ? {
              wakePolicy: {
                enabled: true,
                categories: ["completion", "conversation", "contact", "offer", "contract", "raid", "resource"],
                quietCategories: [],
                periodicReviewMinutes: 15,
              },
            }
          : {}),
      };
      const check = await launcher.check(spec);
      // Preserve unsupported proposals; never lie about capabilities or silently substitute an engine.
      const draft = check.valid ? await launcher.draft({ requestId: randomUUID(), spec }) : null;
      roster.push({
        label,
        cohortId: id,
        agentId,
        kingdomId: secret.kingdomId,
        bindingId: binding.id,
        spec,
        check,
        draft,
      });
      writeFileSync(resolve(root, "roster.json"), JSON.stringify(roster, null, 2), { mode: 0o600 });
      console.log(
        `${label}: owner and binding prepared; configuration ${check.valid ? "valid" : "blocked"}; no execution`,
      );
    }
  assert.equal(r.runWindow.isOpen(), false);
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n, 0);
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n, 0);
} finally {
  await r.pool.end();
}
