import { expect, it } from "vitest";
import { runCli } from "../../src/cli.js";
import { HttpLaunchClient } from "../../src/cli-client.js";

it("rejects credential arguments and invalid launch JSON without contacting a server", async () => {
  const output: string[] = [];
  const io = {
    out: (s: string) => output.push(s),
    error: (s: string) => output.push(s),
    readFile: async () => "{broken",
    secret: async () => "private",
  };
  const client = new HttpLaunchClient("http://127.0.0.1:38881", async () => {
    throw Error("must not connect");
  });
  expect(await runCli(["login", "--password", "private"], io, client)).toBe(2);
  expect(await runCli(["launch", "check", "--file", "fixture.json"], io, client)).toBe(2);
  expect(output.join(" ")).not.toContain("private");
});
it("propagates origin, cookie and CSRF and never follows redirects", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return String(url).endsWith("/login")
      ? new Response(JSON.stringify({ csrf: "csrf-value" }), {
          headers: { "set-cookie": "fleet_session=secret-cookie; HttpOnly" },
        })
      : new Response(JSON.stringify({ valid: false, ready: false, checks: [], digest: "d" }));
  };
  const client = new HttpLaunchClient("http://127.0.0.1:38881", fetcher);
  await client.login("secret-password");
  await client.check({});
  expect(requests[1].init?.redirect).toBe("error");
  expect(requests[1].init?.headers).toMatchObject({
    origin: "http://127.0.0.1:38881",
    cookie: "fleet_session=secret-cookie",
    "x-csrf-token": "csrf-value",
  });
  expect(() => new HttpLaunchClient("https://secret:password@example.com")).toThrow("INVALID_FLEET_ORIGIN");
});
it("returns bounded error codes without leaking transport messages or server bodies", async () => {
  const output: string[] = [];
  const io = {
    out: (s: string) => output.push(s),
    error: (s: string) => output.push(s),
    readFile: async () => "{}",
    secret: async () => "private",
  };
  const client = new HttpLaunchClient("http://127.0.0.1:38881", async () => {
    throw Error("secret-network-url");
  });
  expect(await runCli(["architectures", "list"], io, client)).toBe(1);
  expect(output.join(" ")).not.toContain("secret-network-url");
});
