import config from "../../../config/research/metrics.v1.json" with { type: "json" };
import { FleetError } from "../../domain.js";
import type { MetricDefinition } from "./types.js";
export class MetricCatalog {
  readonly version = "fleet.metric-catalog/v1";
  list(): MetricDefinition[] {
    return structuredClone(config.definitions);
  }
  get(id: string): MetricDefinition {
    const d = config.definitions.find((d) => d.id === id);
    if (!d) throw new FleetError("METRIC_UNKNOWN", true);
    return structuredClone(d);
  }
}
