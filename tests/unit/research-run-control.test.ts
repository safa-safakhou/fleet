import { expect, test } from "vitest";

const load = () => import("../../src/research/orchestration/run-control.js");
test("startup grace begins at actual activation while the absolute deadline wins", async () => {
  const { runClockFailure } = await load();
  expect(runClockFailure({ now: 110000, endsAt: 1000000, activatedAt: 100000, hasTurn: false })).toBeUndefined();
  expect(runClockFailure({ now: 160001, endsAt: 1000000, activatedAt: 100000, hasTurn: false })).toBe(
    "NO_INITIAL_NATIVE_TURN",
  );
  expect(runClockFailure({ now: 110000, endsAt: 110000, activatedAt: 100000, hasTurn: false })).toBe(
    "ONE_HOUR_COMPLETE",
  );
  expect(runClockFailure({ now: 160001, endsAt: 1000000, activatedAt: 100000, hasTurn: true })).toBeUndefined();
});
test("census scopes command ownership through turns and binds cohort parameters", async () => {
  const { readRunCensus } = await load(),
    seen: { sql: string; values: unknown[] }[] = [];
  const db = {
    query: async (sql: string, values: unknown[]) => {
      seen.push({ sql, values });
      return { rows: sql.includes("count(*)") ? [{ n: 2 }] : [] };
    },
  };
  const result = await readRunCensus(db, "synthetic-cohort");
  expect(result.commands).toBe(2);
  const command = seen.find((x) => x.sql.includes("platform_commands"))!;
  expect(command.sql).toContain("JOIN turns t ON t.id=c.turn_id");
  expect(command.sql).toContain("t.cohort_id=$1");
  expect(command.sql).not.toContain("c.cohort_id");
  expect(seen.every((x) => JSON.stringify(x.values) === '["synthetic-cohort"]')).toBe(true);
});
test("Docker invocation is independent of HOME and rejects nonlocal endpoints", async () => {
  const { localDockerCommand } = await load();
  expect(
    localDockerCommand("/opt/homebrew/bin/docker", "unix:///synthetic/docker.sock", ["exec", "owned", "pg_dump"]),
  ).toEqual({
    file: "/opt/homebrew/bin/docker",
    args: ["--host", "unix:///synthetic/docker.sock", "exec", "owned", "pg_dump"],
  });
  expect(() => localDockerCommand("docker", "unix:///synthetic/docker.sock", [])).toThrow("LOCAL_DOCKER_REQUIRED");
  expect(() => localDockerCommand("/opt/homebrew/bin/docker", "tcp://remote:2375", [])).toThrow(
    "LOCAL_DOCKER_REQUIRED",
  );
});
