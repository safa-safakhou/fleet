import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runCli } from "../../src/cli.js";
import { HttpLaunchClient, SessionFile } from "../../src/cli-client.js";
import { launchFixture } from "../fixtures/architecture-launch.js";

let f: Awaited<ReturnType<typeof launchFixture>> | undefined, directory: string | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
async function setup(live = true) {
  f = await launchFixture(live);
  const app = f.app;
  const fetcher: typeof fetch = async (url, init) => {
    const response = await app.inject({
      url: new URL(String(url)).pathname,
      method: init?.method === "POST" ? "POST" : "GET",
      headers: init?.headers as Record<string, string>,
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: {
        "content-type": "application/json",
        ...(response.headers["set-cookie"] ? { "set-cookie": String(response.headers["set-cookie"]) } : {}),
      },
    });
  };
  directory = await mkdtemp(join(tmpdir(), "fleet-cli-"));
  const path = join(directory, "session.json"),
    client = new HttpLaunchClient("http://127.0.0.1:38881", fetcher, new SessionFile(path));
  const output: string[] = [];
  const io = {
    out: (text: string) => output.push(text),
    error: (text: string) => output.push(text),
    readFile: async () => JSON.stringify(f?.spec),
    secret: async () => "fixture-secret-".repeat(4),
  };
  return { client, output, io, path, fetcher };
}
it("authenticates once, persists an owner-only origin-bound session, starts idempotently and logs out", async () => {
  const { client, io, output, path, fetcher } = await setup();
  expect(await runCli(["login"], io, client)).toBe(0);
  expect((await stat(path)).mode & 0o077).toBe(0);
  const next = new HttpLaunchClient("http://127.0.0.1:38881", fetcher, new SessionFile(path));
  expect(await runCli(["launch", "check", "--file", "spec.json"], io, next)).toBe(0);
  expect(await runCli(["launch", "draft", "--file", "spec.json"], io, next)).toBe(0);
  const draft = JSON.parse(output.at(-1) ?? "");
  const args = [
    "launch",
    "start",
    "--draft",
    draft.draftId,
    "--expected-digest",
    draft.digest,
    "--request-id",
    randomUUID(),
  ];
  expect(await runCli(args, io, next)).toBe(0);
  const first = output.at(-1);
  expect(await runCli(args, io, next)).toBe(0);
  expect(output.at(-1)).toBe(first);
  expect((await f?.pool.query("SELECT * FROM turns"))?.rowCount).toBe(0);
  expect(await runCli(["logout"], io, next)).toBe(0);
  await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await runCli(["architectures", "list"], io, next)).toBe(1);
  expect(output.join(" ")).not.toContain("fixture-secret");
  expect(output.join(" ")).not.toContain("fleet_session");
});
it("preserves API readiness codes and refuses an unsupported version", async () => {
  const { client, io, output } = await setup(false);
  await client.login(await io.secret());
  expect(await runCli(["launch", "check", "--file", "spec.json"], io, client)).toBe(3);
  expect(
    JSON.parse(output.at(-1) ?? "").checks.some((c: { code: string }) => c.code === "LIVE_EXECUTION_DISABLED"),
  ).toBe(true);
  if (!f) throw Error("FIXTURE_REQUIRED");
  f.spec.architecture.version = "missing";
  expect(await runCli(["launch", "check", "--file", "spec.json"], io, client)).toBe(2);
  expect(output.at(-1)).toContain("UNSUPPORTED_ARCHITECTURE");
});
it("rejects cross-origin session reuse and unsafe session permissions", async () => {
  const { client, path, io, fetcher } = await setup();
  await client.login(await io.secret());
  const other = new HttpLaunchClient("http://127.0.0.1:38882", fetcher, new SessionFile(path));
  await expect(other.catalog()).rejects.toThrow("SESSION_ORIGIN_MISMATCH");
  await chmod(path, 0o644);
  await expect(new SessionFile(path).load()).rejects.toThrow("INVALID_SESSION_FILE");
});
