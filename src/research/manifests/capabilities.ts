import type { CapabilityFingerprint, RunManifestInput } from "./compiler.js";
/** Trusted composition supplies reviewed descriptors. No probing or model/game IO. */
export type ResearchCapabilityResolver = (input: RunManifestInput) => CapabilityFingerprint | undefined;
