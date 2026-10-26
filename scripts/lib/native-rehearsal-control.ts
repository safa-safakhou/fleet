/** Offered work does not wait for unrelated kingdoms to become idle. */
export function dueRehearsalRounds(elapsedMs: number, published: number) {
  const due: number[] = [];
  for (let n = published + 1; n <= 30 && (n - 1) * 60000 <= elapsedMs && elapsedMs < 1800000; n++) due.push(n);
  return due;
}
export function rehearsalTurnCode(
  turn: { state: string; code: string | null; unknown_usage: boolean },
  thrown?: string,
) {
  if (turn.unknown_usage || ["needs_owner", "pending", "running"].includes(turn.state))
    return turn.code ?? "TURN_UNRESOLVED";
  if (thrown) return thrown;
  return ["WAIT", "COMMITTED", "ALREADY_COMMITTED", "SIM_CONFIRMED", "TURN_ACTION_LIMIT"].includes(turn.code ?? "")
    ? "RETURNED"
    : (turn.code ?? "TURN_OUTCOME_UNAVAILABLE");
}
