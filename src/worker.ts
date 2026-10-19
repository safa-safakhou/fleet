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
  recoveryInFlight: Promise<unknown> | undefined,
  intakeInFlight: Promise<unknown> | undefined;
const platformInFlight = new Set<Promise<unknown>>();
let preferPlatform = true;
r.pool.on("error", () => console.error("fleet database connection unavailable"));
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    stop = true;
    r.engine.stop();
    void r.host.stop().catch((error) => console.error("fleet stop deferred", safeCode(error)));
  });
try {
  while (!stop) {
    try {
      await r.store.heartbeat(worker, r.settings.liveAllowed);
      await r.store.recoverExpired();
      await r.tasks.recover();
      const admissionOpen = r.settings.liveAllowed && r.runWindow.isOpen();
      const running =
        admissionOpen && (await r.pool.query("SELECT 1 FROM cohorts WHERE state='running' LIMIT 1")).rowCount !== 0;
      awake.update(running);
      const disk = await enoughDisk(r.settings.statePath, r.settings.minFreeBytes);
      await r.pool.query(
        `INSERT INTO worker_health(id,updated_at,dispatch_ready,reason) VALUES($1,now(),$2,$3)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,dispatch_ready=excluded.dispatch_ready,reason=excluded.reason`,
        [
          worker,
          admissionOpen && disk,
          disk
            ? admissionOpen
              ? "READY"
              : r.settings.liveAllowed
                ? "RUN_WINDOW_CLOSED"
                : "LIVE_DISABLED"
            : "LOW_DISK",
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
              const isPlatform = (
                await r.pool.query("SELECT 1 FROM platform_commands WHERE turn_id=$1", [task.turn_id])
              ).rowCount;
              const receipt = isPlatform
                ? await r.commands.reconcile(task.turn_id)
                : await r.engine.reconcile(task.turn_id);
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
      const platformEnabled =
        admissionOpen &&
        Boolean(
          (
            await r.pool.query(
              "SELECT 1 FROM cohort_engine_profiles p JOIN cohorts c ON c.id=p.cohort_id WHERE c.state='running' LIMIT 1",
            )
          ).rowCount,
        );
      if (platformEnabled && disk && !intakeInFlight) {
        intakeInFlight = r.intake
          .tick((binding, code) => console.error("fleet events deferred", binding, code))
          .catch((error) => console.error("fleet events deferred", safeCode(error)))
          .finally(() => {
            intakeInFlight = undefined;
          });
      }
      if (platformEnabled && disk) {
        const progress = async () => {
          await r.pool.query("UPDATE worker_health SET last_progress_at=now() WHERE id=$1", [worker]);
        };
        const legacy = async () => {
          if (inFlight || platformInFlight.size >= r.settings.maxConcurrency) return;
          const claim = await r.store.claim(worker, r.settings.maxConcurrency);
          if (!claim) return;
          inFlight = r.engine
            .run(claim)
            .then(progress)
            .catch((error) => console.error("fleet turn deferred", safeCode(error)))
            .finally(() => {
              inFlight = undefined;
            });
        };
        const platform = async () => {
          if (platformInFlight.size + Number(Boolean(inFlight)) >= r.settings.maxConcurrency) return false;
          const claim = await r.tasks.claim(worker, r.store.now());
          if (!claim) return false;
          const promise = r.host
            .run(claim)
            .then(progress)
            .catch((error) => console.error("fleet task deferred", safeCode(error)))
            .finally(() => {
              platformInFlight.delete(promise);
            });
          platformInFlight.add(promise);
          return true;
        };
        if (preferPlatform) {
          await platform();
          await legacy();
        } else {
          await legacy();
          await platform();
        }
        preferPlatform = !preferPlatform;
        while (platformInFlight.size + Number(Boolean(inFlight)) < r.settings.maxConcurrency && (await platform())) {}
      } else {
        if (admissionOpen && disk && !inFlight) {
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
      }
      if (Date.now() - lastPrune > 3600000) {
        await r.pool.query("DELETE FROM environment_event_receipts WHERE received_at<$1", [
          new Date(r.store.now().getTime() - 30 * 86400000),
        ]);
        await r.pool.query("DELETE FROM environment_event_gaps WHERE observed_at<$1", [
          new Date(r.store.now().getTime() - 30 * 86400000),
        ]);
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
  await r.host.stop();
  await Promise.allSettled([inFlight, recoveryInFlight, intakeInFlight, ...platformInFlight]);
  await r.host.drain();
  await r.pool.end();
}
