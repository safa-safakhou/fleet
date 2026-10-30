import { createHash } from "node:crypto";
import { digest, type RunScope } from "../../../src/research/contracts.js";
import type { RunSnapshot } from "../../../src/research/evidence/inspection.js";
import { Vault } from "../../../src/vault.js";
/** Public synthetic key. Never used for retained/operator evidence. */
export const syntheticArchiveKey = Buffer.alloc(32, 7);
export const syntheticScope: RunScope = {
  runId: "11111111-1111-4111-8111-111111111111",
  agentId: "22222222-2222-4222-8222-222222222222",
  turnId: "11111111-1111-4111-8111-111111111111",
  bindingId: "synthetic",
  taskId: "synthetic",
  operationId: "synthetic",
  operationEpoch: "1",
  manifestDigest: digest({ synthetic: true }),
};
export const syntheticEvent = {
  schemaVersion: "fleet.evidence/v1",
  id: "33333333-3333-4333-8333-333333333333",
  scope: syntheticScope,
  kind: "run.started",
  streamId: "run",
  sequence: "1",
  ordinal: "1",
  occurredAt: "2026-10-30T00:00:00.000Z",
  recordedAt: "2026-10-30T00:00:00.000Z",
  parentIds: [],
  attributes: {},
  artifacts: [],
  coverage: { status: "complete", expected: "1", recorded: "1", reasons: [] },
};
export const syntheticSnapshot: RunSnapshot = {
  version: "fleet.snapshot/v1",
  id: "44444444-4444-4444-8444-444444444444",
  runId: syntheticScope.runId,
  maximumOrdinal: "1",
  total: 1,
  createdAt: "2026-10-30T00:00:00.000Z",
  expiresAt: "2026-10-30T01:00:00.000Z",
  provenance: "compatibility",
  manifestDigest: syntheticScope.manifestDigest,
  manifest: null,
  manifestAvailability: "unavailable",
  scopes: [syntheticScope],
  coverage: {
    version: "fleet.coverage/v1",
    runId: syntheticScope.runId,
    status: "complete",
    expected: 0,
    recorded: 0,
    missing: [],
    eventCount: 1,
    byteCoverage: { expected: "0", recorded: "0", status: "complete" },
    reasons: [],
  },
  native: { allocations: [], commands: [] },
  metricDefinitions: [],
};
export function syntheticArchive(records: unknown[], counts = { events: 1, artifacts: 0, gaps: 0, bytes: "0" }) {
  const archiveId = "55555555-5555-4555-8555-555555555555",
    vault = new Vault(syntheticArchiveKey.toString("base64"));
  const raw = records.map((r) => `${JSON.stringify(r)}\n`),
    hash = createHash("sha256").update(raw.join("")).digest("hex");
  raw.push(JSON.stringify({ type: "footer", ...counts, records: records.length, digest: hash }) + "\n");
  return (
    JSON.stringify({ format: "fleet.archive/v1", encryption: "AES-256-GCM", archiveId }) +
    "\n" +
    raw
      .map(
        (r, index) =>
          JSON.stringify({
            index,
            cipher: vault.encrypt(Buffer.from(r).toString("base64"), `fleet-archive:v1:${archiveId}:${index}`),
          }) + "\n",
      )
      .join("")
  );
}
