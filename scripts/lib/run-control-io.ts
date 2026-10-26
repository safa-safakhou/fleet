import { mkdir, rmdir } from "node:fs/promises";

/** Separate liveness writes from telemetry; retain failures for the control loop. */
export function independentHeartbeat(write: () => Promise<void>, intervalMs = 500) {
  let failure: unknown, active: Promise<void> | undefined;
  const tick = () => {
    if (active) return active;
    active = Promise.resolve()
      .then(write)
      .catch((error) => {
        failure = error;
      })
      .finally(() => {
        active = undefined;
      });
    return active;
  };
  const ready = tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  return {
    ready,
    check: () => {
      if (failure) throw failure;
    },
    stop: async () => {
      clearInterval(timer);
      await active;
    },
  };
}

/** Cross-process exclusion. A dead owner's lock is retained for explicit review. */
export async function serializedFinalization<T>(lock: string, operation: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 180000;
  while (true) {
    try {
      await mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw Error("FINALIZATION_LOCK_TIMEOUT");
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  try {
    return await operation();
  } finally {
    await rmdir(lock);
  }
}
