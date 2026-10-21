import { designDigest } from "../../src/negotiation-plan.js";
/** Hash the exact settings written into this artifact, including stage overrides. */
export function packageSelectionMetadata(input: {
  sources: { fleet: string; pact: string };
  pins: { relativePath: string; bytes: number; sha256: string }[];
  model: unknown;
  policy: unknown;
  settings: unknown;
}) {
  const bundleDigest = designDigest(input.pins);
  return {
    schemaVersion: "fleet.owned-negotiation-bundle.v1",
    sources: input.sources,
    pins: input.pins,
    bundleDigest,
    modelDigest: designDigest(input.model),
    policyDigest: designDigest(input.policy),
    settingsDigest: designDigest({ settings: input.settings, bundleDigest }),
  };
}
