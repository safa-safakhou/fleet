/** Operator-selected windows. Actor text cannot extend these limits. */
export const freshRunProfiles = {
  "start-canary": {
    purpose: "real-workflow-canary",
    durationMs: 900000,
    exploratory: false,
    scope: "bounded-real-canary",
  },
  "start-30m": {
    purpose: "fresh-half-hour",
    durationMs: 1800000,
    exploratory: true,
    scope: "approved-fresh-half-hour",
  },
  "start-6h": { purpose: "fresh-six-hour", durationMs: 21600000, exploratory: true, scope: "approved-fresh-six-hour" },
  "start-24h": { purpose: "fresh-24h", durationMs: 86400000, exploratory: false, scope: "approved-24h" },
} as const;
