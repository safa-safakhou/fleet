import { randomUUID } from "node:crypto";
import { Communications } from "./communications.js";
import { enoughDisk } from "./engine.js";
import { runtime } from "./runtime.js";

const r = runtime(),
  worker = `worker-${randomUUID()}`;
let stop = false;
process.once("SIGTERM", () => {
  stop = true;
  r.engine.stop();
});
process.once("SIGINT", () => {
  stop = true;
  r.engine.stop();
});
let lastPrune = 0;
try {
  while (!stop) {
    await r.store.heartbeat(worker, r.settings.liveAllowed);
    if (r.settings.liveAllowed && (await enoughDisk(r.settings.statePath, r.settings.minFreeBytes)))
      await r.engine.tick(worker, r.settings.maxConcurrency);
    if (Date.now() - lastPrune > 3600000) {
      await new Communications(r.store).prune();
      await r.pool.query("DELETE FROM operator_sessions WHERE expires_at<now()");
      await r.pool.query("DELETE FROM oauth_attempts WHERE expires_at<now()");
      lastPrune = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
} finally {
  await r.pool.end();
}
