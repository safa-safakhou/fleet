import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stopFailedCanaryTurn } from "../../src/platform/canary-stop.js";

it("latches the first failure before the worker admits more calls and preserves its original cause", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-canary-stop-")),
    file = join(root, "window.json");
  try {
    for (const code of ["WAIT", "COMMITTED", "BUDGET_EXHAUSTED"])
      expect(await stopFailedCanaryTurn(file, { state: "finished", code, unknown_usage: false })).toBe(false);
    expect(
      await stopFailedCanaryTurn(file, { state: "finished", code: "INVALID_MODEL_OUTPUT", unknown_usage: false }),
    ).toBe(true);
    await stopFailedCanaryTurn(file, { state: "needs_owner", code: "USAGE_UNKNOWN", unknown_usage: true });
    expect(JSON.parse(await readFile(`${file}.closed`, "utf8")).reason).toBe("CANARY_TURN_FAILED:INVALID_MODEL_OUTPUT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
