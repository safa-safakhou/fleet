import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { scanArchitectureGraph } from "../../scripts/check-boundaries.mjs";
import { MaintenanceRegistry } from "../../src/platform/maintenance.js";
import { DispatchScheduler } from "../../src/platform/scheduling.js";

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "fleet-architecture-boundaries-"));
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        paths: { "@engine/*": ["./src/engines/*"] },
      },
      include: ["src/**/*.ts", "web/**/*.ts"],
    }),
  );
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source);
  }
  return root;
}
it("rejects sibling architecture imports including aliases reexports and dynamic imports", async () => {
  const root = await fixture({
    "src/engines/a/engine.ts": 'export {b} from "@engine/b/engine.js"; const later=import("../b/engine.js");',
    "src/engines/b/engine.ts": "export const b=1;",
  });
  try {
    const found = await scanArchitectureGraph(root);
    expect(found.some((x) => x.includes("SIBLING_ENGINE") && x.includes("src/engines/a/engine.ts"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects engine concrete capabilities and platform or UI implementation imports", async () => {
  const root = await fixture({
    "src/engines/a/engine.ts": 'import pg from "pg"; type Secret=import("../../vault.js").Secret;',
    "src/vault.ts": "export type Secret=string;",
    "src/platform/host.ts": 'export * from "../engines/a/engine.js";',
    "web/view.ts": 'const engine=require("../src/engines/a/engine.js");',
  });
  try {
    const found = await scanArchitectureGraph(root);
    for (const code of ["ENGINE_CONCRETE_DEPENDENCY", "PLATFORM_ENGINE_DEPENDENCY", "UI_ENGINE_DEPENDENCY"])
      expect(found.some((x) => x.includes(code))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("permits only public ports own internals and explicit versioned mechanisms", async () => {
  const root = await fixture({
    "src/engines/a/engine.ts":
      'import type {Observation} from "../../platform/contracts.js";export {step} from "../../modules/decision-step/v1/engine.js";',
    "src/platform/contracts.ts": "export type Observation=unknown;",
    "src/modules/decision-step/v1/engine.ts": "export const step=1;",
  });
  try {
    expect(await scanArchitectureGraph(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("bounds failing maintenance and honors cancellation before subsequent hooks", async () => {
  const registry = new MaintenanceRegistry(),
    seen: string[] = [];
  registry.register({
    id: "failure",
    run: async (limit) => {
      expect(limit).toBe(3);
      throw Error("FAILED");
    },
  });
  registry.register({
    id: "cleanup",
    run: async (limit) => {
      seen.push("cleanup");
      return limit;
    },
  });
  const result = await registry.run(3, new AbortController().signal);
  expect(result.map((x) => x.code)).toEqual(["MAINTENANCE_FAILED", "OK"]);
  expect(seen).toEqual(["cleanup"]);
  const stop = new AbortController();
  stop.abort();
  expect(await registry.run(3, stop.signal)).toEqual([]);
  expect(() => registry.register({ id: "failure", run: async () => 0 })).toThrow("DUPLICATE_MAINTENANCE");
  await expect(registry.run(0, new AbortController().signal)).rejects.toThrow("INVALID_MAINTENANCE_LIMIT");
});
it("preserves alternating legacy/platform priority and fills only available slots", async () => {
  const scheduler = new DispatchScheduler(),
    seen: string[] = [];
  const tick = async () => {
    let slots = 3;
    await scheduler.dispatch({
      legacy: async () => {
        if (slots) {
          seen.push("legacy");
          slots--;
        }
      },
      platform: async () => {
        if (!slots) return false;
        seen.push("platform");
        slots--;
        return true;
      },
      hasCapacity: () => slots > 0,
    });
  };
  await tick();
  await tick();
  expect(seen).toEqual(["platform", "legacy", "platform", "legacy", "platform", "platform"]);
});

it("rejects unresolved dynamic loading in protected implementation layers", async () => {
  const root = await fixture({
    "src/engines/a/engine.ts": "declare const name:string;const engine=import(name);",
    "src/platform/host.ts": "declare const name:string;const engine=import(name);",
  });
  try {
    const found = await scanArchitectureGraph(root);
    expect(found.filter((x) => x.includes("DYNAMIC_")).length).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
