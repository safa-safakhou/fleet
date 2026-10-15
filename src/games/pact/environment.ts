import { type Data, FleetError, object } from "../../domain.js";
import { factTable } from "../../fact-table.js";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
// These are whole current facts used for identity, authority, resource and
// construction checks. Packing must fail closed rather than weaken this evidence.
const core = [
  "profile",
  "ambition",
  "ownerIntentStatus",
  "asOfGameTimeMs",
  "balances",
  "buildings",
  "builders",
  "nextUpgradeChecks",
  "constructionRecovery",
  "mandate",
  "authority",
  "goalFeasibility",
  "socialDelegation",
  "charges",
  "upkeep",
  "coldContactStock",
  "communicationCapacity",
];
const pages = ["openSupplyOffers", "contactRequests", "contacts", "contracts"];
const rules = ["resourceRules", "developmentRules", "diplomacyRules", "constructionStockChecks", "planningCautions"];

export { expandFactTables } from "../../fact-table.js";

export function compactEnvironment(environment: Data, limit: number): Data {
  if (bytes(environment) <= limit) return environment;
  const output: Data = Object.fromEntries(core.filter((k) => k in environment).map((k) => [k, environment[k]]));
  let encoded = false;
  for (const key of ["balances", "buildings", "builders", "nextUpgradeChecks"]) {
    const packed = factTable(output[key]);
    if (packed !== output[key]) {
      output[key] = packed;
      encoded = true;
    }
  }
  const authority = object(output.authority),
    resources = factTable(authority.resources);
  if (resources !== authority.resources) {
    output.authority = { ...authority, resources };
    encoded = true;
  }
  const feasibility = object(output.goalFeasibility),
    upgrades = factTable(feasibility.hallUpgrades);
  if (upgrades !== feasibility.hallUpgrades) {
    output.goalFeasibility = { ...feasibility, hallUpgrades: upgrades };
    encoded = true;
  }
  const mandate = object(output.mandate);
  const sameAllowed = { sameFact: "authority.allowedActions" };
  if (
    Array.isArray(mandate.allowedActions) &&
    JSON.stringify(mandate.allowedActions) === JSON.stringify(object(output.authority).allowedActions) &&
    bytes(mandate.allowedActions) > bytes(sameAllowed) + 64
  ) {
    output.mandate = { ...mandate, allowedActions: sameAllowed };
    encoded = true;
  }
  if (encoded)
    output.factEncoding =
      "Whole tables: columns=dotted paths, common=EVERY row, $key=map key, absent[row]=missing (not null/0), keyFormat=field substitution. sameFact paths: environment.";
  const coverage: Data = { complete: false, omittedFields: [], pages: {} };
  output.coverage = coverage;
  output.observationNotice = "Whole core/authority. Omitted=unknown. Use supported scoped reads/filters.";
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
  const social = object(environment.socialAttention),
    socialRecords = Array.isArray(social.records) ? social.records : [];
  if (environment.socialAttention !== undefined) {
    output.socialAttention = {
      ...social,
      records: [],
      coverage: {
        ...object(social.coverage),
        sourceComplete: object(social.coverage).complete,
        complete: socialRecords.length === 0 && object(social.coverage).complete === true,
        delivered: 0,
        omittedFromThisInput: socialRecords.length,
      },
    };
    const index = omitted.indexOf("socialAttention");
    if (index >= 0) omitted.splice(index, 1);
    // Reserve a whole urgent record before optional history/contact pages. No action is prescribed.
    if (socialRecords.length) {
      object(output.socialAttention).records = [socialRecords[0]];
      object(output.socialAttention).coverage = {
        ...object(social.coverage),
        sourceComplete: object(social.coverage).complete,
        complete: socialRecords.length === 1 && object(social.coverage).complete === true,
        delivered: 1,
        omittedFromThisInput: socialRecords.length - 1,
      };
    }
    if (bytes(output) > limit) throw new FleetError("CONTEXT_LIMIT");
  }
  const discovery = object(environment.publicDiscovery);
  const discovered = Array.isArray(discovery.players)
    ? discovery.players.map((raw) => {
        const peer = object(raw),
          communication = object(peer.communication);
        return {
          kingdomId: peer.kingdomId,
          handle: peer.handle,
          displayName: peer.displayName ?? peer.name,
          hallLevel: peer.hallLevel,
          relationship: peer.relationship,
          communication: Object.keys(communication).length
            ? { route: communication.route, agentActivity: communication.agentActivity }
            : undefined,
          agentActivity: peer.agentActivity,
          publicDetailsOmitted: true,
        };
      })
    : [];
  const pageKinds = [...pages];
  if (environment.publicDiscovery !== undefined) {
    output.publicDiscovery = {
      players: [],

      selection: discovery.selection,
      page: discovery.page,
      hasMore: discovery.hasMore,
      coverage: "Sample only; notice/Court details omitted. Activity promises no reply. Read further facts.",
    };
    pageCoverage.publicDiscovery = { observed: discovered.length, retained: 0, omitted: discovered.length };
    pageKinds.unshift("publicDiscovery");
    const index = omitted.indexOf("publicDiscovery");
    if (index >= 0) omitted.splice(index, 1);
  }
  if (bytes(output) > limit) throw new FleetError("CONTEXT_LIMIT");
  const candidates = pageKinds.map((key) => {
    const values =
      key === "publicDiscovery"
        ? discovered
        : Array.isArray(environment[key])
          ? [...(environment[key] as unknown[])]
          : [];
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
      const kept =
        key === "publicDiscovery" ? (object(output.publicDiscovery).players as unknown[]) : (output[key] as unknown[]);
      kept.push(values[n]);
      const prior = pageCoverage[key];
      pageCoverage[key] = { observed: values.length, retained: kept.length, omitted: values.length - kept.length };
      if (bytes(output) > limit) {
        kept.pop();
        pageCoverage[key] = prior;
      }
    }
  }
  if (socialRecords.length > 1)
    for (const record of socialRecords.slice(1)) {
      const socialOut = object(output.socialAttention),
        kept = socialOut.records as unknown[];
      kept.push(record);
      socialOut.coverage = {
        ...object(social.coverage),
        sourceComplete: object(social.coverage).complete,
        complete: kept.length === socialRecords.length && object(social.coverage).complete === true,
        delivered: kept.length,
        omittedFromThisInput: socialRecords.length - kept.length,
      };
      if (bytes(output) > limit) {
        kept.pop();
        socialOut.coverage = {
          ...object(social.coverage),
          sourceComplete: object(social.coverage).complete,
          complete: false,
          delivered: kept.length,
          omittedFromThisInput: socialRecords.length - kept.length,
        };
        break;
      }
    }
  // An observed public identity is part of the account's current surroundings,
  // not a prescribed social action. Do not let optional memory make a populated
  // world look empty; let the shared fitter reduce continuation context instead.
  if (discovered.length && !(object(output.publicDiscovery).players as unknown[]).length)
    throw new FleetError("CONTEXT_LIMIT");
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
