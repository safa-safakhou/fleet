import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let seed = "20261030",
  path: string | undefined,
  runs = "200",
  target = "all";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--seed") seed = args[++i] ?? "";
  else if (args[i] === "--path") path = args[++i];
  else if (args[i] === "--property") target = args[++i] ?? "";
  else if (args[i] === "--release") runs = "2000";
  else throw Error("UNKNOWN_PROPERTY_OPTION");
}
if (path && target === "all") target = "ledger";
if (!["all", "ledger", "protection", "canonical", "configuration"].includes(target))
  throw Error("INVALID_PROPERTY_TARGET");
if (
  !/^-?\d+$/.test(seed) ||
  !Number.isSafeInteger(Number(seed)) ||
  Number(seed) < -2147483648 ||
  Number(seed) > 2147483647 ||
  (path !== undefined && !/^\d+(?::\d+)*$/.test(path))
)
  throw Error("INVALID_PROPERTY_REPLAY");
console.log(
  JSON.stringify({
    kind: "property_run",
    property: target,
    seed: Number(seed),
    path: path ?? null,
    historiesPerTest: Number(runs),
    maxTransitions: 50,
  }),
);
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "scripts/test-architecture-offline.ts",
    "tests/property/research-manifests.test.ts",
    "tests/property/research-ledger.test.ts",
    "tests/property/research-config.test.ts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FLEET_PROPERTY_SEED: seed,
      FLEET_PROPERTY_RUNS: runs,
      FLEET_PROPERTY_TARGET: target,
      ...(path ? { FLEET_PROPERTY_PATH: path } : {}),
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
