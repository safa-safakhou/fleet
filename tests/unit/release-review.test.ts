import { expect, it } from "vitest";
import { reviewRelease } from "../../src/release-review.js";

const review = {
  schemaVersion: "fleet.release-review.v1",
  source: { gameCommit: "a".repeat(40), fleetCommit: "b".repeat(40), contractsDigest: "c".repeat(64) },
  compatibleContracts: true,
  migrationRehearsed: true,
  preservationVerified: true,
  retentionReviewed: true,
  rollbackRehearsed: true,
  quiescence: { modelCalls: 0, pendingCommands: 0, credentialOperations: 0, callbacks: 0, workersFenced: true },
  canaries: [
    {
      population: "server_luna_50",
      accountIds: ["00000000-0000-4000-8000-000000000001"],
      callLimit: 6,
      tokenLimit: 240000,
      deadline: "2026-10-15T12:00:00Z",
      minimumRounds: 3,
      sourceQualified: true,
      providerQualified: true,
    },
  ],
  ownerAuthorityResolved: true,
  deploymentAuthorized: true,
  pushAuthorized: false,
};
it("requires source compatibility, exact bounded canaries, all activity quiescence and explicit deployment authority", () => {
  expect(reviewRelease(review).readyForAuthorizedDeployment).toBe(true);
  expect(reviewRelease(review).pushAuthorized).toBe(false);
  for (const input of [
    { ...review, deploymentAuthorized: false },
    { ...review, ownerAuthorityResolved: false },
    { ...review, canaries: [] },
    { ...review, quiescence: { ...review.quiescence, credentialOperations: 1 } },
    { ...review, quiescence: { ...review.quiescence, callbacks: 1 } },
    { ...review, quiescence: { ...review.quiescence, pendingCommands: 1 } },
    { ...review, canaries: [{ ...review.canaries[0], providerQualified: false }] },
  ])
    expect(reviewRelease(input).readyForAuthorizedDeployment).toBe(false);
  expect(() => reviewRelease({ ...review, canaries: [{ ...review.canaries[0], minimumRounds: 1 }] })).toThrow();
});
