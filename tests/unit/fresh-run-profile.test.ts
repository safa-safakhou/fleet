import { expect, it } from "vitest";
import { freshRunProfiles, localInferenceLimits } from "../../scripts/lib/fresh-run-profile.js";

it("keeps retained defaults and gives an explicit larger local context a full usage reservation", () => {
  expect(localInferenceLimits(undefined, true)).toMatchObject({
    inputByteLimit: 64000,
    maxOutputTokens: 8192,
    perCallTokenLimit: 40000,
  });
  expect(localInferenceLimits(undefined, false)).toMatchObject({ inputByteLimit: 32000, maxOutputTokens: 1536 });
  expect(
    localInferenceLimits({ contextWindowTokens: 65536, inputByteLimit: 128000, maxOutputTokens: 8192 }, true),
  ).toEqual({ contextWindowTokens: 65536, inputByteLimit: 128000, maxOutputTokens: 8192, perCallTokenLimit: 65536 });
  expect(() =>
    localInferenceLimits({ contextWindowTokens: 8192, inputByteLimit: 128000, maxOutputTokens: 8192 }, true),
  ).toThrow();
  expect(() =>
    localInferenceLimits({ contextWindowTokens: 262145, inputByteLimit: 128000, maxOutputTokens: 8192 }, true),
  ).toThrow();
});

it("gives the fresh Codex comparison its own exact one-hour boundary", () => {
  expect(freshRunProfiles["start-codex-1h"]).toEqual({
    purpose: "fresh-codex-one-hour",
    durationMs: 3600000,
    exploratory: true,
    scope: "approved-fresh-codex-one-hour",
  });
});

it("bounds the fresh half-hour run independently of the six-hour experiment", () => {
  expect(freshRunProfiles["start-30m"]).toEqual({
    purpose: "fresh-half-hour",
    durationMs: 30 * 60 * 1000,
    exploratory: true,
    scope: "approved-fresh-half-hour",
  });
  expect(freshRunProfiles["start-6h"].durationMs).toBe(6 * 60 * 60 * 1000);
  expect(freshRunProfiles["start-canary"].exploratory).toBe(false);
  expect(freshRunProfiles["start-24h"].exploratory).toBe(false);
});
