import { writeFile } from "node:fs/promises";

/** Optional operator canary latch; never enabled implicitly for ordinary workers. */
export async function stopFailedCanaryTurn(
  file: string,
  turn: { state: string; code: string | null; unknown_usage: boolean },
) {
  if (
    !turn.unknown_usage &&
    turn.state === "finished" &&
    ["WAIT", "COMMITTED", "ALREADY_COMMITTED", "TURN_ACTION_LIMIT", "BUDGET_EXHAUSTED"].includes(turn.code ?? "")
  )
    return false;
  try {
    await writeFile(
      `${file}.closed`,
      JSON.stringify({ reason: `CANARY_TURN_FAILED:${turn.code ?? turn.state}`, at: Date.now() }),
      { mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return true;
}
