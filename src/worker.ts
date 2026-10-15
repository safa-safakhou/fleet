import { randomUUID } from "node:crypto";
import { AwakeGuard } from "./awake.js";
import { Cognition } from "./cognition.js";
import { Communications } from "./communications.js";
import { Continuation } from "./continuation.js";
import { safeCode } from "./domain.js";
import { enoughDisk } from "./engine.js";
import { runtime } from "./runtime.js";

const r = runtime(),
  worker = `worker-${randomUUID()}`,
  awake = new AwakeGuard(r.settings.keepAwake);
let stop = false,
  lastPrune = 0,
  failures = 0,
  inFlight: Promise<unknown> | undefined,
  recoveryInFlight: Promise<unknown> | undefined;
r.pool.on("error", () => console.error("fleet database connection unavailable"));
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    stop = true;
    r.engine.stop();
  });
try {
  while (!stop) {
    try {
      await r.store.heartbeat(worker, r.settings.liveAllowed);
      await r.store.recoverExpired();
      const running =
        r.settings.liveAllowed &&
        (await r.pool.query("SELECT 1 FROM cohorts WHERE state='running' LIMIT 1")).rowCount !== 0;
      awake.update(running);
      const disk = await enoughDisk(r.settings.statePath, r.settings.minFreeBytes);
      await r.pool.query(
        `INSERT INTO worker_health(id,updated_at,dispatch_ready,reason) VALUES($1,now(),$2,$3)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,dispatch_ready=excluded.dispatch_ready,reason=excluded.reason`,
        [
          worker,
          r.settings.liveAllowed && disk,
          disk ? (r.settings.liveAllowed ? "READY" : "LIVE_DISABLED") : "LOW_DISK",
        ],
      );
      // Recovery is independent of admission. Never submit a replacement game command.
      if (r.settings.liveAllowed && !recoveryInFlight) {
        recoveryInFlight = (async () => {
          await r.broker.recover();
          const task = await r.store.recoveryCandidate(worker);
          if (task) {
            let code = "RECEIPT_PENDING";
            try {
              const receipt = await r.engine.reconcile(task.turn_id);
              code = String(receipt.code);
            } catch (error) {
              code = safeCode(error);
            }
            await r.store.deferRecovery(task.turn_id, worker, code);
          }
        })()
          .catch((error) => console.error("fleet recovery deferred", safeCode(error)))
          .finally(() => {
            recoveryInFlight = undefined;
          });
      }
      if (r.settings.liveAllowed && disk && !inFlight) {
        inFlight = r.engine
          .tick(worker, r.settings.maxConcurrency)
          .then(async (claim) => {
            if (claim) await r.pool.query("UPDATE worker_health SET last_progress_at=now() WHERE id=$1", [worker]);
          })
          .catch((error) => console.error("fleet turn deferred", safeCode(error)))
          .finally(() => {
            inFlight = undefined;
          });
      }
      if (Date.now() - lastPrune > 3600000) {
        await new Communications(r.store).prune();
        await new Cognition(r.store).prune();
        await new Continuation(r.store).prune();
        await r.pool.query("DELETE FROM operator_sessions WHERE expires_at<now()");
        await r.pool.query("DELETE FROM oauth_attempts WHERE expires_at<now()");
        await r.pool.query("DELETE FROM decision_choices WHERE created_at<now()-interval '30 days'");
        await r.pool.query(
          "UPDATE agents SET decision_feedback_cipher=NULL,decision_feedback_at=NULL WHERE decision_feedback_at<now()-interval '30 days'",
        );
        lastPrune = Date.now();
      }
      failures = 0;
    } catch (error) {
      failures++;
      console.error("fleet supervision deferred", safeCode(error));
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(60000, 2000 * 2 ** Math.min(failures, 5))));
  }
} finally {
  awake.close();
  await Promise.allSettled([inFlight, recoveryInFlight]);
  await r.pool.end();
}
