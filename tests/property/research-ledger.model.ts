/** Independent oracle: allowances never shrink on unknown; each logical ID has at most one effect. */
export class LedgerModel {
  calls = 0;
  effectCount = 0;
  live = true;
  known = false;
  unknown = false;
  begun = false;
  allocationId: string | undefined;
  requireAllocation(): string {
    if (!this.allocationId) throw Error("MISSING_MODEL_ALLOCATION");
    return this.allocationId;
  }
  check(rows: { tokens: string; status: string }[]) {
    if (rows.length !== this.calls) throw Error("RESERVATION_COUNT_MISMATCH");
    if (rows.some((r) => BigInt(r.tokens) < 40000n)) throw Error("RESERVATION_REFUND");
    if (this.unknown && rows[0]?.status !== "unknown") throw Error("UNKNOWN_CLEARED");
    if (this.effectCount > 1) throw Error("DUPLICATE_EFFECT");
  }
}
