import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { GamePort, ModelPort } from "../../src/domain.js";
import { RunWindow } from "../../src/run-window.js";

const dirs: string[] = [];
function fixture(state: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "fleet-window-"));
  dirs.push(dir);
  const file = join(dir, "window.json");
  writeFileSync(file, JSON.stringify(state));
  return { file, window: new RunWindow(file, () => 1000) };
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it("is disarmed for missing, malformed, prepared and closed files", () => {
  for (const state of [{}, { status: "prepared" }, { status: "closed" }]) {
    const { window } = fixture(state);
    expect(window.isOpen()).toBe(false);
    expect(() => window.assertOpen()).toThrow();
  }
  expect(new RunWindow("/nonexistent/fleet-run-window").isOpen()).toBe(false);
});
it("supports an explicit 24-hour window and closes at its exact cutoff", () => {
  const end = 1000 + 86_400_000;
  const { file } = fixture({ status: "running", startsAt: 1000, endsAt: end });
  expect(new RunWindow(file, () => 1000).isOpen()).toBe(true);
  expect(new RunWindow(file, () => end - 1).isOpen()).toBe(true);
  expect(new RunWindow(file, () => end).isOpen()).toBe(false);
  expect(new RunWindow(file, () => 999).isOpen()).toBe(false);
  writeFileSync(file, JSON.stringify({ status: "running", startsAt: 1000, endsAt: end + 1 }));
  expect(new RunWindow(file, () => 1000).isOpen()).toBe(false);
});
it("supports the separately authorized 15-minute canary without changing its closed boundaries", () => {
  const { file } = fixture({ status: "running", startsAt: 1000, endsAt: 901000 });
  expect(new RunWindow(file, () => 1000).isOpen()).toBe(true);
  expect(new RunWindow(file, () => 901000).isOpen()).toBe(false);
});
it("a durable cutoff marker prevents a stale writer from reopening admission", () => {
  const { file } = fixture({ status: "running", startsAt: 1000, endsAt: 901000 });
  const window = new RunWindow(file, () => 2000);
  expect(window.isOpen()).toBe(true);
  writeFileSync(`${file}.closed`, JSON.stringify({ reason: "CLOCK_DISAGREEMENT" }));
  expect(window.isOpen()).toBe(false);
  writeFileSync(file, JSON.stringify({ status: "running", startsAt: 1000, endsAt: 901000 }));
  expect(window.isOpen()).toBe(false);
});
it("admits only the exact shared hour, without counting requests", () => {
  const { file } = fixture({ status: "running", startsAt: 1000, endsAt: 3601000 });
  const window = new RunWindow(file, () => 1000);
  for (let i = 0; i < 2000; i++) window.assertOpen();
  expect(new RunWindow(file, () => 999).isOpen()).toBe(false);
  expect(new RunWindow(file, () => 3601000).isOpen()).toBe(false);
  writeFileSync(file, JSON.stringify({ status: "running", startsAt: 1000, endsAt: 3601001 }));
  expect(window.isOpen()).toBe(false);
});
it("blocks model dispatch and game submissions but allows original receipt recovery", async () => {
  const { window } = fixture({ status: "prepared" });
  let calls = 0;
  const model: ModelPort = {
    tracksDispatch: true,
    async decide() {
      calls++;
      throw Error("unexpected");
    },
  };
  await expect(window.model(model).decide({} as Parameters<ModelPort["decide"]>[0])).rejects.toThrow();
  const game = window.game({
    async submit() {
      calls++;
      return {};
    },
    async receipt() {
      return { code: "COMMITTED" };
    },
  } as unknown as GamePort);
  await expect(game.submit("id", {})).rejects.toThrow();
  expect(await game.receipt("id")).toEqual({ code: "COMMITTED" });
  expect(calls).toBe(0);
});
it("admits a half-hour window and refuses dispatch at its exact cutoff", async () => {
  let now = 1000;
  const { file } = fixture({ status: "running", startsAt: 1000, endsAt: 1801000 });
  const window = new RunWindow(file, () => now);
  expect(window.isOpen()).toBe(true);
  now = 1800999;
  window.assertOpen();
  now = 1801000;
  expect(window.isOpen()).toBe(false);
  await expect(window.game({} as GamePort).submit("id", {})).rejects.toThrow("RUN_WINDOW_CLOSED");
  now = 1000;
  for (const endsAt of [1000, 999, 1800999, 1801001, 3601001]) {
    writeFileSync(file, JSON.stringify({ status: "running", startsAt: 1000, endsAt }));
    expect(window.isOpen()).toBe(false);
  }
});
it("checks again at actual provider dispatch and does not abort a dispatched response", async () => {
  let now = 1000;
  const { file } = fixture({ status: "running", startsAt: 1000, endsAt: 3601000 });
  const window = new RunWindow(file, () => now);
  const model: ModelPort = {
    tracksDispatch: true,
    async decide(input) {
      now = 3601000;
      await input.onDispatch?.();
      throw Error("must not dispatch");
    },
  };
  await expect(window.model(model).decide({} as Parameters<ModelPort["decide"]>[0])).rejects.toMatchObject({
    notDispatched: true,
  });
  now = 1000;
  const late: ModelPort = {
    async decide(input) {
      await input.onDispatch?.();
      now = 3601000;
      return { decision: { kind: "wait" }, inputTokens: 10, outputTokens: 1 };
    },
  };
  expect((await window.model(late).decide({} as Parameters<ModelPort["decide"]>[0])).inputTokens).toBe(10);
  expect(window.isOpen()).toBe(false);
});
it("blocks helper generation while disarmed and leaves ordinary runtime unchanged", async () => {
  const { window } = fixture({ status: "prepared" });
  let calls = 0;
  const recall = {
    async choose() {
      calls++;
      return { id: "a", probability: 1, certificate: "test" };
    },
  };
  await expect(window.recall(recall).choose("query", [], new AbortController().signal)).rejects.toThrow();
  expect(calls).toBe(0);
  expect(new RunWindow().isOpen()).toBe(true);
});
it("admits an explicitly six-hour window and closes at its exact boundary", () => {
  const start = 1000,
    end = start + 21600000,
    { file } = fixture({ status: "running", startsAt: start, endsAt: end });
  expect(new RunWindow(file, () => start).isOpen()).toBe(true);
  expect(new RunWindow(file, () => end - 1).isOpen()).toBe(true);
  expect(new RunWindow(file, () => end).isOpen()).toBe(false);
});
