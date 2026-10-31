import { digest } from "../contracts.js";
import type { RunSnapshot } from "../evidence/inspection.js";
import { MetricCatalog } from "./catalog.js";
import { measurementCoverage } from "./coverage.js";
import {
  inWindow,
  type MetricEvidencePort,
  type MetricSet,
  type MetricValue,
  type MetricWindow,
  WindowSchema,
} from "./types.js";

const ratio = (n: number, d: number) => (d ? n / d : null);
const nearest = (v: number[], p: number) => {
  const a = [...v].sort((x, y) => x - y);
  return a.length ? a[Math.ceil(p * a.length) - 1] : null;
};
const number = (n: bigint) => (n > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(n));
export class MetricAggregator {
  constructor(
    readonly evidence: MetricEvidencePort,
    readonly options: { window: MetricWindow; priceVersion?: string },
    readonly catalog = new MetricCatalog(),
  ) {}
  async compute(snapshot: RunSnapshot, ids: string[]): Promise<MetricSet> {
    const window = WindowSchema.parse(this.options.window),
      data = await this.evidence.load(snapshot);
    if (data.snapshotId !== snapshot.id) throw Error("METRIC_SNAPSHOT_MISMATCH");
    if (ids.length > 200 || new Set(ids).size !== ids.length) throw Error("METRIC_SELECTION_INVALID");
    const calls = snapshot.native.allocations.filter((c) => inWindow(c.createdAt, window));
    const unknown = calls.filter(
      (c) =>
        ["unknown", "reserved"].includes(c.status) ||
        (c.status === "reported" && (c.inputTokens === null || c.outputTokens === null)),
    );
    const sum = (key: "inputTokens" | "outputTokens" | "reservedTokens", rs = calls) =>
      rs.reduce((n, r) => n + BigInt(r[key] ?? "0"), 0n);
    const known = sum("inputTokens") + sum("outputTokens");
    const objective = data.measurements
      .filter((m) => m.id === "objective_success_rate.v1" && inWindow(m.at, window) && m.status === "complete")
      .reduce((n, m) => n + (m.numerator ?? 0), 0);
    const values: MetricValue[] = ids.map((id) => {
      const d = this.catalog.get(id),
        rows = data.measurements.filter((m) => m.id === id && inWindow(m.at, window)),
        complete = rows.filter((r) => r.status === "complete"),
        refs = new Set(data.sourceRefs),
        exclusions: string[] = [];
      rows.forEach((r) => r.sourceRefs.forEach((s) => refs.add(s)));
      let value: number | null = null,
        n: string | null = null,
        den: string | null = null,
        coverage = measurementCoverage(rows),
        population = d.population;
      const count = (v: number) => {
        value = v;
        n = String(v);
        coverage = { status: "complete", expected: v, recorded: v, censored: 0, ungraded: 0 };
      };
      const sumSamples = () => complete.reduce((n, r) => n + (r.value ?? 0), 0);
      const native = ["calls", "input", "output", "unknown", "reservation", "latency", "queue", "efficiency"].includes(
        d.source,
      );
      if (d.source !== "measurement") refs.add(`snapshot:${snapshot.id}#native:${d.source}`);
      if (d.source === "calls") count(calls.length);
      else if (d.source === "unknown") count(unknown.length);
      else if (["input", "output", "reservation"].includes(d.source)) {
        const key = d.source === "input" ? "inputTokens" : d.source === "output" ? "outputTokens" : "reservedTokens";
        n = String(sum(key));
        value = number(BigInt(n));
        coverage = {
          status: calls.some((c) => c[key] == null) ? "partial" : "complete",
          expected: calls.length,
          recorded: calls.filter((c) => c[key] != null).length,
          censored: 0,
          ungraded: 0,
        };
        if (calls.length && !coverage.recorded) {
          value = null;
          coverage.status = "unavailable";
        }
      } else if (["latency", "queue"].includes(d.source)) {
        const samples = calls
          .map((c) =>
            d.source === "latency"
              ? c.status === "reported"
                ? c.responseMetrics?.providerExecutionMs
                : null
              : c.requestMetrics?.queueDelayMs,
          )
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
        value =
          d.operation === "p95"
            ? nearest(samples, 0.95)
            : d.operation === "p50"
              ? nearest(samples, 0.5)
              : samples.length
                ? Math.max(...samples)
                : null;
        n = String(samples.length);
        population = "comparable completed native call samples";
        coverage = {
          status: samples.length === calls.length ? "complete" : samples.length ? "partial" : "unavailable",
          expected: calls.length,
          recorded: samples.length,
          censored: calls.length - samples.length,
          ungraded: 0,
        };
      } else if (["tasks", "attempts", "waits"].includes(d.source)) {
        const attempts = snapshot.native.attempts?.filter((a) => inWindow(a.startedAt, window));
        if (attempts)
          count(
            d.source === "tasks"
              ? new Set(attempts.map((a) => a.taskId).filter(Boolean)).size
              : d.source === "waits"
                ? attempts.filter((a) => a.code === "WAIT" && a.actions === 0 && a.finishedAt).length
                : attempts.length,
          );
      } else if (d.source === "commands")
        count(snapshot.native.commands.filter((c) => c.status === "confirmed" && inWindow(c.createdAt, window)).length);
      else if (d.source === "reads")
        count(data.events.filter((e) => e.kind === "game.read.response" && inWindow(e.occurredAt, window)).length);
      else if (d.source.startsWith("cohort-")) {
        const cohorts = snapshot.native.cohorts;
        if (
          cohorts &&
          !(d.source === "cohort-completed" && cohorts.some((c) => c.state === "finished" && !c.completedAt))
        )
          count(
            cohorts.filter((c) =>
              inWindow(d.source === "cohort-created" ? c.createdAt : (c.completedAt ?? undefined), window),
            ).length,
          );
      } else if (d.source.endsWith("coverage")) {
        const c = snapshot.coverage;
        n = d.source === "event-coverage" ? String(c.recorded) : c.byteCoverage.recorded;
        den = d.source === "event-coverage" ? String(c.expected) : c.byteCoverage.expected;
        value = ratio(Number(n), Number(den));
        coverage = {
          status: !Number(den) ? "unavailable" : Number(n) === Number(den) ? "complete" : "partial",
          expected: Number(den),
          recorded: Number(n),
          censored: 0,
          ungraded: 0,
        };
      } else if (d.source === "efficiency") {
        n = String(known);
        den = String(objective);
        value = objective && number(known) !== null ? Number(known) / objective : null;
        coverage = {
          status: unknown.length ? "partial" : objective ? "complete" : "unavailable",
          expected: calls.length,
          recorded: calls.length - unknown.length,
          censored: unknown.length,
          ungraded: 0,
        };
        if (unknown.length) {
          value = null;
          exclusions.push("UNKNOWN_USAGE");
        }
      } else if (complete.length) {
        if (d.operation === "ratio") {
          const eligible = complete.filter((r) => r.numerator !== undefined && r.denominator !== undefined);
          n = String(eligible.reduce((n, r) => n + r.numerator!, 0));
          den = String(eligible.reduce((n, r) => n + r.denominator!, 0));
          if (eligible.length !== complete.length) {
            coverage.recorded = eligible.length;
            coverage.status = eligible.length ? "partial" : "unavailable";
          }
          value = ratio(Number(n), Number(den));
          if (!Number(den)) exclusions.push("ZERO_DENOMINATOR");
        } else {
          const samples = complete.map((r) => r.value).filter((v): v is number => v !== null);
          value =
            d.operation === "p95"
              ? nearest(samples, 0.95)
              : d.operation === "p50"
                ? nearest(samples, 0.5)
                : d.operation === "max"
                  ? samples.length
                    ? Math.max(...samples)
                    : null
                  : samples.length
                    ? d.operation === "mean"
                      ? sumSamples() / samples.length
                      : sumSamples()
                    : null;
          n = String(samples.length);
        }
      }
      if (
        id === "monetary_cost.v1" &&
        (!this.options.priceVersion ||
          complete.some((m) => m.priceVersion !== this.options.priceVersion || m.billableUnits === undefined))
      ) {
        value = null;
        exclusions.push("PRICE_VERSION_REQUIRED");
        coverage.status = "unavailable";
      }
      if (native && snapshot.native.allocations.some((c) => !c.createdAt)) {
        value = null;
        exclusions.push("CREATION_TIME_UNAVAILABLE");
        coverage.status = "unavailable";
      }
      if (data.unavailableRefs.length) {
        exclusions.push("EVIDENCE_UNAVAILABLE");
        if (coverage.status === "complete") coverage.status = "partial";
      }
      if (value === null && !exclusions.length) exclusions.push("UNAVAILABLE_OR_NO_DENOMINATOR");
      return {
        id,
        version: d.version,
        unit: d.unit,
        value,
        numerator: n,
        denominator: den,
        population,
        window,
        timeBasis: d.timeBasis,
        coverage,
        sourceRefs: [...refs].sort(),
        evaluatorDigest: digest({ definition: d, window, priceVersion: this.options.priceVersion ?? null }),
        exclusions,
      };
    });
    const unresolvedUsage = {
      allocations: unknown.length,
      reservedTokens: unknown.some((c) => c.reservedTokens == null) ? null : String(sum("reservedTokens", unknown)),
    };
    const body = {
      version: "fleet.metric-set/v1" as const,
      snapshotId: snapshot.id,
      values,
      exclusions: [...new Set(values.flatMap((v) => v.exclusions))].sort(),
      ungraded: data.measurements
        .filter((m) => m.id === "objective_success_rate.v1")
        .reduce((n, m) => n + (m.ungraded ?? 0), 0),
      unresolvedUsage,
    };
    return { ...body, digest: digest(body) };
  }
}
