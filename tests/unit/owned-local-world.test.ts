import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  assertOwnedConfiguration,
  mayWaitForOwnedExit,
  type OwnedWorldConfig,
  ownedEventPublisher,
  requiredOwnedProcesses,
  sameProcess,
  startOwnedProcess,
  stopOwnedProcess,
} from "../../scripts/lib/owned-local-world.js";

const fleetRepo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
it("requires the native publisher for event-enabled runs and disables external notification delivery locally", () => {
  const c = fixture();
  c.fleetEnv.FLEET_PACT_EVENT_FEED_VERSION = "pact.agent-events.v1";
  expect(() => requiredOwnedProcesses(c)).toThrow("EVENT_PUBLISHER_REQUIRED");
  c.pactEnv.PACT_AGENT_EVENTS_ENABLED = "1";
  c.pactEnv.SMTP_URL = "smtp://synthetic.invalid";
  expect(requiredOwnedProcesses(c)).toContain("pact-events");
  expect(ownedEventPublisher(c)).toMatchObject({
    name: "pact-events",
    kind: "pact",
    args: ["workers/notification/dist/main.js"],
    env: { SMTP_URL: "", WEB_PUSH_PUBLIC_KEY: "", WEB_PUSH_PRIVATE_KEY: "", WEB_PUSH_SUBJECT: "" },
  });
});
it("waits through an empty-command exit transition only for the already-verified same process", () => {
  const saved = {
    root: "/private/owned",
    pid: 123,
    startTicks: "42",
    cwd: fleetRepo,
    commandSha256: "original",
    name: "worker",
  };
  const exiting = { startTicks: "42", cwd: fleetRepo, commandSha256: createHash("sha256").digest("hex"), state: "R" };
  expect(mayWaitForOwnedExit(saved, exiting, saved.root)).toBe(true);
  for (const current of [
    { ...exiting, startTicks: "43" },
    { ...exiting, cwd: "/foreign" },
    { ...exiting, commandSha256: "changed-command" },
  ])
    expect(mayWaitForOwnedExit(saved, current, saved.root)).toBe(false);
  expect(mayWaitForOwnedExit(saved, exiting, "/foreign")).toBe(false);
});
it("concurrent park requests signal the exact owned process only once", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "fleet-owned-stop-"));
  const c = { ...fixture(), root };
  await mkdir(resolve(root, "logs"));
  const received = resolve(root, "signals");
  const ready = resolve(root, "ready");
  try {
    await startOwnedProcess(c, "test-process", "fleet", [
      "-e",
      `const fs=require('node:fs');process.on('SIGTERM',()=>{fs.appendFileSync(${JSON.stringify(received)},'stop\\n');setTimeout(()=>process.exit(0),100)});fs.writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)`,
    ]);
    for (let i = 0; i < 100; i++) {
      if (await readFile(ready, "utf8").catch(() => "")) break;
      await new Promise((done) => setTimeout(done, 10));
    }
    expect(await readFile(ready, "utf8")).toBe("ready");
    await Promise.all([stopOwnedProcess(c, "test-process"), stopOwnedProcess(c, "test-process")]);
    expect(await readFile(received, "utf8")).toBe("stop\n");
  } finally {
    await stopOwnedProcess(c, "test-process", true);
    await rm(root, { recursive: true, force: true });
  }
});
function fixture(): OwnedWorldConfig {
  const id = "fresh-canary-20261025-12345678",
    root = `/tmp/${id}`;
  return {
    schemaVersion: "pact.fresh-24h.v1",
    id,
    root,
    node: process.execPath,
    fleetRepo,
    pactRepo: resolve(fleetRepo, "../pact"),
    postgresImage: "synthetic",
    pactContainer: `${id}-pact-db`,
    fleetContainer: `${id}-fleet-db`,
    pactEnv: {
      DATABASE_URL: "postgres://fixture:synthetic@127.0.0.1:32111/pact",
      PACT_ORIGIN: "http://127.0.0.1:32112",
    },
    fleetEnv: {
      DATABASE_URL: "postgres://fixture:synthetic@127.0.0.1:32113/fleet",
      FLEET_ORIGIN: "http://127.0.0.1:32114",
      FLEET_ENVIRONMENT_INSTANCE: id,
      FLEET_RUN_WINDOW_FILE: `${root}/window.json`,
    },
    model: {
      endpoint: "http://127.0.0.1:32115/v1",
      servedName: "nemotron-4b",
      repository: "nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16",
      revision: "dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f",
    },
  };
}
it("accepts only the separate pinned Codex comparison without relaxing old Nemotron ownership", () => {
  const c = fixture();
  c.purpose = "fresh-codex-one-hour";
  c.model = {
    route: "codex-cli",
    servedName: "gpt-6.1-terra",
    endpoint: "codex://local",
    repository: "openai",
    revision: "gpt-6.1-terra",
    contextWindowTokens: 500000,
  };
  c.fleetEnv.FLEET_CODEX_EXECUTABLE = "/private/native/codex";
  c.fleetEnv.FLEET_CODEX_HOME = `${c.root}/provider/home`;
  expect(() => assertOwnedConfiguration(c, c.root)).not.toThrow();
  for (const changes of [
    { purpose: "fresh-half-hour" },
    { model: { ...c.model, servedName: "another" } },
    { model: { ...c.model, contextWindowTokens: 128000 } },
    { fleetEnv: { ...c.fleetEnv, FLEET_CODEX_HOME: "/shared/interactive-home" } },
  ]) {
    expect(() => assertOwnedConfiguration({ ...c, ...changes }, c.root)).toThrow();
  }
});
it("rejects retained/default databases, mismatched ownership, public routes and any other model", () => {
  const good = fixture();
  expect(() => assertOwnedConfiguration(good, good.root)).not.toThrow();
  for (const mutate of [
    (c: OwnedWorldConfig) => {
      c.pactEnv.DATABASE_URL = "postgres://fixture:synthetic@127.0.0.1:5432/pact";
    },
    (c: OwnedWorldConfig) => {
      c.fleetContainer = "retained-db";
    },
    (c: OwnedWorldConfig) => {
      c.fleetEnv.FLEET_ENVIRONMENT_INSTANCE = "another";
    },
    (c: OwnedWorldConfig) => {
      c.pactEnv.PACT_ORIGIN = "https://example.test";
    },
    (c: OwnedWorldConfig) => {
      c.model.servedName = "another-model";
    },
  ]) {
    const c = fixture();
    mutate(c);
    expect(() => assertOwnedConfiguration(c, c.root)).toThrow();
  }
});
it("never authorizes signalling a reused PID, changed command, foreign root or changed working directory", () => {
  const saved = {
    root: "/private/owned",
    pid: 123,
    startTicks: "42",
    cwd: fleetRepo,
    commandSha256: "synthetic-hash",
    name: "worker",
  };
  const actual = { startTicks: "42", cwd: fleetRepo, commandSha256: "synthetic-hash", state: "S" };
  expect(sameProcess(saved, actual, saved.root)).toBe(true);
  for (const value of [
    { ...actual, startTicks: "43" },
    { ...actual, cwd: "/another" },
    { ...actual, commandSha256: "changed" },
  ])
    expect(sameProcess(saved, value, saved.root)).toBe(false);
  expect(sameProcess(saved, actual, "/another")).toBe(false);
});
