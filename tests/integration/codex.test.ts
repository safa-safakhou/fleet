import { access, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CodexModel } from "../../src/codex.js";
import { codexFixture } from "../codex-fixture.js";
import { budget, FakeGame, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup(mode = "ok") {
  const f = await fixture(),
    cli = await codexFixture(mode);
  cleanup = async () => {
    await f.pool.end();
    await rm(cli.root, { recursive: true, force: true });
  };
  const id = await ready(f.store, 2);
  await f.store.setState(id, "paused", true);
  await f.store.configure(id, {
    model: { route: "codex-cli", model: "synthetic-model" },
    budget: { ...budget, concurrency: 1, executionAccountingAccepted: true },
  });
  await f.store.setState(id, "running", true);
  const claim = await f.store.claim("fixture");
  if (!claim) throw Error("missing claim");
  const game = new FakeGame(claim),
    model = new CodexModel(cli);
  return { ...f, cli, id, claim, game, model, engine: new Engine(f.store, model, async () => game, true) };
}
describe("Codex scheduling and accounting", () => {
  it("requires explicit execution accounting consent and serial cohort admission", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 1);
    await f.store.setState(id, "paused", true);
    const model = { route: "codex-cli", model: "synthetic" };
    await expect(f.store.configure(id, { model, budget })).rejects.toThrow("CODEX_EXECUTION_BUDGET_REQUIRED");
    await expect(
      f.store.configure(id, { model, budget: { ...budget, executionAccountingAccepted: true } }),
    ).rejects.toThrow("CODEX_EXECUTION_BUDGET_REQUIRED");
    await f.store.configure(id, { model, budget: { ...budget, concurrency: 1, executionAccountingAccepted: true } });
    expect((await f.store.cohort(id)).state).toBe("paused");
  });
  it("records a structured wait and measured execution usage through the real subprocess adapter", async () => {
    const f = await setup();
    await f.engine.run(f.claim);
    const state = await f.store.publicState();
    expect(state.turns[0].code).toBe("WAIT");
    expect(state.turns[0].calls).toBe(1);
    expect(state.usage[0].allocated_tokens).toBe("40000");
    expect(state.usage[0].input_tokens).toBe("123");
    expect(state.usage[0].output_tokens).toBe("45");
    expect(state.usage[0].unknown_calls).toBe(0);
    expect(f.game.submits).toHaveLength(0);
  });
  it("executes CLI decisions only through authenticated game controller receipts", async () => {
    const f = await setup("action");
    await f.engine.run(f.claim);
    expect(f.game.submits).toHaveLength(3);
    expect((await f.store.publicState()).turns[0].actions).toBe(3);
    expect((await f.store.publicState()).turns[0].code).toBe("COMMITTED");
  });
  it.each(["overrun", "unknown", "fail", "api"])("pauses the whole cohort before committing on %s", async (mode) => {
    const f = await setup(mode);
    await f.engine.run(f.claim);
    const state = await f.store.publicState();
    expect((await f.store.cohort(f.id)).state).toBe("paused");
    expect(f.game.submits).toHaveLength(0);
    expect(state.usage[0].allocated_tokens).toBe(mode === "overrun" ? "45045" : "40000");
    expect(state.usage[0].unknown_calls).toBe(mode === "overrun" ? 0 : 1);
    if (mode === "overrun" || mode === "unknown") {
      expect(state.turns[0].code).toBe(mode === "overrun" ? "USAGE_EXCEEDED" : "USAGE_UNKNOWN");
    }
    f.advance(900000);
    expect(await f.store.claim("later")).toBe(null);
  });
  it("disabled execution dispatches neither authentication checks nor game reads", async () => {
    const f = await setup();
    let connects = 0;
    const engine = new Engine(
      f.store,
      f.model,
      async () => {
        connects++;
        return f.game;
      },
      false,
    );
    expect(await engine.tick("disabled")).toBe(null);
    expect(connects).toBe(0);
    await expect(access(join(f.cli.home, "invocations"))).rejects.toThrow();
  });
  it("crashed workers retain reservations and pause every other owner in the cohort", async () => {
    const f = await setup();
    await f.store.reserveCall(f.claim);
    f.advance(121000);
    expect(await f.store.claim("replacement")).toBe(null);
    expect((await f.store.cohort(f.id)).state).toBe("paused");
    expect((await f.store.publicState()).usage[0].unknown_calls).toBe(1);
  });
  it("late overrun usage preserves permanently stopped cohorts", async () => {
    const f = await setup(),
      reservation = await f.store.reserveCall(f.claim);
    await f.store.setState(f.id, "stopped", true);
    await f.store.recordUsage(reservation, 45000, 45);
    await f.store.finish(f.claim, "CODEX_CANCELLED");
    expect((await f.store.cohort(f.id)).state).toBe("stopped");
  });
  it("crash recovery respects the original finite deadline as terminal", async () => {
    const f = await setup();
    await f.store.reserveCall(f.claim);
    f.advance(25 * 3600000);
    expect(await f.store.claim("after-deadline")).toBe(null);
    expect((await f.store.cohort(f.id)).state).toBe("finished");
    await expect(f.store.setState(f.id, "running", true)).rejects.toThrow("TERMINAL_COHORT");
  });
  it("pause cancels CLI work and prevents game writes", async () => {
    const f = await setup("sleep"),
      pending = f.engine.run(f.claim);
    for (let i = 0; i < 100; i++) {
      try {
        await access(join(f.cli.home, "child"));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    await f.store.setState(f.id, "paused", true);
    await pending;
    expect(f.game.submits).toHaveLength(0);
    expect((await f.store.publicState()).usage[0].unknown_calls).toBe(1);
    // Leave an ordinary fixture file to assert the directory remains usable, not a copied auth cache.
    await writeFile(join(f.cli.home, "mode"), "ok");
    await expect(access(join(f.cli.home, "fleet-execution.lock"))).rejects.toThrow();
  });
});
