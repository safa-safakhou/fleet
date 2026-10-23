import { type Data, object } from "../../domain.js";
import { factTable } from "../../fact-table.js";
import type { Observation } from "../../platform/contracts.js";

/** Whole native owner answers; representation changes never project facts away. */
export function worldReadTables(observation: Observation): Observation {
  const answer = object(observation.payload.requestedRead);
  if (answer.schemaVersion !== "pact.world.owner.v1") return observation;
  const encoded: Data = { ...answer };
  for (const key of [
    "balances",
    "buildings",
    "builders",
    "nextUpgradeChecks",
    "charges",
    "troops",
    "training",
    "contracts",
    "raids",
    "scouts",
    "threats",
    "records",
  ])
    if (Object.hasOwn(answer, key))
      encoded[key] = factTable(answer[key], key === "balances" ? { atomicPaths: ["facts"] } : {});
  for (const [section, fields] of [
    ["authority", ["resources"]],
    ["unitReferences", ["units"]],
    ["consequences", ["builds", "contacts", "supplyContracts"]],
  ] as const) {
    if (!Object.hasOwn(answer, section)) continue;
    const raw = answer[section];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const source = object(raw);
    encoded[section] = Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        key,
        fields.some((field) => field === key) ? factTable(value) : value,
      ]),
    );
  }
  return { ...observation, payload: { ...observation.payload, requestedRead: encoded } };
}
