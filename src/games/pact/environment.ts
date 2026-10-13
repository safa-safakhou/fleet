import { type Data, FleetError, object } from "../../domain.js";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
// These are whole current facts used for identity, authority, resource and
// construction checks. Packing must fail closed rather than weaken this evidence.
const core = [
  "profile",
  "asOfGameTimeMs",
  "balances",
  "buildings",
  "builders",
  "nextUpgradeChecks",
  "constructionRecovery",
  "mandate",
  "socialDelegation",
  "charges",
  "upkeep",
  "coldContactStock",
  "communicationCapacity",
];
const pages = ["openSupplyOffers", "contactRequests", "contacts", "contracts"];
const rules = [
  "resourceRules",
  "developmentRules",
  "diplomacyRules",
  "constructionStockChecks",
  "planningCautions",
  "publicDiscovery",
];

export function compactEnvironment(environment: Data, limit: number): Data {
  if (bytes(environment) <= limit) return environment;
  const output: Data = Object.fromEntries(core.filter((k) => k in environment).map((k) => [k, environment[k]]));
  const coverage: Data = { complete: false, omittedFields: [], pages: {} };
  output.coverage = coverage;
  output.observationNotice =
    "Optional current observations are incomplete. Omitted records are unknown. Core identity, resource, construction and authority facts are whole. Use fleet_read_schema then the supported owned guide, contract, conversation or public read for missing evidence; never invent filters.";
  const omitted = coverage.omittedFields as string[];
  const pageCoverage = object(coverage.pages);
  // Reserve metadata before filling pages so an omitted tail never looks empty.
  for (const key of pages) {
    const values = environment[key];
    if (Array.isArray(values)) {
      output[key] = [];
      pageCoverage[key] = { observed: values.length, retained: 0, omitted: values.length };
    } else if (values !== undefined) output[key] = values;
  }
  for (const key of Object.keys(environment)) if (!core.includes(key) && !pages.includes(key)) omitted.push(key);
  if (bytes(output) > limit) throw new FleetError("CONTEXT_LIMIT");
  const candidates = pages.map((key) => {
    const values = Array.isArray(environment[key]) ? [...(environment[key] as unknown[])] : [];
    // Rotate whole records across scheduled turns instead of permanently hiding
    // later records behind the same unanswered request.
    const turn = Number(environment.observationTurn ?? 0);
    const start = values.length ? Math.abs(Number.isSafeInteger(turn) ? turn : 0) % values.length : 0;
    return { key, values: [...values.slice(start), ...values.slice(0, start)] };
  });
  // Interleave categories instead of allowing one busy inbox to consume every byte.
  for (let n = 0; n < Math.max(0, ...candidates.map((c) => c.values.length)); n++) {
    for (const { key, values } of candidates) {
      if (n >= values.length) continue;
      const kept = output[key] as unknown[];
      kept.push(values[n]);
      const prior = pageCoverage[key];
      pageCoverage[key] = { observed: values.length, retained: kept.length, omitted: values.length - kept.length };
      if (bytes(output) > limit) {
        kept.pop();
        pageCoverage[key] = prior;
      }
    }
  }
  for (const key of rules) {
    if (environment[key] === undefined) continue;
    output[key] = environment[key];
    const index = omitted.indexOf(key);
    if (index >= 0) omitted.splice(index, 1);
    if (bytes(output) > limit) {
      delete output[key];
      omitted.push(key);
    }
  }
  return output;
}
