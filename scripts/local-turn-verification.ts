interface VerifiedTurn {
  state: string;
  code: string | null;
  actions: number;
  pending_command: string | null;
}
/** Confirmed progress never erases a later failure from a verification result. */
export function turnVerificationFailure(
  turn: VerifiedTurn,
  compute: { status: string }[],
  resolutions?: { code: string | null }[],
): string | undefined {
  if (
    turn.state !== "finished" ||
    !compute.length ||
    compute.some((row) => row.status !== "reported") ||
    turn.pending_command
  )
    return "TURN_NOT_OPERATIVE";
  if (!turn.code || !["WAIT", "COMMITTED", "ALREADY_COMMITTED"].includes(turn.code))
    return turn.code ?? "TURN_NOT_OPERATIVE";
  if (turn.code !== "WAIT" && turn.actions === 0) return "TURN_NOT_OPERATIVE";
  if (resolutions) {
    const refused = resolutions.find((r) => !r.code || !["COMMITTED", "ALREADY_COMMITTED"].includes(r.code));
    if (refused) return refused.code ?? "COMMAND_OUTCOME_UNRESOLVED";
    if (resolutions.length !== turn.actions) return "COMMAND_COUNT_MISMATCH";
  }
  return undefined;
}
