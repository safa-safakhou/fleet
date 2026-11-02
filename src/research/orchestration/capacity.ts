export interface CapacityCandidate {
  taskId: string;
  bindingId: string;
  eligibleAt: number;
  lastDispatchAt: number | null;
  event: boolean;
  deadline?: { clockId: string; value: string };
}
type Refusal = { taskId: string; reason: "expired" | "unknown_deadline_clock" | "invalid_record" };
/** Pre-claim grants only. Native admission and domain deadlines remain authoritative. */
export function selectCapacityWork(
  candidates: readonly CapacityCandidate[],
  options: {
    now: number;
    clocks: Record<string, string | number | bigint>;
    capacity: number;
    activeBindings: ReadonlySet<string>;
  },
): { selected: CapacityCandidate[]; refused: Refusal[] } {
  if (
    !Number.isInteger(options.capacity) ||
    options.capacity < 0 ||
    options.capacity > 16 ||
    !Number.isSafeInteger(options.now)
  )
    throw new Error("CAPACITY_LIMIT");
  const refused: Refusal[] = [],
    seen = new Set<string>();
  const eligible: { item: CapacityCandidate; remaining?: bigint }[] = [];
  for (const item of candidates) {
    if (seen.has(item.taskId)) continue;
    seen.add(item.taskId);
    if (
      !item.taskId ||
      !item.bindingId ||
      !Number.isSafeInteger(item.eligibleAt) ||
      (item.lastDispatchAt !== null && !Number.isSafeInteger(item.lastDispatchAt))
    ) {
      refused.push({ taskId: item.taskId, reason: "invalid_record" });
      continue;
    }
    if (item.eligibleAt > options.now || options.activeBindings.has(item.bindingId)) continue;
    let remaining: bigint | undefined;
    if (item.deadline) {
      const { clockId, value } = item.deadline;
      const clock = clockId === "utc" ? options.now : options.clocks[clockId];
      if (clock === undefined) {
        refused.push({ taskId: item.taskId, reason: "unknown_deadline_clock" });
        continue;
      }
      const deadline = clockId === "utc" ? Date.parse(value) : value;
      if (
        (typeof deadline === "number" && !Number.isSafeInteger(deadline)) ||
        !/^-?\d{1,20}$/.test(String(deadline)) ||
        !/^-?\d{1,20}$/.test(String(clock))
      ) {
        refused.push({ taskId: item.taskId, reason: "invalid_record" });
        continue;
      }
      remaining = BigInt(deadline) - BigInt(clock);
      if (remaining <= 0n) {
        refused.push({ taskId: item.taskId, reason: "expired" });
        continue;
      }
    }
    eligible.push({ item, remaining });
  }
  const compareDeadline = (a: (typeof eligible)[number], b: (typeof eligible)[number]) => {
    const urgentA = a.remaining !== undefined && a.remaining <= 30000n,
      urgentB = b.remaining !== undefined && b.remaining <= 30000n;
    if (urgentA !== urgentB) return urgentA ? -1 : 1;
    if (urgentA && urgentB && a.remaining !== undefined && b.remaining !== undefined && a.remaining !== b.remaining)
      return a.remaining < b.remaining ? -1 : 1;
    return 0;
  };
  const stable = (a: (typeof eligible)[number], b: (typeof eligible)[number]) =>
    a.item.eligibleAt - b.item.eligibleAt || a.item.taskId.localeCompare(b.item.taskId);
  const byBinding = new Map<string, (typeof eligible)[number]>();
  for (const row of eligible) {
    const old = byBinding.get(row.item.bindingId);
    if (!old || (compareDeadline(row, old) || Number(old.item.event) - Number(row.item.event) || stable(row, old)) < 0)
      byBinding.set(row.item.bindingId, row);
  }
  const rotation = (a: (typeof eligible)[number], b: (typeof eligible)[number]) =>
    (a.item.lastDispatchAt ?? 0) - (b.item.lastDispatchAt ?? 0) || stable(a, b);
  const free = Math.max(0, options.capacity - options.activeBindings.size);
  const selected: CapacityCandidate[] = [],
    rows = [...byBinding.values()];
  if (free) {
    // One aged actor gets a slot even if fresh urgent events keep arriving.
    const aged = rows.filter((x) => options.now - x.item.eligibleAt >= 30000).sort(rotation)[0];
    if (aged) {
      selected.push(aged.item);
      rows.splice(rows.indexOf(aged), 1);
    }
    rows.sort((a, b) => compareDeadline(a, b) || rotation(a, b));
    selected.push(...rows.slice(0, free - selected.length).map((x) => x.item));
  }
  return { selected, refused };
}
