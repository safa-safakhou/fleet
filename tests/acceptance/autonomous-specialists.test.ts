import { afterEach, expect, it } from "vitest";
import { LaunchService } from "../../src/platform/launch.js";
import { launchFixture } from "../fixtures/architecture-launch.js";
import { enableBoardEffects } from "../fixtures/environments/specialist-board.js";

let f: Awaited<ReturnType<typeof launchFixture>>;
afterEach(async () => {
  await f?.close();
});
it("keeps guarded mode unavailable on a foreign adapter without reviewed primitives even with finite limits", async () => {
  f = await launchFixture();
  enableBoardEffects(f.board, f.now);
  f.board.adapter.specialistPresets = [
    {
      id: "resources-diplomacy",
      roles: [
        {
          charter: {
            id: "resources",
            revision: 1,
            responsibility: "Owned fixture",
            priority: 0,
            allowedActions: [],
            maxActiveGoals: 8,
          },
          subscriptions: { categories: ["resource"], periodic: true, version: "1" },
        },
      ],
    },
  ];
  const launcher = new LaunchService(f.store, f.tasks, f.environments, f.architectures, { liveAllowed: false }),
    spec = {
      ...f.spec,
      architecture: { id: "autonomous-specialists", version: "1" },
      architectureConfig: { preset: "resources-diplomacy", maxActiveGoals: 8, memoryBytes: 6000, skillMode: "guarded" },
    };
  expect((await launcher.check(spec)).checks.some((c) => c.code === "PARENT_WORK_LIMITS_REQUIRED")).toBe(true);
  const bounded = { ...spec, nonModelLimits: { reads: 20, actions: 1, messages: 0, steps: 50, wallTimeMs: 60000 } };
  expect((await launcher.check(bounded)).checks.some((c) => c.code === "GUARDED_SKILLS_UNSUPPORTED")).toBe(true);
  expect(f.board.connections).toBe(0);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
