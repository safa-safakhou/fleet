import { expect, it } from "vitest";
import { adapterDigest, qualifyProfile } from "../../src/qualification.js";
import { boardEnvironment } from "../fixtures/environments/board.js";
import { evidence } from "../fixtures/profile-evidence.js";

const profile = { id: "reactive-basic", version: "1" };
function setup() {
  const board = boardEnvironment();
  board.adapter.capabilities.events = "poll";
  return board;
}
it("separates offline and real-provider qualification without connecting or inferring", () => {
  const b = setup(),
    fake = evidence(b.adapter, profile),
    real = evidence(b.adapter, profile, "real_provider");
  expect(qualifyProfile(profile, b.adapter, [fake])).toMatchObject({
    offlinePassed: true,
    liveQualified: false,
    missing: ["real_provider"],
  });
  expect(qualifyProfile(profile, b.adapter, [fake, real])).toMatchObject({
    offlinePassed: true,
    liveQualified: true,
    missing: [],
  });
  expect(qualifyProfile(profile, b.adapter, [real]).liveQualified).toBe(false);
  expect(b.connections).toBe(0);
  expect(b.executions).toBe(0);
});
it("requires complete passing coverage, source refs and actual output validation, never passed alone", () => {
  const b = setup(),
    fake = evidence(b.adapter, profile);
  for (const changed of [
    { ...fake, passed: false },
    { ...fake, sourceRefs: [] },
    { ...fake, coverage: { ...fake.coverage, checks: {} } },
    { ...fake, coverage: { ...fake.coverage, outputs: [] } },
    {
      ...fake,
      coverage: {
        ...fake.coverage,
        outputs: [
          {
            schema: { type: "object", required: ["missing"] },
            messages: [],
            output: {},
            expectedValid: true,
            limit: 24000,
          },
        ],
      },
    },
    {
      ...fake,
      coverage: {
        ...fake.coverage,
        outputs: [{ schema: { type: "invalid-type" }, messages: [], output: {}, expectedValid: true, limit: 24000 }],
      },
    },
    {
      ...fake,
      coverage: {
        ...fake.coverage,
        outputs: [
          { schema: { type: "object" }, messages: ["x".repeat(25000)], output: {}, expectedValid: false, limit: 24000 },
        ],
      },
    },
  ])
    expect(qualifyProfile(profile, b.adapter, [changed]).offlinePassed).toBe(false);
});
it("rejects incompatible capabilities, unknown profiles, foreign adapter and stale descriptor evidence", () => {
  const b = setup(),
    fake = evidence(b.adapter, profile);
  expect(qualifyProfile({ ...profile, version: "2" }, b.adapter, [fake]).missing).toContain("unsupported_profile");
  expect(
    qualifyProfile(profile, b.adapter, [{ ...fake, environment: { ...fake.environment, id: "foreign" } }])
      .offlinePassed,
  ).toBe(false);
  b.adapter.capabilities.events = "none";
  expect(qualifyProfile(profile, b.adapter, [fake]).missing).toContain("UNSUPPORTED_CAPABILITY");
  b.adapter.capabilities.events = "poll";
  b.adapter.capabilities.social = true;
  expect(qualifyProfile(profile, b.adapter, [fake]).missing).toContain("adapter_digest");
});
it("does not pool configurations, source revisions, instances, routes, failures or partial records", () => {
  const b = setup(),
    fake = evidence(b.adapter, profile),
    real = evidence(b.adapter, profile, "real_provider");
  for (const other of [
    { ...real, environment: { ...real.environment, instanceId: "other" } },
    { ...real, coverage: { ...real.coverage, configurationDigest: "e".repeat(64) } },
    { ...real, coverage: { ...real.coverage, fleetCommit: "e".repeat(40) } },
    { ...real, coverage: { ...real.coverage, environmentCommit: "e".repeat(40) } },
    {
      ...real,
      coverage: {
        ...real.coverage,
        provider: { route: "other", model: "other", settingsDigest: "e".repeat(64), checks: {} },
      },
    },
  ])
    expect(qualifyProfile(profile, b.adapter, [fake, real, other]).liveQualified).toBe(false);
  expect(qualifyProfile(profile, b.adapter, [fake, real, { ...real, passed: false }]).liveQualified).toBe(false);
  expect(adapterDigest(b.adapter)).toBe(
    adapterDigest({
      ...b.adapter,
      schemas: { actions: [...b.adapter.schemas.actions], observations: [...b.adapter.schemas.observations] },
    }),
  );
});
