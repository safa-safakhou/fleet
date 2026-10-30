import type fc from "fast-check";
export const propertySelected = (name: string) =>
  !process.env.FLEET_PROPERTY_TARGET ||
  process.env.FLEET_PROPERTY_TARGET === "all" ||
  process.env.FLEET_PROPERTY_TARGET === name;
export function propertyOptions(property: string): fc.Parameters<unknown> {
  return {
    numRuns: Number(process.env.FLEET_PROPERTY_RUNS ?? 200),
    seed: Number(process.env.FLEET_PROPERTY_SEED ?? 20261030),
    ...(process.env.FLEET_PROPERTY_PATH && process.env.FLEET_PROPERTY_TARGET === property
      ? { path: process.env.FLEET_PROPERTY_PATH }
      : {}),
    reporter(details) {
      const report = {
        kind: "property_result",
        property,
        seed: details.seed,
        histories: details.numRuns,
        failed: details.failed,
        path: details.failed ? details.counterexamplePath : null,
        counterexample: details.failed ? details.counterexample : null,
      };
      console.log(JSON.stringify(report));
      if (details.failed)
        throw new Error(`PROPERTY_FAILED:${JSON.stringify(report)}`, { cause: details.errorInstance });
    },
  };
}
