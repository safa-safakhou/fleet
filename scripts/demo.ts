import { randomUUID } from "node:crypto";
import { config } from "../src/config.js";
import { connect, migrate } from "../src/db.js";
import { Communications } from "../src/games/pact/communications.js";
import { Store } from "../src/store.js";
import { Vault } from "../src/vault.js";

const settings = config();
if (process.env.FLEET_DEMO !== "1" || settings.liveAllowed || new URL(settings.databaseUrl).pathname !== "/fleet_demo")
  throw new Error("ISOLATED_DEMO_DATABASE_REQUIRED");
const pool = connect(settings.databaseUrl);
try {
  await migrate(pool);
  if ((await pool.query("SELECT 1 FROM cohorts LIMIT 1")).rowCount) throw new Error("DEMO_ALREADY_SEEDED");
  const store = new Store(pool, new Vault(settings.vaultKey));
  const { id } = await store.create({
    name: "Fictional society · preview",
    count: 5,
    intervalMinutes: 15,
    seed: "demo-only",
    strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
  });
  await store.consent(id, true);
  const agents = (await store.publicState()).agents;
  for (const agent of agents) {
    await pool.query("UPDATE agents SET account_id=$2,kingdom_id=$3,state='paused' WHERE id=$1", [
      agent.id,
      randomUUID(),
      randomUUID(),
    ]);
  }
  const updated = (await store.publicState()).agents;
  const comms = new Communications(store);
  for (let n = 0; n < 3; n++) {
    const a = updated[n],
      peer = updated[n + 1].kingdom_id;
    await comms.ingest(a.id, String(peer), "pact_council_thread_v1", {
      messages: [
        {
          id: randomUUID(),
          senderKingdomId: a.kingdom_id,
          body: "Fictional preview: I can supply grain for a short trial. Which terms work for you?",
          sentGameTimeMs: "123000",
        },
        {
          id: randomUUID(),
          senderKingdomId: peer,
          body: "Fictional preview: Five units per hour is useful. I want the delivery obligation written into the agreement before signing.",
          sentGameTimeMs: "124000",
        },
        {
          id: randomUUID(),
          senderKingdomId: a.kingdom_id,
          body: "Fictional preview: The revised terms reduce the trial to two hours and keep our reserves intact.",
          sentGameTimeMs: "125000",
        },
      ],
    });
    await comms.ingest(a.id, String(peer), "pact_conversation_history_v2", {
      offers: [
        {
          id: randomUUID(),
          kind: "supply",
          version: 2,
          status: "signed",
          terms: { resource: "grain", ratePerHour: 5, durationHours: 2 },
          versions: [
            { version: 1, terms: { resource: "grain", ratePerHour: 8, durationHours: 4 } },
            { version: 2, terms: { resource: "grain", ratePerHour: 5, durationHours: 2 } },
          ],
          signatures: [{ kingdomId: a.kingdom_id }, { kingdomId: peer }],
          contract: { status: "active" },
          deliveries: { completed: 1, remaining: 1 },
        },
      ],
    });
  }
  console.log("Fictional console preview seeded. No game accounts or model calls were made.");
} finally {
  await pool.end();
}
