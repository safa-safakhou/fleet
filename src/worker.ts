import { randomUUID } from "node:crypto";
import { AwakeGuard } from "./awake.js";
import { safeCode } from "./domain.js";
import { stopFailedCanaryTurn } from "./platform/canary-stop.js";
import { enoughDisk } from "./platform/disk.js";
import { DispatchScheduler } from "./platform/scheduling.js";
import { WorkerPool } from "./platform/worker-pool.js";
import { runtime } from "./runtime.js";

const r = runtime(),
  worker = `worker-${randomUUID()}`,
  awake = new AwakeGuard(r.settings.keepAwake);
let stop = false,
  lastPrune = 0,
  failures = 0,
  recoveryInFlight: Promise<unknown> | undefined,
  intakeInFlight: Promise<unknown> | undefined;
const workers = new WorkerPool(r.settings.maxConcurrency);
const participantCancellation = new AbortController();
const scheduler = new DispatchScheduler();
const progress = async (turnId: string) => {
  if (process.env.FLEET_STOP_ON_TURN_FAILURE === "1" && r.settings.runWindowFile) {
    const turn = (await r.pool.query("SELECT state,code,unknown_usage FROM turns WHERE id=$1", [turnId])).rows[0];
    if (turn) await stopFailedCanaryTurn(r.settings.runWindowFile, turn);
  }
  await r.pool.query("UPDATE worker_health SET last_progress_at=now() WHERE id=$1", [worker]);
};
r.pool.on("error", () => console.error("fleet database connection unavailable"));
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    stop = true;
    workers.close();
    participantCancellation.abort();
    r.legacy.stop();
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
                : await r.legacy.reconcile(task.turn_id);
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
        intakeInFlight = (async () => {
          await r.participantWork.tick({
            admissionOpen: platformEnabled && disk,
            signal: participantCancellation.signal,
          });
          await r.intake.tick((binding, code) => console.error("fleet events deferred", binding, code));
        })()
          .catch((error) => console.error("fleet events deferred", safeCode(error)))
          .finally(() => {
            intakeInFlight = undefined;
          });
      }
      if (platformEnabled && disk) {
        const legacy = async () => {
          if (!r.runWindow.isOpen() || !workers.hasCapacity) return false;
          const claim = await r.legacy.claim(worker, r.settings.maxConcurrency);
          if (!claim) return false;
          void workers
            .run(async () => {
              await r.legacy.run(claim);
              await progress(claim.id);
            })
            .catch(async (error) => {
              if (process.env.FLEET_STOP_ON_TURN_FAILURE === "1") await progress(claim.id);
              console.error("fleet turn deferred", safeCode(error));
            });
          return true;
        };
        const platform = async () => {
          if (!r.runWindow.isOpen() || !workers.hasCapacity) return false;
          const claim = await r.tasks.claim(worker, r.store.now());
          if (!claim) return false;
          void workers
            .run(async () => {
              await r.host.run(claim);
              await progress(claim.turn.id);
            })
            .catch(async (error) => {
              if (process.env.FLEET_STOP_ON_TURN_FAILURE === "1") await progress(claim.turn.id);
              console.error("fleet task deferred", safeCode(error));
            });
          return true;
        };
        await scheduler.dispatch({
          legacy,
          platform,
          hasCapacity: () => r.runWindow.isOpen() && workers.hasCapacity,
        });
      } else {
        while (r.settings.liveAllowed && r.runWindow.isOpen() && disk && workers.hasCapacity) {
          const claim = await r.legacy.claim(worker, r.settings.maxConcurrency);
          if (!claim) break;
          void workers
            .run(async () => {
              await r.legacy.run(claim);
              await progress(claim.id);
            })
            .catch(async (error) => {
              if (process.env.FLEET_STOP_ON_TURN_FAILURE === "1") await progress(claim.id);
              console.error("fleet turn deferred", safeCode(error));
            });
        }
      }
      if (Date.now() - lastPrune > 3600000) {
        const maintenance = await r.maintenance.run(500, AbortSignal.timeout(20000));
        for (const result of maintenance)
          if (result.code !== "OK") console.error("fleet maintenance deferred", result.id, result.code);
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
  workers.close();
  await r.host.stop();
  await Promise.allSettled([workers.drain(), recoveryInFlight, intakeInFlight]);
  await r.host.drain();
  await r.pool.end();
}
