import { randomUUID } from "node:crypto";
import { AwakeGuard } from "./awake.js";
import { Communications } from "./communications.js";
import { enoughDisk } from "./engine.js";
import { runtime } from "./runtime.js";

const r = runtime(),
  worker = `worker-${randomUUID()}`,
  awake = new AwakeGuard(r.settings.keepAwake);
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
    const running =
      r.settings.liveAllowed &&
      (await r.pool.query("SELECT 1 FROM cohorts WHERE state='running' LIMIT 1")).rowCount !== 0;
    awake.update(running);
    await r.store.heartbeat(worker, r.settings.liveAllowed);
    if (r.settings.liveAllowed && (await enoughDisk(r.settings.statePath, r.settings.minFreeBytes)))
      await r.engine.tick(worker, r.settings.maxConcurrency);
    if (Date.now() - lastPrune > 3600000) {
      await new Communications(r.store).prune();
      await r.pool.query("DELETE FROM operator_sessions WHERE expires_at<now()");
      await r.pool.query("DELETE FROM oauth_attempts WHERE expires_at<now()");
      await r.pool.query(
        "UPDATE agents SET decision_feedback_cipher=NULL,decision_feedback_at=NULL WHERE decision_feedback_at<now()-interval '30 days'",
      );
      lastPrune = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
} finally {
  awake.close();
  await r.pool.end();
}
