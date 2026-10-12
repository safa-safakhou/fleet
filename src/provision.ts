import { readFile } from "node:fs/promises";
import { z } from "zod";
import { runtime } from "./runtime.js";

const [id, path] = process.argv.slice(2);
z.uuid().parse(id);
if (!path) throw new Error("EXPLICIT_MANDATE_FILE_REQUIRED");
const mandate: unknown = JSON.parse(await readFile(path, "utf8"));
const r = runtime();
try {
  if (!r.settings.liveAllowed) throw new Error("LIVE_EXECUTION_DISABLED");
  const cohort = await r.store.cohort(id);
  if (!["draft", "paused"].includes(cohort.state)) throw new Error("COHORT_NOT_EDITABLE");
  const agents = (
    await r.pool.query("SELECT id,account_id,credential_state FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id])
  ).rows;
  for (const agent of agents) {
    if (agent.credential_state === "ready") continue;
    const secret = await r.broker.load(agent.id);
    if (agent.account_id && !secret.synthetic) throw new Error("PERSONAL_ACCOUNT_REQUIRES_OAUTH_RECONNECT");
    await r.broker.provision(agent.id, mandate);
    console.log("One synthetic agent account connected. Fleet remains inactive.");
  }
} finally {
  await r.pool.end();
}
