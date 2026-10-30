import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { decodeEnvelope, encodeEnvelope } from "../../src/research/contracts.js";

const input = {
  protocolVersion: 1,
  counter: "9007199254740993",
  scope: {
    runId: "run",
    agentId: "agent",
    bindingId: "kingdom:alpha/7",
    turnId: "turn",
    taskId: "task",
    operationId: "op",
    operationEpoch: "1",
    manifestDigest: "a".repeat(64),
  },
  result: { status: "unknown", allocationId: "allocation", usage: null },
  coverage: { status: "partial", expected: "2", recorded: "1", reasons: ["PROVIDER_UNAVAILABLE"] },
};
test("round_trips_cross_language_fixture without rounding or inventing usage", () => {
  const bytes = encodeEnvelope(input);
  const decoded = decodeEnvelope(bytes);
  expect(decoded).toEqual(input);
  const result = JSON.parse(
    execFileSync(
      "uv",
      [
        "run",
        "--project",
        "workers/research",
        "--group",
        "dev",
        "python",
        "-m",
        "fleet_research.contracts",
        Buffer.from(bytes).toString("base64"),
      ],
      { encoding: "utf8" },
    ),
  );
  expect(result.json).toEqual(input);
  expect(decodeEnvelope(Buffer.from(result.binary, "base64"))).toEqual(input);
});
test("rejects unsupported protocol, unknown status and unsafe numeric counter", () => {
  for (const value of [
    { ...input, protocolVersion: 2 },
    { ...input, counter: Number.MAX_SAFE_INTEGER + 2 },
    { ...input, result: { status: "invented" } },
    { ...input, scope: { ...input.scope, participantId: 42 } },
  ])
    expect(() => encodeEnvelope(value)).toThrow();
});
test.each(["completed", "not_dispatched", "pending", "unknown"])("retains result status %s", (status) =>
  expect(decodeEnvelope(encodeEnvelope({ ...input, result: { status, usage: null } })).result?.status).toBe(status),
);
test.each(["complete", "partial", "unavailable", "withheld", "expired"])("retains coverage status %s", (status) =>
  expect(decodeEnvelope(encodeEnvelope({ ...input, coverage: { ...input.coverage, status } })).coverage?.status).toBe(
    status,
  ),
);
test("zero-valued present counters and optional fields survive binary normalization", () => {
  const value = {
    ...input,
    counter: "0",
    scope: { ...input.scope, operationEpoch: "0", participantId: "helper" },
    result: {
      status: "completed",
      usage: { inputTokens: "0", outputTokens: "0" },
      artifacts: [
        {
          id: "empty",
          contentType: "text/plain",
          bytes: "0",
          chunks: "0",
          ciphertextDigest: "f".repeat(64),
          privacyClass: "private",
          retentionClass: "30d",
        },
      ],
    },
    coverage: { status: "complete", expected: "0", recorded: "0", reasons: [] },
  };
  expect(decodeEnvelope(encodeEnvelope(value))).toEqual(value);
});
test("partially known usage retains the unknown field instead of inventing zero", () => {
  const value = {
    ...input,
    result: { status: "unknown", allocationId: "original", usage: { inputTokens: "7", outputTokens: null } },
  };
  const bytes = encodeEnvelope(value);
  expect(decodeEnvelope(bytes)).toEqual(value);
  const result = JSON.parse(
    execFileSync(
      "uv",
      [
        "run",
        "--project",
        "workers/research",
        "--group",
        "dev",
        "python",
        "-m",
        "fleet_research.contracts",
        Buffer.from(bytes).toString("base64"),
      ],
      { encoding: "utf8" },
    ),
  );
  expect(result.json).toEqual(value);
});
