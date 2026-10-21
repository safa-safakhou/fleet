import { setTimeout as delay } from "node:timers/promises";
/** The image entrypoint temporarily accepts socket connections while initializing
 * and then stops that server. Only the final service listens on loopback TCP. */
export async function waitForOwnedPostgres(
  id: string,
  run: (args: string[]) => Promise<unknown>,
  pause: () => Promise<unknown> = () => delay(100),
  attempts = 300,
) {
  for (let n = 0; n < attempts; n++) {
    try {
      await run(["exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "architecture_fixture", "-d", "postgres"]);
      return;
    } catch {
      await pause();
    }
  }
  throw Error("OWNED_RESTORE_NOT_READY");
}
