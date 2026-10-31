import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { connect, migrate } from "../../src/db.js";
import { Vault } from "../../src/vault.js";
import { assertOwnedFixture } from "../architecture-fixture.js";
import { columns, preservationKey, rowHashes, seedLegacy } from "../fixtures/research/pre-migration.js";

async function freePort() {
  const s = createServer();
  await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
  const p = (s.address() as { port: number }).port;
  await new Promise<void>((done) => s.close(() => done()));
  return p;
}
test("packaged_release_stays_disabled through restart while inspection and explicit readiness work", async () => {
  const url = process.env.FLEET_TEST_DATABASE_URL ?? "",
    nonce = process.env.FLEET_ARCHITECTURE_NONCE ?? "";
  await assertOwnedFixture(url, nonce);
  const pool = connect(url),
    root = await mkdtemp(join(tmpdir(), "fleet-package-")),
    keyProof = join(root, "key-proof.json");
  let child: ReturnType<typeof spawn> | undefined,
    networkCalls = 0;
  const { createServer: createHttpServer } = await import("node:http"),
    sentinel = createHttpServer((_req, res) => {
      networkCalls++;
      res.writeHead(503).end();
    });
  await new Promise<void>((done) => sentinel.listen(0, "127.0.0.1", done));
  const gamePort = (sentinel.address() as { port: number }).port;
  try {
    await migrate(pool);
    await seedLegacy(pool);
    const tracked = await columns(pool);
    delete tracked.operator_sessions;
    delete tracked.audit_events;
    const before = await rowHashes(pool, tracked),
      proof = new Vault(preservationKey).encrypt(
        { schemaVersion: "fleet.package-key/v1" },
        "fleet.research.package-key/v1",
      );
    await writeFile(keyProof, JSON.stringify({ ciphertext: proof }), { mode: 0o600 });
    for (let restart = 0; restart < 2; restart++) {
      const port = await freePort(),
        base = `http://127.0.0.1:${port}`;
      const env = {
        PATH: process.env.PATH,
        HOME: root,
        NODE_ENV: "production",
        DATABASE_URL: url,
        FLEET_OPERATOR_SECRET: "synthetic-operator-secret-00000000",
        FLEET_VAULT_KEY: preservationKey,
        FLEET_ORIGIN: base,
        PORT: String(port),
        FLEET_STATE_PATH: root,
        FLEET_GAME_BASE_URL: `http://127.0.0.1:${gamePort}`,
        OLLAMA_BASE_URL: `http://127.0.0.1:${gamePort}`,
        FLEET_ALLOW_HTTP: "1",
        FLEET_RESEARCH_KEY_PROOF_FILE: keyProof,
        FLEET_RESEARCH_REQUIRE_VECTOR: "1",
      };
      const logs: string[] = [];
      child = spawn(process.execPath, ["dist/server/research/package.js"], {
        env,
        cwd: process.env.FLEET_PACKAGE_COMPILED_ROOT ?? resolve("."),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (x) => logs.push(String(x)));
      child.stderr?.on("data", (x) => logs.push(String(x)));
      let ready = false;
      for (let n = 0; n < 100; n++) {
        try {
          if ((await fetch(`${base}/health`)).ok) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) break;
        await new Promise((done) => setTimeout(done, 50));
      }
      expect(ready, logs.join("")).toBe(true);
      expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ liveEnabled: false });
      const readiness = await fetch(`${base}/research/ready`);
      expect(await readiness.json()).toMatchObject({ ready: true, executionEnabled: false });
      const login = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ password: env.FLEET_OPERATOR_SECRET }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0],
        csrf = (await login.json()).csrf;
      expect((await fetch(`${base}/api/cohorts`, { headers: { cookie } })).status).toBe(200);
      const denied = await fetch(`${base}/api/cohorts`, {
        method: "POST",
        headers: { cookie, origin: base, "x-csrf-token": csrf, "content-type": "application/json" },
        body: JSON.stringify({
          name: "must not enroll",
          count: 1,
          intervalMinutes: 15,
          seed: "fixture",
          strategies: ["guardian"],
        }),
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({ code: "RESEARCH_PACKAGE_READ_ONLY" });
      await writeFile(keyProof, JSON.stringify({ ciphertext: "invalid" }), { mode: 0o600 });
      const bad = await fetch(`${base}/research/ready`);
      expect(bad.status).toBe(503);
      expect((await bad.json()).reasons).toContain("ARTIFACT_KEY_UNAVAILABLE");
      await writeFile(keyProof, JSON.stringify({ ciphertext: proof }), { mode: 0o600 });
      expect(logs.join("")).not.toContain(preservationKey);
      expect(logs.join("")).not.toContain(env.FLEET_OPERATOR_SECRET);
      child.kill("SIGTERM");
      await new Promise((done) => child!.once("exit", done));
      child = undefined;
      expect((await rowHashes(pool, tracked)).digest).toBe(before.digest);
    }
    await pool.query("DROP EXTENSION vector CASCADE");
    const { packageReadiness } = await import("../../src/research/qualification/readiness.js");
    expect((await packageReadiness(pool, new Vault(preservationKey), keyProof, true)).reasons).toContain(
      "PGVECTOR_UNAVAILABLE",
    );
    expect(networkCalls).toBe(0);
  } finally {
    child?.kill("SIGKILL");
    await new Promise<void>((done) => sentinel.close(() => done()));
    await pool.end();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
