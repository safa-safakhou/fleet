import { digest } from "../contracts.js";
import type { ExperimentRepository, ExperimentSnapshot } from "./repository.js";
import { clusterInterval } from "./statistics.js";
export function compareExperiment(snapshot: ExperimentSnapshot) {
  const { spec, units } = snapshot,
    flags = [...new Set(units.flatMap((u) => u.flags))].sort(),
    missingRuns = units.flatMap((u) => u.missingRuns);
  const candidates = [...new Set(units.map((u) => u.arm))].filter((a) => a !== spec.baseline).sort(),
    metricIds = [spec.primaryMetric, ...spec.secondaryMetrics];
  const intervals = [];
  for (const candidate of candidates)
    for (const metricId of metricIds) {
      const rows = units
        .filter((u) => [spec.baseline, candidate].includes(u.arm))
        .flatMap((u) =>
          u.runs.length
            ? u.runs.map((r) => ({
                cluster:
                  (r.configuration as { environment?: { worldIncarnation?: string } } | null)?.environment
                    ?.worldIncarnation ?? u.worldId,
                arm: u.arm,
                ...(u.pairId ? { pairId: u.pairId } : {}),
                value: r.metrics.values.find((m) => m.id === metricId)?.value ?? null,
              }))
            : [{ cluster: u.worldId, arm: u.arm, ...(u.pairId ? { pairId: u.pairId } : {}), value: null }],
        );
      let interval = clusterInterval(rows, {
        baseline: spec.baseline,
        candidate,
        paired: spec.paired,
        seed: spec.seed,
        resamples: 2000,
      });
      if (flags.length)
        interval = { ...interval, lower: null, upper: null, reason: interval.reason ?? "EXPERIMENT_QUALITY_GATES" };
      intervals.push({ candidate, metricId, ...interval, practicalMargin: spec.margin });
    }
  const distributions = units.map((u) => ({
    unitId: u.id,
    worldId: u.worldId,
    arm: u.arm,
    metrics: Object.fromEntries(
      metricIds.map((id) => {
        const xs = u.runs
          .map((r) => r.metrics.values.find((m) => m.id === id)?.value)
          .filter((v): v is number => typeof v === "number");
        return [
          id,
          {
            count: xs.length,
            min: xs.length ? Math.min(...xs) : null,
            max: xs.length ? Math.max(...xs) : null,
            mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
          },
        ];
      }),
    ),
  }));
  const baselineConfiguration = units.find((u) => u.arm === spec.baseline)?.runs[0]?.configuration;
  const diff = (a: unknown, b: unknown, path = ""): string[] => {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b))
      return [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .sort()
        .flatMap((k) => diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}/${k}`));
    return [path];
  };
  const manifestDiffs = units
    .filter((u) => u.arm !== spec.baseline)
    .flatMap((u) =>
      u.runs.map((r) => ({
        unitId: u.id,
        runId: r.runId,
        paths: diff(baselineConfiguration ?? null, r.configuration),
      })),
    );
  const body = {
    version: "fleet.comparison/v1",
    snapshotId: snapshot.id,
    snapshotDigest: snapshot.digest,
    baseline: spec.baseline,
    units,
    missingRuns,
    flags,
    intervals,
    distributions,
    manifestDiffs,
    paretoCoordinates: distributions.map((u) => ({
      unitId: u.unitId,
      arm: u.arm,
      coordinates: Object.fromEntries(Object.entries(u.metrics).map(([id, v]) => [id, v.mean])),
    })),
    winner: null,
    conclusion: "Descriptive estimates and explicitly eligible intervals only; no automatic winner or promotion.",
  };
  return { ...body, digest: digest(body) };
}
export class ComparisonService {
  constructor(readonly repository: ExperimentRepository) {}
  async compare(snapshotId: string) {
    return compareExperiment(await this.repository.retained(snapshotId));
  }
}
