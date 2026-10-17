import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { assertCoreBoundary, scanExtensionDirectories } from "../../scripts/check-boundaries.mjs";

it("rejects forbidden imports in deeply nested core and engine fixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-boundary-"));
  try {
    const directory = join(root, "src/engines/nested/fixture");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "bad.ts"), 'export { game } from "../../../environments/foreign.js";');
    await expect(scanExtensionDirectories(root)).rejects.toThrow(
      "GAME_DEPENDENCY_IN_CORE:src/engines/nested/fixture/bad.ts",
    );
    await writeFile(join(directory, "bad.ts"), "export type Fixture = {id:string};");
    expect(await scanExtensionDirectories(root)).toEqual(["src/engines/nested/fixture/bad.ts"]);
  } finally {
    await rm(root, { recursive: true });
  }
});
it("rejects dynamic and static integration imports", () => {
  for (const source of [
    'import { game } from "../games/foreign/game.js"',
    'const game=await import("../environments/foreign.js")',
    'const game=require("../games/foreign/game.js")',
  ])
    expect(() => assertCoreBoundary("fixture.ts", source)).toThrow("GAME_DEPENDENCY_IN_CORE");
  expect(() => assertCoreBoundary("fixture.ts", 'import type {Observation} from "./contracts.js"')).not.toThrow();
});
