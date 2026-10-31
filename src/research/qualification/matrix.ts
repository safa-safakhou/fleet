import { digest } from "../contracts.js";
export const matrixDimensions = {
  recipe: ["scripted", "advisory", "deliberative", "specialist"],
  runtime: ["ts", "python"],
  owner: ["platform", "temporal"],
  retrieval: ["baseline-v1", "fts-v1", "vector-exact-v1", "rrf-v1"],
  consent: ["disabled", "consented"],
  budget: ["finite", "continuous"],
  tools: ["supported", "unsupported"],
  stop: ["ready", "cancelled", "pending", "unknown"],
} as const;
export const highRiskTriples = [
  ["cancel", "lease-loss", "late-usage"],
  ["retention", "index", "cached-context"],
  ["worker-restart", "pending-command", "duplicate-delivery"],
  ["optimizer", "judge", "heldout-split"],
] as const;
export interface MatrixCapabilities {
  runtimes: readonly string[];
  owners: readonly string[];
}
export interface MatrixCase {
  id: string;
  status: "covered" | "excluded" | "blocking";
  values: Record<string, string>;
  reason?: string;
  risks?: readonly string[];
}
/** Pairwise covering array over declared axes. Scenario coverage is a test obligation, not runtime certification. */
export class ConfigurationMatrix {
  generate(capabilities: MatrixCapabilities): MatrixCase[] {
    const entries = Object.entries(matrixDimensions);
    const excluded: MatrixCase[] = [];
    const axes = entries.map(
      ([key, values]) =>
        [
          key,
          values.filter((value) => {
            const reason =
              key === "runtime" && !capabilities.runtimes.includes(value)
                ? "RUNTIME_UNSUPPORTED"
                : key === "owner" && !capabilities.owners.includes(value)
                  ? "OWNER_UNSUPPORTED"
                  : undefined;
            if (reason)
              excluded.push({ id: digest({ key, value }), status: "excluded", values: { [key]: value }, reason });
            return !reason;
          }),
        ] as const,
    );
    if (axes.some(([, values]) => !values.length))
      return [...excluded, { id: "empty", status: "blocking", values: {}, reason: "NO_SUPPORTED_CONFIGURATION" }];
    const pairs = (values: Record<string, string>) =>
      axes.flatMap(([a], i) => axes.slice(i + 1).map(([b]) => JSON.stringify([a, values[a], b, values[b]])));
    const uncovered = new Set<string>();
    for (let a = 0; a < axes.length; a++)
      for (let b = a + 1; b < axes.length; b++)
        for (const av of axes[a][1])
          for (const bv of axes[b][1]) uncovered.add(JSON.stringify([axes[a][0], av, axes[b][0], bv]));
    // Deterministic bounded Cartesian candidates; only the selected covering array is executed.
    const all: Record<string, string>[] = [];
    const expand = (i: number, v: Record<string, string>) => {
      if (i === axes.length) {
        all.push(v);
        return;
      }
      for (const value of axes[i][1]) expand(i + 1, { ...v, [axes[i][0]]: value });
    };
    expand(0, {});
    const result: MatrixCase[] = [];
    while (uncovered.size) {
      let best = all[0],
        score = -1;
      for (const candidate of all) {
        const n = pairs(candidate).filter((p) => uncovered.has(p)).length;
        if (n > score) {
          best = candidate;
          score = n;
        }
      }
      if (score < 1) throw Error("MATRIX_COVERAGE_GAP");
      result.push({ id: digest(best), values: best, status: "covered" });
      for (const p of pairs(best)) uncovered.delete(p);
    }
    for (const risks of highRiskTriples)
      result.push({ id: digest(risks), values: result[0].values, status: "covered", risks });
    return [...result, ...excluded];
  }
}
