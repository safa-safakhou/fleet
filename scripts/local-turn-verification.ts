interface VerifiedTurn {
  state: string;
  code: string | null;
  actions: number;
  pending_command: string | null;
}
/** Confirmed progress never erases a later failure from a verification result. */
export function turnVerificationFailure(turn: VerifiedTurn, compute: { status: string }[]): string | undefined {
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
  return undefined;
}
