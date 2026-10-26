/** Finite, labelled test inputs through real PACT APIs, separate from measured model choices. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { composeRuntime } from "../src/app/composition.js";
import { config } from "../src/config.js";
import { type GamePort, object } from "../src/domain.js";
import { loadOwnedWorld, writePrivateJson } from "./lib/owned-local-world.js";

const c = await loadOwnedWorld(process.argv[2]),
  file = (name: string) => resolve(c.root, name);
assert.equal(c.purpose, "real-workflow-canary");
const window = JSON.parse(await readFile(file("window.json"), "utf8"));
assert.equal(window.status, "armed");
assert.equal(window.durationMs, 900000);
// Use the existing credential lifecycle, including safe refresh after long offline checks.
// Current canary authorization applies only to this owned process, not installed services.
const r = composeRuntime(config({ ...c.fleetEnv, FLEET_LIVE_ENABLED: "1" }));
const entries: unknown[] = [];
const roster = JSON.parse(await readFile(file("roster.json"), "utf8"));
const started = Date.now();
await writeFile(file("seed-started.json"), JSON.stringify({ startedAt: started, automaticReplayAllowed: false }), {
  mode: 0o600,
  flag: "wx",
});
async function admission() {
  if (Date.now() >= window.endsAt || Date.now() - started > 45000) throw Error("SEED_WINDOW_EXPIRED");
  try {
    await access(file("window.json.closed"));
    throw Error("SEED_ADMISSION_CLOSED");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
async function command(game: GamePort, action: Record<string, unknown>) {
  await admission();
  const commandId = randomUUID(),
    entry = { commandId, action, status: "prepared", receipt: null as unknown };
  entries.push(entry);
  await writePrivateJson(file("evidence/scripted-seed-commands.json"), entries);
  const receipt = await game.submit(commandId, action);
  entry.receipt = receipt;
  entry.status = String(receipt.code);
  await writePrivateJson(file("evidence/scripted-seed-commands.json"), entries);
  assert.ok(
    ["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code)),
    "Seed action refused; no automatic replay",
  );
}
try {
  assert.equal((await r.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n, 0);
  assert.equal(roster.length, 24);
  for (let i = 0; i < roster.length; i += 2) {
    const a = roster[i],
      b = roster[i + 1],
      opened: GamePort[] = [];
    try {
      const ga = await r.broker.game(a.agentId);
      opened.push(ga);
      const gb = await r.broker.game(b.agentId);
      opened.push(gb);
      const sa = await r.broker.load(a.agentId),
        sb = await r.broker.load(b.agentId);
      assert.equal((await ga.profile()).accountId, sa.accountId);
      assert.equal((await gb.profile()).accountId, sb.accountId);
      await admission();
      await ga.open();
      await gb.open();
      await command(ga, {
        kind: "game.contact.request",
        recipientKingdomId: b.kingdomId,
        note: "Bounded real-workflow canary contact; no commitment or promised delivery.",
      });
      const guide = await gb.read("pact_agent_guide_v1", {});
      const request = (Array.isArray(guide.contactRequests) ? guide.contactRequests.map(object) : []).find(
        (v) => v.kingdomId === a.kingdomId && v.direction === "incoming",
      );
      assert.equal(typeof request?.id, "string");
      await command(gb, { kind: "game.contact.answer", requestId: request?.id, accept: true });
      for (const [actor, secret, game, peer] of [
        [a, sa, ga, b],
        [b, sb, gb, a],
      ] as const) {
        const ambition =
          "During this bounded canary, inspect any current canary peer request and send one factual reply to its contact with the exact PACT game time shown by your own current authorized world view. Do not promise delivery or claim that an admitted construction job has completed. Preserve existing jobs, do not raid or make contracts, and do not change owner authority. After answering, wait for a real new request or useful current work; do not send duplicate replies.";
        const response = await fetch(`${c.pactEnv.PACT_ORIGIN}/v1/kingdom/ambition`, {
          method: "PATCH",
          headers: {
            origin: c.pactEnv.PACT_ORIGIN,
            cookie: secret.cookie ?? "",
            "x-csrf-token": secret.csrfToken ?? "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ ambition }),
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 200);
        await command(game, {
          kind: "game.message.send",
          recipientKingdomId: peer.kingdomId,
          body: "Canary request: please reply with the PACT game time from your own current authorized world read. Report an observed snapshot only; make no promise of future delivery or completion.",
        });
        await writePrivateJson(file(`evidence/seed-objective-${actor.label}.json`), {
          kingdomId: actor.kingdomId,
          ambition,
        });
      }
    } finally {
      const closed = await Promise.allSettled(opened.map((game) => game.close()));
      assert.ok(
        closed.every((result) => result.status === "fulfilled"),
        "Seed lease close uncertain; preserve original identities",
      );
    }
  }
  assert.equal(entries.length, 48);
  console.log(
    JSON.stringify({
      scriptedNativeSeedCommands: entries.length,
      modelCalls: 0,
      goal: "read authorized game time and send one factual peer reply",
      automaticReplayAllowed: false,
    }),
  );
} finally {
  await r.pool.end();
}
