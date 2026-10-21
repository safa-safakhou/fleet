import { afterEach, expect, it, vi } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { hostScopeFactory } from "../../src/app/host-services.js";
import { SkillExecutionStore } from "../../src/app/skill-execution.js";
import type { TaskClaim } from "../../src/platform/tasks.js";

afterEach(() => vi.restoreAllMocks());
it("never reuses an active operation's observation meter key when many other turns start", async () => {
  const keys: string[] = [];
  vi.spyOn(SkillExecutionStore.prototype, "hostWork").mockImplementation(async (turn, key) => {
    if (turn === "active") keys.push(key);
  });
  const factory = hostScopeFactory({
    store: {
      pool: { query: async () => ({ rows: [{ architecture_config: { skillMode: "guarded" } }] }) },
      architectures: builtinArchitectures(),
    },
    tasks: { get: async () => ({ participantId: "resources" }), check: async () => {} },
    bindings: {},
    model: {},
    commands: {},
  } as never);
  const claim = (id: string) =>
    ({
      bindingId: "binding",
      taskId: "task",
      turn: { id, cohortId: "cohort" },
      profile: { id: "autonomous-specialists", version: "1" },
    }) as TaskClaim;
  const active = claim("active");
  await factory.beforeConnect(active);
  await factory.beforeObserve(active);
  for (let i = 0; i < 1001; i++) await factory.beforeConnect(claim(`other:${i}`));
  await factory.beforeObserve(active);
  await factory.beforeObserve(active);
  expect(keys).toEqual(["bootstrap", "observation:1", "observation:2", "observation:3"]);
});
