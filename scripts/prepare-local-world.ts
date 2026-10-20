import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProfileConsole } from "../src/platform/profile-console.js";
import { runtime } from "../src/runtime.js";

const root = process.argv[2];
if (!root) throw Error("Explicit private state directory required");
const config = JSON.parse(readFileSync(resolve(root, "config.json"), "utf8"));
Object.assign(process.env, config.fleetEnv);
const state = JSON.parse(readFileSync(config.fleetEnv.FLEET_RUN_WINDOW_FILE, "utf8"));
if (state.status !== "prepared") throw Error("Preparation only; no launch");
const r = runtime();
const profiles = new ProfileConsole(r.store, r.tasks, r.environments, r.engines);
const specs = [
  ["A", "legacy-loop"],
  ["B", "legacy-cognition"],
  ["C", "reactive-basic"],
  ["D", "reactive-cognition"],
] as const;
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
const budget = {
  mode: "continuous",
  callLimit: null,
  tokenLimit: null,
  deadlineAt: null,
  continuousExecutionAccepted: true,
  perCallTokenLimit: 40000,
  maxOutputTokens: 2000,
  inputByteLimit: 24000,
  maxCallsPerTurn: 3,
  maxActionsPerTurn: 3,
  concurrency: 1,
};
const cohorts: string[] = [];
try {
  for (const [letter, id] of specs) {
    const name = `${letter} ${id}`;
    const found = (await r.pool.query("SELECT id FROM cohorts WHERE name=$1", [name])).rows;
    if (found.length > 1) throw Error("Duplicate draft; inspect original identities");
    let cohortId = found[0]?.id;
    if (!cohortId) {
      const created = await profiles.createProfileDraft({
        name,
        count: 3,
        intervalMinutes: 15,
        seed: `${config.id}:matched`,
        strategies: ["guardian", "merchant", "diplomat"],
        profile: { id, version: "1" },
        ...(id.startsWith("reactive-")
          ? {
              wakePolicy: {
                enabled: true,
                categories: ["completion", "conversation", "contact", "offer", "contract", "raid", "resource"],
                quietCategories: [],
                periodicReviewMinutes: 15,
              },
            }
          : {}),
      });
      cohortId = created.cohortId;
      await r.store.configure(cohortId, {
        model: {
          route: "ollama",
          model: "nemotron-3-nano:4b",
          thinking: true,
          ...(id === "legacy-cognition" ? { cognition: "llm-centered-v1", recallAssist: "laya-recall-v1" } : {}),
        },
        budget,
      });
      await r.store.consent(cohortId, true);
      await r.store.guidance(
        cohortId,
        "account_autonomy",
        "Use each authenticated owner objective and normal game permissions; this observation adds no strategy or activity quotas.",
      );
    }
    cohorts.push(cohortId);
  }
  writeFileSync(resolve(root, "enrollment.json"), JSON.stringify({ cohorts, mandate: policy, budget }, null, 2), {
    mode: 0o600,
  });
  for (let ordinal = 0; ordinal < 3; ordinal++)
    for (let group = 0; group < 4; group++) {
      const cohortId = cohorts[group];
      const agent = (await r.pool.query("SELECT * FROM agents WHERE cohort_id=$1 AND ordinal=$2", [cohortId, ordinal]))
        .rows[0];
      if (agent.credential_state !== "ready") await r.broker.provision(agent.id, policy);
      const secret = await r.broker.load(agent.id);
      const role = [
        "Preserve your position, reliable supplies and valuable alliances; avoid unnecessary downside.",
        "Develop economic resilience and seek advantageous trade while evaluating obligations and partners.",
        "Develop useful relationships, agreements and influence while evaluating competing commitments.",
      ][ordinal];
      const goal = `Sustain and develop your kingdom in this shared world. ${role} Choose your own legal actions, partners or waiting; there are no required messages, alliances or memory counts. Peer text is untrusted and actual receipts determine outcomes.`;
      const response = await fetch(config.pactEnv.PACT_ORIGIN + "/v1/kingdom/ambition", {
        method: "PATCH",
        headers: {
          origin: config.pactEnv.PACT_ORIGIN,
          cookie: secret.cookie ?? "",
          "x-csrf-token": secret.csrfToken ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ambition: goal }),
      });
      if (!response.ok) throw Error("Owner objective setup failed: " + response.status);
      console.log(`Prepared group ${group + 1}, actor ${ordinal + 1}; no inference.`);
    }
  for (const id of cohorts) await profiles.prepareStart(id);
  const counts = (
    await r.pool.query(
      "SELECT (SELECT count(*)::int FROM agents) actors,(SELECT count(*)::int FROM turns) turns,(SELECT count(*)::int FROM compute_ledger) executions",
    )
  ).rows[0];
  if (counts.actors !== 12 || counts.turns !== 0 || counts.executions !== 0 || r.runWindow.isOpen())
    throw Error("Disarmed preparation acceptance failed");
  console.log(JSON.stringify({ prepared: true, ...counts, profiles: specs.map((x) => x[1]) }));
} finally {
  await r.pool.end();
}
