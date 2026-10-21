import { expect, it } from "vitest";
import { packageSelectionMetadata } from "../../scripts/lib/negotiation-package-metadata.js";
import { specialistPackageSettings } from "../../scripts/lib/specialist-package.js";
import { designDigest } from "../../src/negotiation-plan.js";

it("binds the written KQ1 settings rather than the inherited negotiation settings", () => {
  const original = {
    controller: {},
    provider: { request: {}, childEnvironment: {} },
    leases: {},
    budget: { calls: 144 },
  };
  const settings = specialistPackageSettings(original);
  const metadata = packageSelectionMetadata({
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    pins: [{ relativePath: "execution-settings.json", bytes: 12, sha256: "c".repeat(64) }],
    model: { model: "pinned" },
    policy: { stage: "KQ1" },
    settings,
  });
  const writtenSettings = JSON.parse(JSON.stringify(settings));
  expect(metadata.settingsDigest).toBe(
    designDigest({ settings: writtenSettings, bundleDigest: metadata.bundleDigest }),
  );
  expect(metadata.settingsDigest).not.toBe(designDigest({ settings: original, bundleDigest: metadata.bundleDigest }));
  expect(metadata.modelDigest).toBe(designDigest({ model: "pinned" }));
  expect(metadata.policyDigest).toBe(designDigest({ stage: "KQ1" }));
});
