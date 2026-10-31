import type { RunScope } from "../contracts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import { MetricCatalog } from "./catalog.js";
import { type Measurement, MeasurementSchema } from "./types.js";
/** Native instrumentation port, deliberately absent from all worker RPC allowlists. */
export async function recordMeasurement(capture: CaptureSession, scope: RunScope, input: Measurement) {
  const measurement = MeasurementSchema.parse(input);
  new MetricCatalog().get(measurement.id);
  return capture.emit(
    scope,
    "observation.record",
    { schemaVersion: "fleet.measurement/v1", measurement },
    {},
    { required: true, stream: "native-metrics", sourceRefs: measurement.sourceRefs },
  );
}
