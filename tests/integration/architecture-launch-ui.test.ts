import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { ArchitectureFields } from "../../web/architecture-fields.js";
import { LaunchController } from "../../web/launch.js";
import { launchFixture } from "../fixtures/architecture-launch.js";

let f: Awaited<ReturnType<typeof launchFixture>>;
afterEach(async () => {
  await f?.close();
});
it("uses the authenticated launcher for exact-version save, edit, resume, check and explicit start", async () => {
  f = await launchFixture();
  const c = new LaunchController(f.api);
  c.edit(f.spec);
  const d = await c.save();
  expect((await f.store.cohort(f.id)).state).toBe("draft");
  expect(f.board.connections).toBe(0);
  c.edit({ ...f.spec, architectureConfig: { depth: 3 } });
  const edited = await c.save();
  expect(edited.digest).not.toBe(d.digest);
  const resumed = new LaunchController(f.api);
  await resumed.resume(d.draftId);
  expect(resumed.spec.architecture).toEqual({ id: "fixture", version: "2" });
  expect(resumed.spec.architectureConfig).toEqual({ depth: 3 });
  expect((await resumed.check()).ready).toBe(true);
  const first = await resumed.start();
  expect(await resumed.start()).toEqual(first);
  expect((await f.store.cohort(f.id)).state).toBe("running");
  expect((await f.pool.query("SELECT * FROM turns")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it("rejects stale drafts and leaves accounts inactive", async () => {
  f = await launchFixture();
  const a = new LaunchController(f.api),
    b = new LaunchController(f.api);
  a.edit(f.spec);
  const draft = await a.save();
  await a.check();
  await b.resume(draft.draftId);
  b.edit({ ...f.spec, architectureConfig: { depth: 1 } });
  await b.save();
  await expect(a.start()).rejects.toThrow("STALE_LAUNCH_DIGEST");
  expect((await f.store.cohort(f.id)).state).toBe("draft");
});
it.each([
  [false, true, "LIVE_EXECUTION_DISABLED"],
  [true, false, "PROVIDER_NOT_CONFIGURED"],
] as const)("preserves server readiness codes (%s/%s)", async (live, provider, code) => {
  f = await launchFixture(live, provider);
  const c = new LaunchController(f.api);
  c.edit(f.spec);
  await c.save();
  const check = await c.check();
  expect(check.checks.some((x) => x.code === code)).toBe(true);
  await expect(c.start()).rejects.toThrow("LAUNCH_NOT_READY");
});
it("reports absent accounts and uses manifest triggers rather than architecture names", async () => {
  f = await launchFixture();
  const c = new LaunchController(f.api);
  c.edit({ ...f.spec, accounts: { agentIds: [randomUUID()] } });
  expect((await c.check()).checks.some((x) => x.code === "ACCOUNTS_INCOMPLETE")).toBe(true);
  const catalog = await f.api<{
    architectures: { ref: { id: string; version: string }; triggers: string[]; configSchema: unknown }[];
  }>("/architectures");
  expect(catalog.architectures.filter((x) => x.ref.id === "fixture")).toHaveLength(2);
  expect(catalog.architectures.find((x) => x.ref.id === "fixture")?.triggers).toContain("event");
  expect(catalog.architectures.find((x) => x.ref.id === "legacy-loop")?.triggers).not.toContain("event");
  const html = renderToStaticMarkup(
    ArchitectureFields({
      schema: catalog.architectures.find((x) => x.ref.id === "fixture")?.configSchema,
      value: { depth: 2 },
      onChange() {},
    }),
  );
  expect(html).toContain('max="3"');
});
