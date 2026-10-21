import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeCode } from "../src/domain.js";
import { negotiationCLI } from "../src/negotiation-cli.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let disconnect: (() => Promise<void>) | undefined;
// Preview has no provider/game/database capability. An owned native execution
// composition is deliberately not loaded from an arbitrary path or environment.
try {
  const result = await negotiationCLI(process.argv.slice(2), {
    readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    sourceRevisions: async () => {
      try {
        return JSON.parse(await readFile(resolve(root, "../bundle-sources.json"), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return {
        fleet: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        pact: execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve(root, "../pact"), encoding: "utf8" }).trim(),
      };
    },
    prepareExecution: async (preparedPath, protocol, grant) => {
      const { createWindowsNegotiationExecution } = await import("./lib/negotiation-windows.js");
      const owned = await createWindowsNegotiationExecution(preparedPath, protocol, grant);
      disconnect = owned.disconnect;
      return owned.ports;
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${safeCode(error)}\n`);
  process.exitCode = 1;
} finally {
  await disconnect?.();
}
