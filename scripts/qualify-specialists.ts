import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeCode } from "../src/domain.js";
import { specialistQualificationCLI } from "../src/specialist-qualification-cli.js";

// Resolve native assets against the sealed Fleet directory, before importing
// any operational modules. All operational manifest/grant paths are absolute.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let disconnect: (() => Promise<void>) | undefined;
try {
  process.chdir(root);
  const argv = process.argv.slice(2);
  const result =
    argv.length === 2 && argv[0] === "--prepare-roster"
      ? await (await import("./lib/specialist-windows.js")).prepareWindowsSpecialistRoster(
          JSON.parse(await readFile(argv[1] as string, "utf8")),
        )
      : await specialistQualificationCLI(argv, {
          readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
          executeApproved: async (path, protocol, grant) => {
            const owned = await (await import("./lib/specialist-windows.js")).createWindowsSpecialistExecution(
              path,
              protocol,
              grant,
            );
            disconnect = owned.disconnect;
            return owned.execute();
          },
        });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${safeCode(error)}\n`);
  process.exitCode = 1;
} finally {
  await disconnect?.();
}
