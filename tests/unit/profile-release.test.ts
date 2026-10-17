import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { reviewProfileRelease } from "../../src/release-review.js";
import { boardEnvironment } from "../fixtures/environments/board.js";
import { evidence } from "../fixtures/profile-evidence.js";

function manifest() {
  const { adapter } = boardEnvironment();
  adapter.capabilities.events = "poll";
  const profile = { id: "reactive-basic", version: "1" },
    fake = evidence(adapter, profile),
    real = evidence(adapter, profile, "real_provider");
  return {
    schemaVersion: "fleet.profile-release.v1",
    reviewedAt: "2026-10-17T12:00:00Z",
    runAuthorized: true,
    dependencyAuditPassed: true,
    release: {
      schemaVersion: "fleet.release-review.v1",
      source: { gameCommit: "b".repeat(40), fleetCommit: "a".repeat(40), contractsDigest: "f".repeat(64) },
      compatibleContracts: true,
      migrationRehearsed: true,
      preservationVerified: true,
      retentionReviewed: true,
      rollbackRehearsed: true,
      quiescence: { modelCalls: 0, pendingCommands: 0, credentialOperations: 0, callbacks: 0, workersFenced: true },
      ownerAuthorityResolved: true,
      deploymentAuthorized: true,
      pushAuthorized: false,
    },
    runs: [
      {
        profile,
        environment: fake.environment,
        adapter: { ref: adapter.ref, schemas: adapter.schemas, capabilities: adapter.capabilities },
        configurationDigest: "c".repeat(64),
        provider: { route: "fixture-route", model: "fixture-model", settingsDigest: "d".repeat(64) },
        actors: [{ cohortId: "00000000-0000-4000-8000-000000000001", actorRef: "opaque/player:1" }],
        callLimit: 6,
        tokenLimit: 240000,
        perCallTokenLimit: 40000,
        concurrency: 1,
        startsAt: "2026-10-17T13:00:00Z",
        deadline: "2026-10-17T14:00:00Z",
        minimumRounds: 3,
        stopConditions: ["unknown_usage", "pending_command", "authorization_loss", "deadline", "budget"],
        monitoringRefs: ["operator:canary-watch"],
        evidence: [fake, real],
      },
    ],
  };
}
it("composes preservation review with exact environment/configuration/provider qualification and bounded selection", () => {
  const m = manifest(),
    result = reviewProfileRelease(m);
  expect(result.readyForAuthorizedDeployment).toBe(true);
  expect(result.executionEnabled).toBe(true);
  expect(result.pushAuthorized).toBe(false);
  expect(reviewProfileRelease({ ...m, runs: [] }).executionEnabled).toBe(false);
  for (const key of [
    "compatibleContracts",
    "migrationRehearsed",
    "preservationVerified",
    "retentionReviewed",
    "rollbackRehearsed",
    "ownerAuthorityResolved",
    "deploymentAuthorized",
  ])
    expect(reviewProfileRelease({ ...m, release: { ...m.release, [key]: false } }).executionEnabled).toBe(false);
  expect(reviewProfileRelease({ ...m, runAuthorized: false }).executionEnabled).toBe(false);
  expect(reviewProfileRelease({ ...m, dependencyAuditPassed: false }).blockers).toContain("dependency_audit");
  expect(
    reviewProfileRelease({
      ...m,
      release: { ...m.release, quiescence: { ...m.release.quiescence, pendingCommands: 1 } },
    }).executionEnabled,
  ).toBe(false);
});
it("retains qualification, source, clock, route and duplicate-identity blockers", () => {
  const m = manifest(),
    r = m.runs[0];
  for (const run of [
    { ...r, evidence: [r.evidence[0]] },
    { ...r, configurationDigest: "e".repeat(64) },
    { ...r, provider: { ...r.provider, model: "other" } },
    { ...r, environment: { ...r.environment, instanceId: "other" } },
    { ...r, startsAt: "2026-10-17T11:00:00Z" },
    { ...r, deadline: r.startsAt },
    { ...r, stopConditions: ["budget"] },
  ])
    expect(reviewProfileRelease({ ...m, runs: [run] }).executionEnabled).toBe(false);
  expect(
    reviewProfileRelease({
      ...m,
      release: { ...m.release, source: { ...m.release.source, fleetCommit: "e".repeat(40) } },
    }).executionEnabled,
  ).toBe(false);
  expect(reviewProfileRelease({ ...m, runs: [r, r] }).blockers).toContain("duplicate_run_identity");
  expect(() => reviewProfileRelease({ ...m, runs: [{ ...r, callLimit: 0 }] })).toThrow();
});

it("keeps the saved release proposal disarmed with no selected cohorts or providers", async () => {
  const manifest = JSON.parse(await readFile("docs/multi-engine-release-manifest-20261017.json", "utf8"));
  expect(manifest.runs).toEqual([]);
  expect(manifest.dependencyAuditPassed).toBe(true);
  const review = reviewProfileRelease(manifest);
  expect(review.executionEnabled).toBe(false);
  expect(review.readyForAuthorizedDeployment).toBe(false);
  expect(review.pushAuthorized).toBe(false);
  expect(review.blockers).not.toContain("dependency_audit");
  expect(reviewProfileRelease({ ...manifest, dependencyAuditPassed: false }).blockers).toContain("dependency_audit");
  expect(review.blockers).toEqual(
    expect.arrayContaining([
      "exact_run_proposal",
      "run_authorization",
      "rollbackRehearsed",
      "ownerAuthorityResolved",
      "deploymentAuthorized",
      "quiescence",
    ]),
  );
});
