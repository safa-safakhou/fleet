export const cacheProfileFixture = {
  schemaVersion: "fleet.vllm-cache-profile.v1",
  providerVersion: "0.32.0",
  model: "nemotron-4b",
  endpoint: "http://127.0.0.1:18535/v1",
  instanceId: "synthetic-provider-instance",
  engineConfigSha256: "e".repeat(64),
  contextLength: 16384,
  maxNumSeqs: 4,
  prefixCaching: false,
  speculativeDecoding: false,
  poolBlocks: 57,
  nullBlocks: 1,
  safetyBlocks: 1,
  groups: [
    ...Array.from({ length: 6 }, () => ({ kind: "mamba" as const, mode: "none" as const, blocksPerRequest: 1 })),
    { kind: "full-attention" as const, blockTokens: 976 },
  ],
};
