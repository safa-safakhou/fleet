import { beforeAll } from "vitest";
import { assertOwnedFixture } from "../architecture-fixture.js";

beforeAll(() =>
  assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? ""),
);

import { afterEach, expect, test } from "vitest";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { buildServer } from "../../src/server.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { fixture } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
test("stores immutable experimental manifests without enrollment or game/model operations", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const repo = new ManifestRepository(f.pool);
  const before = (await f.pool.query("SELECT count(*)::int n FROM cohorts")).rows[0].n;
  const compiled = compileManifest(manifestInput(), capability);
  const id = await repo.save(compiled.manifest);
  expect(id).toBe(compiled.digest);
  expect(await repo.load(id)).toEqual(compiled.manifest);
  expect(await repo.save(compiled.manifest)).toBe(id);
  await expect(f.pool.query("UPDATE research_manifests SET manifest='{}' WHERE digest=$1", [id])).rejects.toThrow(
    "MANIFEST_IMMUTABLE",
  );
  await expect(repo.save({ ...compiled.manifest, status: "qualified" } as never)).rejects.toThrow(
    "INVALID_RESOLVED_MANIFEST",
  );
  expect((await f.pool.query("SELECT count(*)::int n FROM cohorts")).rows[0].n).toBe(before);
});
test("preview requires existing operator authentication and never accepts capability claims from input", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const app = buildServer({
    store: f.store,
    broker: {} as never,
    engine: {} as never,
    origin: "http://fixture",
    operatorSecret: "x".repeat(32),
    liveAllowed: false,
    researchCapability: () => capability,
  });
  try {
    expect(
      (await app.inject({ method: "POST", url: "/api/research/manifests/preview", payload: manifestInput() }))
        .statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "http://fixture" },
      payload: { password: "x".repeat(32) },
    });
    const cookie = login.headers["set-cookie"] as string;
    const body = login.json();
    const response = await app.inject({
      method: "POST",
      url: "/api/research/manifests/preview",
      headers: { origin: "http://fixture", cookie: cookie.split(";")[0], "x-csrf-token": body.csrf },
      payload: manifestInput(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().manifest.status).toBe("experimental");
  } finally {
    await app.close();
  }
});
