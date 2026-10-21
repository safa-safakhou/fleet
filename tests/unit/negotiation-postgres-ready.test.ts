import { expect, it } from "vitest";
import { waitForOwnedPostgres } from "../../scripts/lib/negotiation-postgres-ready.js";

it("waits for final TCP service rather than the entrypoint temporary socket server", async () => {
  let probes = 0;
  await waitForOwnedPostgres(
    "owned",
    async (args) => {
      expect(args).toEqual([
        "exec",
        "owned",
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "architecture_fixture",
        "-d",
        "postgres",
      ]);
      if (++probes === 1) throw Error("temporary socket server only");
    },
    async () => {},
    3,
  );
  expect(probes).toBe(2);
  await expect(
    waitForOwnedPostgres(
      "owned",
      async () => {
        throw Error("not ready");
      },
      async () => {},
      2,
    ),
  ).rejects.toThrow("OWNED_RESTORE_NOT_READY");
});
