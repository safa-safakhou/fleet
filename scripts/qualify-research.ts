import { writeFile } from "node:fs/promises";
import { ConfigurationMatrix, highRiskTriples, matrixDimensions } from "../src/research/qualification/matrix.js";

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== "--matrix") throw Error("EXPLICIT_MATRIX_MODE_REQUIRED");
const report = {
  schemaVersion: "fleet.configuration-matrix/v1",
  scope: "fixture-design",
  seed: 20261030,
  dimensions: matrixDimensions,
  mandatoryTriples: highRiskTriples,
  limits: [
    "Pairwise axes plus four required risk scenarios; not exhaustive higher-order coverage.",
    "Generated cases are test obligations, not execution evidence or qualification.",
  ],
  cases: new ConfigurationMatrix().generate({ runtimes: ["ts", "python"], owners: ["platform", "temporal"] }),
};
await writeFile("tests/fixtures/research/config-matrix.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    kind: "matrix",
    cases: report.cases.length,
    excluded: report.cases.filter((x) => x.status === "excluded").length,
    blocking: report.cases.filter((x) => x.status === "blocking").length,
  }),
);
