import { expect, it } from "vitest";
import { freshRunProfiles } from "../../scripts/lib/fresh-run-profile.js";

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
