import { expect, it } from "vitest";
import { qualifyProfile } from "../../src/qualification.js";
import { boardEnvironment } from "../fixtures/environments/board.js";
import { enableBoardEffects } from "../fixtures/environments/specialist-board.js";
import { evidence } from "../fixtures/profile-evidence.js";

it("requires guarded/recovery/work/cost coverage for the skill family without changing old profile requirements", () => {
  const board = boardEnvironment();
  board.adapter.capabilities.events = "native";
  enableBoardEffects(board, () => new Date("2026-10-21T00:00:00Z"));
  const profile = { id: "autonomous-specialists", version: "1" },
    full = evidence(board.adapter, profile);
  expect(qualifyProfile(profile, board.adapter, [full]).offlinePassed).toBe(true);
  const partial = structuredClone(full);
  delete (partial.coverage.checks as Record<string, boolean>).skillsGuarded;
  expect(qualifyProfile(profile, board.adapter, [partial])).toMatchObject({
    offlinePassed: false,
    liveQualified: false,
  });
  expect(qualifyProfile(profile, board.adapter, [partial]).missing).toContain("coverage:skillsGuarded");
  const old = { id: "reactive-basic", version: "1" };
  partial.profile = old;
  expect(qualifyProfile(old, board.adapter, [partial]).offlinePassed).toBe(true);
});
