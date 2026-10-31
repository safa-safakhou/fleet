export type ClusteredMeasurement = {
  cluster: string;
  arm: string;
  value: number | null;
  pairId?: string;
  status?: "observed" | "censored" | "missing";
};
export type BootstrapOptions = { baseline: string; candidate: string; paired: boolean; seed: number; resamples: 2000 };
export type IntervalResult = {
  method: "world-cluster-bootstrap@1";
  seed: number;
  resamples: number;
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  independentUnits: number;
  worlds: number;
  missing: number;
  unmatched: string[];
  reason: string | null;
};
const mean = (v: number[]) => (v.length ? v.reduce((n, x) => n + x, 0) / v.length : null);
export function clusterInterval(input: ClusteredMeasurement[], options: BootstrapOptions): IntervalResult {
  if (
    options.resamples !== 2000 ||
    !Number.isSafeInteger(options.seed) ||
    options.baseline === options.candidate ||
    input.some((r) => !r.cluster || (r.value !== null && !Number.isFinite(r.value)))
  )
    throw Error("BOOTSTRAP_INPUT_INVALID");
  const groups = new Map<string, { cluster: string; arm: string; pairId?: string; values: number[] }>();
  let missing = 0;
  for (const row of input) {
    if (![options.baseline, options.candidate].includes(row.arm)) continue;
    if (row.value === null || (row.status && row.status !== "observed")) {
      missing++;
      continue;
    }
    const key = JSON.stringify([row.cluster, row.arm]),
      old = groups.get(key);
    if (old && old.pairId !== row.pairId) throw Error("CLUSTER_PAIR_CONFLICT");
    const group = old ?? {
      cluster: row.cluster,
      arm: row.arm,
      ...(row.pairId ? { pairId: row.pairId } : {}),
      values: [],
    };
    group.values.push(row.value);
    groups.set(key, group);
  }
  const rows = [...groups.values()]
    .sort((a, b) => (a.cluster < b.cluster ? -1 : a.cluster > b.cluster ? 1 : a.arm < b.arm ? -1 : 1))
    .map((r) => ({ ...r, value: mean(r.values)! }));
  const worlds = new Set(rows.map((r) => r.cluster)).size,
    interference = [...new Set(rows.map((r) => r.cluster))].some(
      (id) => new Set(rows.filter((r) => r.cluster === id).map((r) => r.arm)).size > 1,
    );
  const baseline = rows.filter((r) => r.arm === options.baseline).map((r) => r.value),
    candidate = rows.filter((r) => r.arm === options.candidate).map((r) => r.value),
    unmatched: string[] = [],
    paired: number[] = [];
  if (options.paired) {
    const pairs = [...new Set(rows.map((r) => r.pairId ?? `unpaired:${r.cluster}`))].sort();
    for (const id of pairs) {
      const b = rows.filter((r) => r.pairId === id && r.arm === options.baseline),
        c = rows.filter((r) => r.pairId === id && r.arm === options.candidate);
      if (b.length !== 1 || c.length !== 1) unmatched.push(id);
      else paired.push(c[0].value - b[0].value);
    }
  }
  const independentUnits = options.paired ? paired.length : worlds;
  const estimate = options.paired
    ? mean(paired)
    : baseline.length && candidate.length
      ? mean(candidate)! - mean(baseline)!
      : null;
  const reason = interference
    ? "SHARED_WORLD_INTERFERENCE"
    : missing
      ? "MISSING_MEASUREMENTS"
      : unmatched.length
        ? "UNMATCHED_PAIRS"
        : estimate === null
          ? "NO_COMPARABLE_UNITS"
          : independentUnits < 10
            ? "INSUFFICIENT_INDEPENDENT_UNITS"
            : null;
  const result: IntervalResult = {
    method: "world-cluster-bootstrap@1",
    seed: options.seed,
    resamples: options.resamples,
    estimate,
    lower: null,
    upper: null,
    independentUnits,
    worlds,
    missing,
    unmatched,
    reason,
  };
  if (reason) return result;
  let state = options.seed >>> 0 || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const resample = (xs: number[]) =>
    mean(Array.from({ length: xs.length }, () => xs[Math.floor(random() * xs.length)]))!;
  const values = Array.from({ length: 2000 }, () =>
    options.paired ? resample(paired) : resample(candidate) - resample(baseline),
  ).sort((a, b) => a - b);
  return {
    ...result,
    lower: values[Math.floor(0.025 * (values.length - 1))],
    upper: values[Math.ceil(0.975 * (values.length - 1))],
  };
}
