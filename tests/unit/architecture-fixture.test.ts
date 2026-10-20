import { expect, it } from "vitest";
import {
  assertFixtureUrl,
  childFixtureEnvironment,
  createOwnedFixture,
} from "../../scripts/test-architecture-offline.js";
import { assertOwnedFixture } from "../architecture-fixture.js";

it("cleans an owned container when interrupted during creation before initializing databases", async () => {
  const controller = new AbortController(),
    stopped: string[] = [];
  let nonce = "",
    initialized = false;
  const runtime = {
    start: async (value: string) => {
      nonce = value;
      controller.abort();
      return "interrupted-owned";
    },
    port: async () => 34001,
    owner: async () => nonce,
    initialize: async () => {
      initialized = true;
    },
    stop: async (id: string) => {
      stopped.push(id);
    },
  };
  await expect(createOwnedFixture(runtime, controller.signal)).rejects.toThrow("FIXTURE_INTERRUPTED");
  expect(initialized).toBe(false);
  expect(stopped).toEqual(["interrupted-owned"]);
});

it("rejects retained ports and non-loopback databases before connecting", () => {
  for (const url of [
    "postgres://fixture:test@127.0.0.1:5437/fleet_test",
    "postgres://fixture:test@127.0.0.1:5451/pact_test",
    "postgres://fixture:test@example.test:34001/fleet_test",
    "postgres://fixture:test@127.0.0.1:34001/production",
  ])
    expect(() => assertFixtureUrl(url)).toThrow("OWNED_FIXTURE_REQUIRED");
  expect(assertFixtureUrl("postgres://fixture:test@127.0.0.1:34001/fleet_test").port).toBe("34001");
});

it("rejects foreign ownership before destructive setup can start", async () => {
  let mutated = false;
  await expect(
    (async () => {
      await assertOwnedFixture("postgres://fixture:test@127.0.0.1:34001/fleet_test", "a".repeat(64), async () =>
        "b".repeat(64),
      );
      mutated = true;
    })(),
  ).rejects.toThrow("FIXTURE_OWNERSHIP_MISMATCH");
  expect(mutated).toBe(false);
});

it("exports only child fixture URLs and excludes live providers and secrets", () => {
  const env = childFixtureEnvironment(
    { fleetUrl: "postgres://owned/fleet_test", pactUrl: "postgres://owned/pact_test", nonce: "a".repeat(64) },
    {
      PATH: "/usr/bin",
      HOME: "/fixture",
      FLEET_TEST_DATABASE_URL: "retained",
      OPENAI_API_KEY: "private",
      FLEET_OLLAMA_URL: "http://live",
      NODE_OPTIONS: "--import=unsafe",
    },
  );
  expect(env.FLEET_TEST_DATABASE_URL).toBe("postgres://owned/fleet_test");
  expect(env.TEST_DATABASE_URL).toBe("postgres://owned/pact_test");
  expect(env.FLEET_ARCHITECTURE_NONCE).toBe("a".repeat(64));
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.FLEET_OLLAMA_URL).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
});

it("cleans only the labelled owned container after initialization fails", async () => {
  const stopped: string[] = [];
  let nonce = "";
  const runtime = {
    start: async (value: string) => {
      nonce = value;
      return "owned-container";
    },
    port: async () => 34001,
    owner: async () => nonce,
    initialize: async () => {
      throw Error("SEED_FAILED");
    },
    stop: async (id: string) => {
      stopped.push(id);
    },
  };
  await expect(createOwnedFixture(runtime)).rejects.toThrow("SEED_FAILED");
  expect(stopped).toEqual(["owned-container"]);
});

it("refuses cleanup when a container no longer carries its ownership label", async () => {
  const stopped: string[] = [];
  const runtime = {
    start: async () => "foreign-container",
    port: async () => 5437,
    owner: async () => "foreign",
    initialize: async () => {},
    stop: async (id: string) => {
      stopped.push(id);
    },
  };
  await expect(createOwnedFixture(runtime)).rejects.toThrow("OWNED_FIXTURE_REQUIRED");
  expect(stopped).toEqual([]);
});
