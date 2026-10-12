import { type Data, object } from "../../domain.js";

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
export function boundedObservation(value: unknown, limit: number): unknown {
  if (bytes(value) <= limit) return value;
  return {
    omitted: true,
    originalBytes: bytes(value),
    coverage: "Incomplete observation; the full result exceeds this context allowance.",
  };
}
function legacy(entry: Data): Data {
  let value = entry;
  for (let n = 0; n < 8 && value.partialObservation; n++) value = object(value.partialObservation);
  return value;
}
const common = ["schemaVersion", "rulesId", "asOfGameTimeMs", "committedTickSequence", "worldStatus"];
const guide = [
  "firstContact",
  "discovery",
  "principle",
  "exampleActions",
  "buildingRules",
  "buildingBaseCostsWhole",
  "upgradeMultipliersAndMinutes",
  "hallUnlocks",
  "troopCostsWholeAndMinutes",
  "contractRules",
  "socialDelegation",
  "contactRequests",
  "contacts",
  "coldContactStock",
  "mandate",
  "constructionStockChecks",
  "planningCautions",
  "next",
  "communicationCapacity",
];
const stable = (e: Data) =>
  e.tool === "fleet_action_schema" ||
  e.tool === "fleet_read_schema" ||
  (e.tool === "pact_agent_guide_v1" && object(e.args).topic !== "start");
// Atomic values, especially executable shapes and message text, are kept whole or omitted.
export function projectRead(raw: Data, limit = 6000): Data {
  const entry = legacy(raw);
  if (typeof entry.tool !== "string") return object(boundedObservation(entry, limit));
  if (bytes(entry) <= limit) return entry;
  const result = object(entry.result),
    output: Data = {};
  const projected: Data = {
    tool: entry.tool,
    args: entry.args,
    observedAt: entry.observedAt,
    result: output,
    coverage: { complete: false, originalBytes: bytes(entry), omittedFields: [], pages: {} },
    observationNotice: "Incomplete observation; retained actions and records are whole. Missing sections are unknown.",
  };
  const omitted: string[] = [],
    pages: Data = {};
  const add = (key: string, value: unknown) => {
    if (value === undefined) return;
    output[key] = value;
    if (bytes(projected) > limit - 700) {
      delete output[key];
      omitted.push(key);
    }
  };
  const page = (key: string, values: unknown[]) => {
    const retained: unknown[] = [];
    output[key] = retained;
    for (const value of values) {
      retained.push(value);
      if (bytes(projected) > limit - 700) {
        retained.pop();
        break;
      }
    }
    pages[key] = { observed: values.length, retained: retained.length, omitted: values.length - retained.length };
    if (retained.length < values.length) omitted.push(key);
  };
  if (entry.tool === "pact_decision_support_v2" && Array.isArray(result.candidates)) {
    page(
      "candidateIndex",
      result.candidates.map((value) => {
        const candidate = object(value);
        return { id: candidate.id, kind: candidate.kind, label: candidate.label };
      }),
    );
  }
  if (entry.tool === "pact_play_view_v1" && result.parties) {
    page(
      "partyIndex",
      Object.keys(object(result.parties)).map((kingdomId) => ({ kingdomId })),
    );
  }
  const keys =
    entry.tool === "pact_decision_support_v2"
      ? [
          "candidates",
          "proposals",
          "proposalCoverage",
          "proposalOffset",
          "proposalsNextOffset",
          "unknowns",
          ...common,
          "charges",
          "upkeep",
          "forecast",
        ]
      : entry.tool === "pact_agent_guide_v1"
        ? [...guide, "topic", ...common]
        : entry.tool === "pact_play_view_v1"
          ? ["parties", "interactions", "observedAt", "presenceMeaning", "bounded", "world"]
          : Object.keys(result);
  for (const key of [...new Set([...keys, ...Object.keys(result)])]) {
    const value = result[key];
    if (Array.isArray(value)) page(key, value);
    else if (key === "parties" && value && typeof value === "object") {
      const parties: Data = {};
      output.parties = parties;
      for (const [id, party] of Object.entries(value)) {
        parties[id] = party;
        if (bytes(projected) > limit - 700) {
          delete parties[id];
          break;
        }
      }
      pages.parties = { observed: Object.keys(value).length, retained: Object.keys(parties).length };
      if (Object.keys(parties).length < Object.keys(value).length) omitted.push(key);
    } else add(key, value);
  }
  projected.coverage = { complete: false, originalBytes: bytes(entry), omittedFields: omitted, pages };
  if (bytes(projected) > limit) return object(boundedObservation(entry, limit));
  return projected;
}
export function mergeReads(reads: Data[]): Data[] {
  const entries = new Map<string, Data>();
  for (const raw of reads) {
    const entry = legacy(raw);
    if (typeof entry.tool !== "string") continue;
    const key = JSON.stringify([entry.tool, entry.args]);
    entries.delete(key);
    entries.set(key, projectRead(entry));
  }
  const all = [...entries.values()];
  return [...all.filter(stable).slice(-4), ...all.filter((e) => !stable(e)).slice(-4)];
}
export function boundedReads(reads: Data[], limit = 12000): Data[] {
  const kept: Data[] = [];
  const merged = mergeReads(reads),
    knowledge = merged.filter(stable).reverse(),
    observations = merged.filter((e) => !stable(e)).reverse();
  const order: Data[] = [];
  for (let i = 0; i < Math.max(knowledge.length, observations.length); i++) {
    if (knowledge[i]) order.push(knowledge[i]);
    if (observations[i]) order.push(observations[i]);
  }
  for (const entry of order) {
    const remaining = limit - bytes(kept) - 2;
    if (remaining < 800) break;
    const projected = projectRead(entry, Math.min(6000, remaining));
    if (projected.omitted || bytes([...kept, projected]) > limit) continue;
    kept.push(projected);
  }
  return kept.reverse();
}
